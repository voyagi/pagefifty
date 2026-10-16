import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeClock, createScriptedTed } from '../../test/ted-stub.ts';
import { tedNoticeXmlUrl } from '../snapshot/transport.ts';
import { runCapture } from './run.ts';
import { GAP_MS } from './ted-client.ts';
import { TED_SEARCH_URL } from './ted-search.ts';

const START = Date.parse('2026-10-11T08:00:00Z');
const NOTICES = ['609955-2026', '600779-2026', '600554-2026', '600457-2026'];
const FLAKY = '600554-2026';
const THROTTLED = '600779-2026';

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('a run against a throttling, flaky TED', () => {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-capture-ted-run-'));
	roots.push(root);
	const folder = join(root, 'examples', '2026-10-11');
	const clock = createFakeClock(START);
	const ted = createScriptedTed({
		clock,
		notices: NOTICES,
		script: {
			[TED_SEARCH_URL]: [{ status: 429, headers: { 'retry-after': '3' } }],
			[tedNoticeXmlUrl(FLAKY)]: [{ status: 502 }],
			[tedNoticeXmlUrl(THROTTLED)]: [{ status: 429 }]
		}
	});
	const lines: string[] = [];
	let code: number;

	beforeAll(async () => {
		mkdirSync(join(root, 'examples'));
		code = await runCapture({
			root,
			transport: ted,
			clock,
			argv: [],
			env: {},
			head: '0123456789abcdef0123456789abcdef01234567',
			pid: 4343,
			isAlive: (pid) => pid === 4343,
			log: (line) => lines.push(line)
		});
	});

	it('completes the capture with every notice written', () => {
		expect(code, lines.join('\n')).toBe(0);
		expect(readdirSync(join(folder, 'xml')).sort()).toEqual(
			[...NOTICES].sort().map((notice) => `${notice}.xml`)
		);
	});

	it('starts each request at least a second after the last, one at a time', () => {
		const starts = ted.calls().map(({ at }) => at);
		expect(starts).toHaveLength(8);
		for (let index = 1; index < starts.length; index += 1) {
			expect(starts[index] - starts[index - 1]).toBeGreaterThanOrEqual(GAP_MS);
		}
		expect(ted.maxInFlight()).toBe(1);
	});

	it("waits out the search's Retry-After and the XML's backoff before asking again", () => {
		const calls = ted.calls();
		const searches = calls.filter(({ url }) => url === TED_SEARCH_URL);
		expect(searches).toHaveLength(2);
		expect(searches[1].at - searches[0].at).toBeGreaterThanOrEqual(3000);
		const throttled = calls.filter(({ url }) => url === tedNoticeXmlUrl(THROTTLED));
		expect(throttled).toHaveLength(2);
		expect(throttled[1].at - throttled[0].at).toBeGreaterThanOrEqual(5000);
		expect(calls.filter(({ url }) => url === tedNoticeXmlUrl(FLAKY))).toHaveLength(2);
	});

	it("counts what it met in run.json's ted block", () => {
		expect(readJson(join(folder, 'run.json')).ted).toMatchObject({
			status429: 2,
			waited429Ms: 8000,
			retries502: 1,
			failures: 0
		});
	});

	it('logs every attempt in fetch-log.json with its attempt index', () => {
		const log = readJson(join(folder, 'fetch-log.json')).log as {
			category: string;
			attempt: number;
			status: number;
		}[];
		expect(log.map(({ category, attempt, status }) => [category, attempt, status])).toEqual([
			['search', 0, 429],
			['search', 1, 200],
			['xml', 0, 200],
			['xml', 0, 502],
			['xml', 1, 200],
			['xml', 0, 429],
			['xml', 1, 200],
			['xml', 0, 200]
		]);
	});
});
