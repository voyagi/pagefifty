import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createFakeClock, createScriptedTed } from '../../test/ted-stub.ts';
import { tedNoticeXmlUrl } from '../snapshot/transport.ts';
import { runCapture } from './run.ts';
import { createTedClient } from './ted-client.ts';
import {
	MAX_SEARCH_PAGE_BYTES,
	searchAll,
	TED_SEARCH_URL,
	xmlTarget,
	type SearchHit
} from './ted-search.ts';

const START = Date.parse('2026-10-11T08:00:00Z');
const NOTICES = ['600457-2026', '600779-2026', '609955-2026'];

type Script = NonNullable<Parameters<typeof createScriptedTed>[0]['script']>;
type Answer = Script[string][number];

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

const listing = new Map(
	(
		JSON.parse(readFileSync(join('examples', '2026-09-15', 'notices.json'), 'utf8')) as {
			notices: SearchHit[];
		}
	).notices.map((hit) => [hit['publication-number'] as string, hit])
);

const hitOf = (notice: string): SearchHit => structuredClone(listing.get(notice) as SearchHit);

function page(notices: readonly SearchHit[], totalNoticeCount: number, timedOut = false): Answer {
	return {
		status: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ notices, totalNoticeCount, timedOut })
	};
}

function search(answers: readonly Answer[]) {
	const clock = createFakeClock(START);
	const ted = createScriptedTed({ clock, notices: NOTICES, script: { [TED_SEARCH_URL]: answers } });
	return searchAll(createTedClient({ transport: ted, clock }), '20260927');
}

async function failedSearch(answers: readonly Answer[]): Promise<string> {
	const result = await search(answers);
	expect(result.ok).toBe(false);
	return result.ok ? '' : result.reason;
}

const [first, second, third] = NOTICES.map(hitOf);

// Each of these listings is one TED could send and none can be trusted as the whole population.
const UNTRUSTED: [string, Answer[]][] = [
	['a page that timed out', [page([first, second, third], 3, true)]],
	['a page that ends short of the stated total', [page([first], 3), page([], 3)]],
	['more hits than the stated total', [page([first, second, third], 2)]],
	['a publication number on two pages', [page([first, second], 3), page([second], 3)]],
	['a page that is not JSON', [{ status: 200, body: '<html>busy</html>' }]],
	[
		'a page over the size cap',
		[{ status: 200, headers: { 'content-length': String(MAX_SEARCH_PAGE_BYTES + 1) }, body: '{}' }]
	]
];

describe('searchAll', () => {
	it('fails a page answering timedOut true, naming the page', async () => {
		const reason = await failedSearch([page([first, second, third], 3, true)]);
		expect(reason).toMatch(/^search page 1: .*timed out/);
	});

	it('fails a listing that ends before the stated total, naming both counts', async () => {
		const reason = await failedSearch([page([first], 3), page([], 3)]);
		expect(reason).toMatch(/^search page 2: /);
		expect(reason).toContain('1 of 3');
	});

	it('fails a listing with more hits than its stated total', async () => {
		const reason = await failedSearch([page([first, second, third], 2)]);
		expect(reason).toMatch(/^search page 1: /);
		expect(reason).toContain('3 hits');
		expect(reason).toContain('total of 2');
	});

	it('fails a listing that names one publication number on two pages', async () => {
		const reason = await failedSearch([page([first, second], 3), page([second], 3)]);
		expect(reason).toMatch(/^search page 2: /);
		expect(reason).toContain('600779-2026');
	});

	it('fails a page that is not JSON, naming the page', async () => {
		expect(await failedSearch([{ status: 200, body: '<html>busy</html>' }])).toMatch(
			/^search page 1: /
		);
	});

	it('fails a page over the 20 MB cap, with or without content-length', async () => {
		const stated = await failedSearch(UNTRUSTED[5][1]);
		expect(stated).toMatch(/^search page 1: content-length \d+ is over the 20971520 byte cap$/);
		const chunk = new Uint8Array(1024 * 1024).fill(0x20);
		const streamed = new ReadableStream<Uint8Array>({
			start(controller) {
				for (let sent = 0; sent <= MAX_SEARCH_PAGE_BYTES; sent += chunk.byteLength) {
					controller.enqueue(chunk);
				}
				controller.close();
			}
		});
		expect(await failedSearch([{ status: 200, body: streamed }])).toBe(
			'search page 1: over the 20971520 byte cap'
		);
	});

	it('collects every page of a listing whose count matches its stated total', async () => {
		const result = await search([page([first, second], 3), page([third], 3)]);
		expect(result).toMatchObject({ ok: true, searchTotal: 3, pages: 2 });
		expect(result.ok ? result.hits.map((hit) => hit['publication-number']) : []).toEqual(NOTICES);
	});
});

