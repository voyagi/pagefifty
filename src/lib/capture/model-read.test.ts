// The model step driven directly with a gate from createMeteredGate, stub keys and the stub provider,
// on records read from the tracked 2026-09-15 capture. Every step gets its own temp root.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { capturePath } from '../../test/fixtures/node.ts';
import { readReplyFixture, type RecordedReply } from '../../test/fixtures/replies.ts';
import { createStubProvider, syntheticReply } from '../../test/provider-stub.ts';
import { createFakeClock } from '../../test/ted-stub.ts';
import type { NoticeRecord } from '../ingest/record.ts';
import { readNotice } from '../ingest/read-notice.ts';
import { resolveModes } from '../server/transport-mode.ts';
import type { ReadingsFile } from '../snapshot/readings.ts';
import { createMeteredGate } from './metered.ts';
import { createModelReadStep, readingKey } from './model-read.ts';
import { chatBody, userMessage } from './token-factory.ts';

const START = Date.parse('2026-09-15T08:00:00Z');
const KEYS = Object.freeze({ tokenFactory: 'pf-stub-nebius-0b5d', tavily: 'pf-stub-tavily-c2e8' });
const GERMAN = readReplyFixture('de-610242-thinking-off');

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

function trackedRecord(notice: string): NoticeRecord {
	const result = readNotice(new Uint8Array(readFileSync(capturePath(notice))), {
		noticeNumber: notice
	});
	if (!result.ok) throw new Error(`${notice} did not read: ${result.detail}`);
	return result.record;
}

const renamed = (notice: string, as: string): NoticeRecord => ({
	...trackedRecord(notice),
	noticeNumber: as
});

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-model-read-'));
	roots.push(root);
	return root;
}

async function stepRun(
	records: readonly NoticeRecord[],
	options: { replies?: readonly RecordedReply[]; root?: string } = {}
) {
	const root = options.root ?? tempRoot();
	const lines: string[] = [];
	const log = (line: string) => lines.push(line);
	const gate = createMeteredGate({
		modes: resolveModes(true, { PAGEFIFTY_LIVE: '1' }),
		cap: 100,
		log,
		keys: KEYS
	});
	const provider = createStubProvider({ replies: options.replies ?? [] });
	const step = createModelReadStep({
		transport: provider,
		root,
		clock: createFakeClock(START),
		log
	});
	const output = await step({ gate, records });
	if (!output) throw new Error('the model step returned no output');
	return { file: output.value as ReadingsFile, run: output.record, provider, lines, root };
}

const sentMessages = (provider: ReturnType<typeof createStubProvider>) =>
	provider
		.calls()
		.map((call) => (call.body as { messages: { content: string }[] }).messages[1].content);

const storeDir = (root: string, notice: string) => join(root, '.capture-cache', 'readings', notice);

describe('the order the model step sends in', () => {
	it('the step sends lots by year, then running number, then lot id', async () => {
		// Named so that plain string order (1-2027, 600457-2026, 610000-2026, 700000-2025) differs
		// from year order.
		const late = renamed('610242-2026', '1-2027');
		const early = renamed('634398-2026', '700000-2025');
		const middle = renamed('629755-2026', '610000-2026');
		const manyLots = trackedRecord('600457-2026');
		const reversed: NoticeRecord = { ...manyLots, lots: [...manyLots.lots].reverse() };
		const records = [late, reversed, middle, early];
		const replies = records.flatMap((record) =>
			record.lots.map((lot) => syntheticReply(chatBody(lot.criteria), []))
		);
		const run = await stepRun(records, { replies });
		const byLotId = [...manyLots.lots].sort((a, b) => (a.id < b.id ? -1 : 1));
		const manyTexts = [...new Set(byLotId.map((lot) => userMessage(lot.criteria)))];
		expect(manyTexts.length).toBeGreaterThan(1);
		expect(sentMessages(run.provider)).toEqual([
			userMessage(early.lots[0].criteria),
			...manyTexts,
			userMessage(middle.lots[0].criteria),
			userMessage(late.lots[0].criteria)
		]);
	});
});

