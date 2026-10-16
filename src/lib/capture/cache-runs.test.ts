import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { capturePath } from '../../test/fixtures/node.ts';
import { createFakeClock, createScriptedTed } from '../../test/ted-stub.ts';
import { tedNoticeXmlUrl } from '../snapshot/transport.ts';
import { runCapture } from './run.ts';
import { TED_SEARCH_URL, type SearchHit } from './ted-search.ts';

const START = Date.parse('2026-10-11T08:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const PRE_CACHED = '600779-2026';
const FIRST_DAY = ['600457-2026', '600779-2026', '609955-2026'];
const NEXT_DAY = [...FIRST_DAY, '600554-2026'];

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

function firstDayListing(): string {
	const listing = JSON.parse(
		readFileSync(join('examples', '2026-09-15', 'notices.json'), 'utf8')
	) as { notices: SearchHit[] };
	const notices = listing.notices.filter((hit) =>
		FIRST_DAY.includes(hit['publication-number'] as string)
	);
	return JSON.stringify({ notices, totalNoticeCount: notices.length, timedOut: false });
}

describe('the XML cache across runs', () => {
	it('a cached notice is never requested again, in the same run or a later one', async () => {
		const root = mkdtempSync(join(tmpdir(), 'pagefifty-capture-cache-'));
		roots.push(root);
		mkdirSync(join(root, 'examples'));
		mkdirSync(join(root, '.capture-cache', 'xml'), { recursive: true });
		writeFileSync(
			join(root, '.capture-cache', 'xml', `${PRE_CACHED}.xml`),
			readFileSync(capturePath(PRE_CACHED))
		);
		const clock = createFakeClock(START);
		// One stub for both runs: the first search lists three notices, the next day's lists four.
		const ted = createScriptedTed({
			clock,
			notices: NEXT_DAY,
			script: { [TED_SEARCH_URL]: [{ status: 200, body: firstDayListing() }] }
		});
		const lines: string[] = [];
		const run = () =>
			runCapture({
				root,
				transport: ted,
				clock,
				argv: [],
				env: {},
				head: '0123456789abcdef0123456789abcdef01234567',
				pid: 4646,
				isAlive: (pid) => pid === 4646,
				log: (line) => lines.push(line)
			});
		const xmlAsked = (from: number) =>
			ted
				.calls()
				.slice(from)
				.filter(({ method }) => method === 'GET')
				.map(({ url }) => url);

		expect(await run(), lines.join('\n')).toBe(0);
		expect(xmlAsked(0)).toEqual(
			['600457-2026', '609955-2026'].map((notice) => tedNoticeXmlUrl(notice))
		);
		const firstRunCalls = ted.calls().length;

		await clock.sleep(DAY_MS);
		expect(await run(), lines.join('\n')).toBe(0);
		expect(xmlAsked(firstRunCalls)).toEqual([tedNoticeXmlUrl('600554-2026')]);
		const nextDay = JSON.parse(
			readFileSync(join(root, 'examples', '2026-10-12', 'run.json'), 'utf8')
		) as { ted: { cacheHits: number; xmlRequests: number } };
		expect(nextDay.ted).toMatchObject({ cacheHits: 3, xmlRequests: 1 });
	});
});
