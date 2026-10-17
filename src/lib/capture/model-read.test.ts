// The model step driven directly with a gate from createMeteredGate, stub keys and the stub provider,
// on records read from the tracked 2026-09-15 capture. Every step gets its own temp root.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { capturePath } from '../../test/fixtures/node.ts';
import { createStubProvider, syntheticReply } from '../../test/provider-stub.ts';
import { createFakeClock } from '../../test/ted-stub.ts';
import type { NoticeRecord } from '../ingest/record.ts';
import { readNotice } from '../ingest/read-notice.ts';
import { resolveModes } from '../server/transport-mode.ts';
import { createMeteredGate } from './metered.ts';
import { createModelReadStep } from './model-read.ts';
import type { RecordedReply } from '../../test/fixtures/replies.ts';
import { chatBody, userMessage } from './token-factory.ts';

const START = Date.parse('2026-09-15T08:00:00Z');
const KEYS = Object.freeze({ tokenFactory: 'pf-stub-nebius-0b5d', tavily: 'pf-stub-tavily-c2e8' });

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

async function stepRun(
	records: readonly NoticeRecord[],
	options: { cap?: number; replies?: readonly RecordedReply[] } = {}
) {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-model-read-'));
	roots.push(root);
	const lines: string[] = [];
	const log = (line: string) => lines.push(line);
	const gate = createMeteredGate({
		modes: resolveModes(true, { PAGEFIFTY_LIVE: '1' }),
		cap: options.cap ?? 100,
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
	return { output, provider, gate, lines, root };
}

const sentMessages = (provider: ReturnType<typeof createStubProvider>) =>
	provider
		.calls()
		.map((call) => (call.body as { messages: { content: string }[] }).messages[1].content);

describe('the order the model step sends in', () => {
	it('the step sends lots by year, then running number, then lot id', async () => {
		const renamed = (notice: string, as: string): NoticeRecord => ({
			...trackedRecord(notice),
			noticeNumber: as
		});
		// Named so that plain string order (0001-2027, 610000-2026, 700000-2025) differs from year order.
		const late = renamed('610242-2026', '0001-2027');
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