describe('the reading key and the store', () => {
	it('the reading key is the SHA-256 of the exact text sent', async () => {
		const run = await stepRun([trackedRecord('610242-2026')], { replies: [GERMAN] });
		const [sent] = sentMessages(run.provider);
		const digest = createHash('sha256').update(Buffer.from(sent, 'utf8')).digest('hex');
		expect(readingKey('610242-2026', sent)).toEqual({ notice: '610242-2026', textSha256: digest });
		expect(run.file.readings.map((reading) => reading.textSha256)).toEqual([digest]);
		expect(existsSync(join(storeDir(run.root, '610242-2026'), `${digest}.json`))).toBe(true);
		expect(readdirSync(storeDir(run.root, '610242-2026'))).toEqual([`${digest}.json`]);
		const NBSP = String.fromCodePoint(0xa0);
		const LIGATURE = String.fromCodePoint(0xfb01);
		const pairs = [
			[sent, `${sent} `],
			[sent, ` ${sent}`],
			[sent, sent.replace(' ', '  ')],
			[sent, sent.replace(' ', NBSP)],
			[`${sent}fi`, `${sent}${LIGATURE}`]
		];
		for (const [one, other] of pairs) {
			expect(one).not.toBe(other);
			expect(readingKey('610242-2026', one).textSha256).not.toBe(
				readingKey('610242-2026', other).textSha256
			);
		}
	});

	it('identical text in two notices is read once per notice', async () => {
		const records = [trackedRecord('610242-2026'), renamed('610242-2026', '610243-2026')];
		const run = await stepRun(records, { replies: [GERMAN] });
		expect(run.provider.calls()).toHaveLength(2);
		expect(run.file.readings.map((reading) => reading.notice)).toEqual([
			'610242-2026',
			'610243-2026'
		]);
		expect(run.run.lots).toEqual({ withCriteria: 2, read: 2, reused: 0, notRead: 0 });
	});

	it('a stored reading is reused only for the same model and prompt', async () => {
		const root = tempRoot();
		const records = [trackedRecord('610242-2026')];
		const first = await stepRun(records, { replies: [GERMAN], root });
		const path = join(storeDir(root, '610242-2026'), `${first.file.readings[0].textSha256}.json`);
		expect(existsSync(path)).toBe(true);
		const stored = readFileSync(path, 'utf8');
		for (const change of [{ model: 'nvidia/another-model' }, { promptSha256: '0'.repeat(64) }]) {
			writeFileSync(path, JSON.stringify({ ...JSON.parse(stored), ...change }));
			const run = await stepRun(records, { replies: [GERMAN], root });
			expect(run.provider.calls(), JSON.stringify(change)).toHaveLength(1);
			expect(run.run.lots.reused).toBe(0);
		}
		const again = await stepRun(records, { replies: [GERMAN], root });
		expect(again.provider.calls()).toHaveLength(0);
		expect(again.run.lots).toEqual({ withCriteria: 1, read: 0, reused: 1, notRead: 0 });
		expect(again.run.sends).toBe(0);
		expect(again.file.readings).toEqual(first.file.readings);
	});

	it('a reading is stored whole or not at all', async () => {
		const root = tempRoot();
		const records = [trackedRecord('610242-2026')];
		const first = await stepRun(records, { replies: [GERMAN], root });
		const name = `${first.file.readings[0].textSha256}.json`;
		const path = join(storeDir(root, '610242-2026'), name);
		expect(existsSync(path)).toBe(true);
		expect(readdirSync(storeDir(root, '610242-2026'))).toEqual([name]);
		const stored = readFileSync(path, 'utf8');
		// A write that died before its rename leaves a whole reading under the temp name only.
		rmSync(path);
		writeFileSync(`${path}.${process.pid}.tmp`, stored);
		const afterDeath = await stepRun(records, { replies: [GERMAN], root });
		expect(afterDeath.provider.calls()).toHaveLength(1);
		expect(readFileSync(path, 'utf8')).toBe(stored);
		// A reading cut short at its final name is refused and read again.
		writeFileSync(path, stored.slice(0, stored.length / 2));
		const afterCut = await stepRun(records, { replies: [GERMAN], root });
		expect(afterCut.provider.calls()).toHaveLength(1);
		expect(readFileSync(path, 'utf8')).toBe(stored);
		expect(existsSync(path)).toBe(true);
	});
});