describe('a capture run whose search cannot be trusted', () => {
	it.each(UNTRUSTED)('ends with 1 and writes no folder after %s', async (_, answers) => {
		const root = mkdtempSync(join(tmpdir(), 'pagefifty-capture-search-'));
		roots.push(root);
		mkdirSync(join(root, 'examples'));
		const clock = createFakeClock(START);
		const ted = createScriptedTed({
			clock,
			notices: NOTICES,
			script: { [TED_SEARCH_URL]: answers }
		});
		const lines: string[] = [];
		const code = await runCapture({
			root,
			transport: ted,
			clock,
			argv: [],
			env: {},
			head: '0123456789abcdef0123456789abcdef01234567',
			pid: 4545,
			isAlive: (pid) => pid === 4545,
			log: (line) => lines.push(line)
		});
		expect(code, lines.join('\n')).toBe(1);
		expect(readdirSync(join(root, 'examples'))).toEqual([]);
		expect(ted.calls().every(({ method }) => method === 'POST')).toBe(true);
	});
});

describe('xmlTarget', () => {
	const NO_LINK = 'no XML link in the search answer';

	it.each([
		['no links', (hit: SearchHit) => delete hit.links],
		['no links.xml', (hit: SearchHit) => delete (hit.links as Record<string, unknown>).xml],
		['an empty links.xml', (hit: SearchHit) => ((hit.links as Record<string, unknown>).xml = {})],
		[
			'a links.xml with an empty address',
			(hit: SearchHit) => ((hit.links as Record<string, unknown>).xml = { MUL: '' })
		],
		[
			'a links.xml that is a list',
			(hit: SearchHit) => ((hit.links as Record<string, unknown>).xml = ['x'])
		]
	])('fails a hit with %s', (_, change) => {
		const hit = hitOf('600457-2026');
		change(hit);
		expect(xmlTarget(hit)).toEqual({ ok: false, notice: '600457-2026', reason: NO_LINK });
	});

	it("builds the address from the number, whatever the hit's link says", () => {
		const hit = hitOf('600457-2026');
		(hit.links as Record<string, unknown>).xml = { MUL: 'https://elsewhere.example/notice.xml' };
		expect(xmlTarget(hit)).toEqual({
			ok: true,
			number: '600457-2026',
			url: tedNoticeXmlUrl('600457-2026')
		});
	});

	it('still fails a malformed publication number before looking at its links', () => {
		const hit = hitOf('600457-2026');
		hit['publication-number'] = '../600457-2026';
		expect(xmlTarget(hit)).toMatchObject({ ok: false, notice: '../600457-2026' });
		expect(xmlTarget(hit)).not.toMatchObject({ reason: NO_LINK });
	});
});

describe('a capture run with a hit that names no XML', () => {
	it('records the hit as failed and never asks TED for its XML', async () => {
		const root = mkdtempSync(join(tmpdir(), 'pagefifty-capture-search-'));
		roots.push(root);
		mkdirSync(join(root, 'examples'));
		const unlinked = hitOf('600779-2026');
		delete (unlinked.links as Record<string, unknown>).xml;
		const clock = createFakeClock(START);
		const ted = createScriptedTed({
			clock,
			notices: NOTICES,
			script: { [TED_SEARCH_URL]: [page([first, unlinked, third], 3)] }
		});
		const lines: string[] = [];
		const code = await runCapture({
			root,
			transport: ted,
			clock,
			argv: [],
			env: {},
			head: '0123456789abcdef0123456789abcdef01234567',
			pid: 4545,
			isAlive: (pid) => pid === 4545,
			log: (line) => lines.push(line)
		});
		expect(code, lines.join('\n')).toBe(0);
		const urls = ted.calls().map(({ url }) => url);
		expect(urls.filter((url) => url === tedNoticeXmlUrl('600779-2026'))).toEqual([]);
		const run = JSON.parse(
			readFileSync(join(root, 'examples', '2026-10-11', 'run.json'), 'utf8')
		) as { notices: { failed: unknown[] } };
		expect(run.notices.failed).toEqual([
			{ notice: '600779-2026', reason: 'no XML link in the search answer' }
		]);
	});
});
