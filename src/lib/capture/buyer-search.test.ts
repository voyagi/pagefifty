// The buyer search step driven directly with a gate from createMeteredGate, stub keys and the stub
// provider, on records read from the tracked 2026-09-15 capture.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capturePath } from '../../test/fixtures/node.ts';
import { readReplyFixture, type RecordedReply } from '../../test/fixtures/replies.ts';
import { createStubProvider, searchAnswer } from '../../test/provider-stub.ts';
import type { NoticeRecord } from '../ingest/record.ts';
import { readNotice } from '../ingest/read-notice.ts';
import { resolveModes } from '../server/transport-mode.ts';
import type { SearchesFile } from '../snapshot/searches.ts';
import { createBuyerSearchStep, searchesFileOf } from './buyer-search.ts';
import { createMeteredGate } from './metered.ts';
import { searchBody, searchQuery } from './tavily.ts';

const KEYS = Object.freeze({
	tokenFactory: 'not-a-real-nebius-key-for-the-search-step',
	tavily: 'not-a-real-tavily-key-for-the-search-step'
});
const THREE = ['610242-2026', '629755-2026', '634398-2026'];

function trackedRecord(notice: string): NoticeRecord {
	const result = readNotice(new Uint8Array(readFileSync(capturePath(notice))), {
		noticeNumber: notice
	});
	if (!result.ok) throw new Error(`${notice} did not read: ${result.detail}`);
	return result.record;
}

const answerFor = (notice: string, credits: number | null = 1) =>
	searchAnswer(
		searchQuery(trackedRecord(notice)),
		[{ url: `https://awards.example/${notice}`, title: `Awards of ${notice}`, score: 0.5 }],
		credits
	);

async function stepRun(
	records: readonly NoticeRecord[],
	options: { searches?: readonly RecordedReply[]; cap?: number; live?: boolean } = {}
) {
	const lines: string[] = [];
	const log = (line: string) => lines.push(line);
	const gate = createMeteredGate({
		modes: resolveModes(options.live ?? true, { PAGEFIFTY_LIVE: '1' }),
		cap: options.cap ?? 100,
		log,
		keys: KEYS
	});
	const provider = createStubProvider({ replies: [], searches: options.searches ?? [] });
	const output = await createBuyerSearchStep({ transport: provider, log })({ gate, records });
	if (!output || output.recordKey !== 'search') throw new Error('the step returned no search');
	return { file: output.value as SearchesFile, output, provider, gate, lines };
}

const statuses = (file: SearchesFile) =>
	file.notices.map((each) =>
		each.status === 'searched' ? `${each.notice} searched` : `${each.notice} ${each.reason}`
	);

describe('the buyer search step', () => {
	it('searches each notice with criteria in the notice once, in publication order', async () => {
		const records = [...THREE].reverse().map(trackedRecord);
		const run = await stepRun(records, { searches: THREE.map((notice) => answerFor(notice)) });
		expect(run.provider.calls().map((call) => call.body)).toEqual(
			THREE.map((notice) => searchBody(trackedRecord(notice)))
		);
		expect(statuses(run.file)).toEqual(THREE.map((notice) => `${notice} searched`));
		expect(run.output.file).toBe('searches.json');
		expect(run.output.record).toEqual({ searches: 3, notSearched: 0, credits: 3 });
	});

	it('after the first refusal the step asks the gate for nothing more', async () => {
		const run = await stepRun(THREE.map(trackedRecord), {
			searches: THREE.map((notice) => answerFor(notice)),
			cap: 1
		});
		expect(run.provider.calls()).toHaveLength(1);
		expect(statuses(run.file)).toEqual([
			'610242-2026 searched',
			'629755-2026 cap-reached',
			'634398-2026 cap-reached'
		]);
		expect(run.gate.record().refusals).toEqual([
			{ provider: 'tavily', operation: 'search', reason: 'the cap of 1 attempts is reached' }
		]);
	});

	it('a dry-run answer ends the search with one WOULD line', async () => {
		const run = await stepRun(THREE.map(trackedRecord), { live: false });
		expect(run.provider.calls()).toEqual([]);
		expect(run.lines.filter((line) => line.includes('WOULD'))).toEqual([
			'capture: (dry-run) WOULD call tavily search'
		]);
		expect(statuses(run.file)).toEqual(THREE.map((notice) => `${notice} dry-run`));
		expect(run.output.file).toBeNull();
		expect(run.output.record).toEqual({ searches: 0, notSearched: 3, credits: 0 });
	});

	it('the run counts credits, and none once an answer reports none', async () => {
		const run = await stepRun(THREE.map(trackedRecord), {
			searches: [answerFor(THREE[0], 1), answerFor(THREE[1], null), answerFor(THREE[2], 2)]
		});
		expect(run.output.record).toEqual({ searches: 3, notSearched: 0, credits: null });
		expect(
			searchesFileOf({ searches: 2, credits: 2, notices: run.file.notices.slice(0, 2) }).run
		).toEqual({ searches: 2, notSearched: 0, credits: 2 });
	});

	it('never searches a notice with no criteria in the notice', async () => {
		const record = trackedRecord('610242-2026');
		const bare = { ...record, lots: record.lots.map((lot) => ({ ...lot, criteria: [] })) };
		const run = await stepRun([bare], { searches: [readReplyFixture('tavily-610242-buyer')] });
		expect(run.provider.calls()).toEqual([]);
		expect(run.file.notices).toEqual([]);
		expect(run.output.file).toBeNull();
	});
});
