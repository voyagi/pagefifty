// The stand-in TED every capture test injects: it answers only what a test chose and shows what was
// asked and when, so these tests pin both halves before any capture test leans on them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCRUB_PLACEHOLDER, scrubNoticeXml } from '../lib/snapshot/scrub.ts';
import { tedNoticeXmlUrl } from '../lib/snapshot/transport.ts';
import { contactStringsInFile } from './capture-detectors.ts';
import { capturePath } from './fixtures/node.ts';
import { createFakeClock, createScriptedTed, PLANTED_ADDRESS } from './ted-stub.ts';

const SEARCH = 'https://api.ted.europa.eu/v3/notices/search';
const START = Date.UTC(2026, 9, 13, 6, 0, 0);

interface ListingEntry {
	'publication-number': string;
}

const LISTING = (
	JSON.parse(readFileSync(join('examples', '2026-09-15', 'notices.json'), 'utf8')) as {
		notices: ListingEntry[];
	}
).notices;
const entryOf = (notice: string) => LISTING.find((entry) => entry['publication-number'] === notice);

const search = (body: unknown) =>
	new Request(SEARCH, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
const xml = (notice: string) => new Request(tedNoticeXmlUrl(notice));

async function searchPage(
	ted: (request: Request) => Promise<Response>,
	page: number,
	limit = 250
): Promise<{
	status: number;
	json: { notices: ListingEntry[]; totalNoticeCount: number; timedOut: boolean };
}> {
	const response = await ted(search({ query: 'q', limit, page }));
	return { status: response.status, json: await response.json() };
}

describe('createFakeClock', () => {
	it('starts at the time given and moves only when slept', async () => {
		const clock = createFakeClock(START);
		expect(clock.now()).toBe(START);
		await clock.sleep(250);
		expect(clock.now()).toBe(START + 250);
	});

	it('records every sleep in order and resolves without waiting real time', async () => {
		const clock = createFakeClock(START);
		const real = Date.now();
		await clock.sleep(60_000);
		await clock.sleep(1_000);
		await clock.sleep(0);
		expect(clock.sleeps()).toEqual([60_000, 1_000, 0]);
		expect(clock.now()).toBe(START + 61_000);
		expect(Date.now() - real).toBeLessThan(5_000);
	});

	it('refuses a sleep that would move the clock back or nowhere it can name', () => {
		const clock = createFakeClock(START);
		expect(() => clock.sleep(-1)).toThrow(RangeError);
		expect(() => clock.sleep(Number.NaN)).toThrow(RangeError);
		expect(clock.now()).toBe(START);
		expect(clock.sleeps()).toEqual([]);
	});
});

describe('createScriptedTed', () => {
	it("answers a search with the named notices' 2026-09-15 listing entries in the order given", async () => {
		const ted = createScriptedTed({
			clock: createFakeClock(START),
			notices: ['601147-2026', '600367-2026']
		});
		const { status, json } = await searchPage(ted, 1);
		expect(status).toBe(200);
		expect(json).toEqual({
			notices: [entryOf('601147-2026'), entryOf('600367-2026')],
			totalNoticeCount: 2,
			timedOut: false
		});
		expect(json.notices[0]).toBeDefined();
	});

	it('answers the same two notices in the reverse order when named the other way', async () => {
		const ted = createScriptedTed({
			clock: createFakeClock(START),
			notices: ['600367-2026', '601147-2026']
		});
		const { json } = await searchPage(ted, 1);
		expect(json.notices.map((entry) => entry['publication-number'])).toEqual([
			'600367-2026',
			'601147-2026'
		]);
	});

	it('answers the page the request body asks for, the total counting every named notice', async () => {
		const ted = createScriptedTed({
			clock: createFakeClock(START),
			notices: ['600017-2026', '600367-2026', '601147-2026']
		});
		const second = await searchPage(ted, 2, 2);
		expect(second.json.notices.map((entry) => entry['publication-number'])).toEqual([
			'601147-2026'
		]);
		expect(second.json.totalNoticeCount).toBe(3);
		const third = await searchPage(ted, 3, 2);
		expect(third.json.notices).toEqual([]);
	});

	it('answers a notice XML GET with its tracked file, each placeholder filled with the planted address', async () => {
		const ted = createScriptedTed({ clock: createFakeClock(START), notices: ['600367-2026'] });
		const response = await ted(xml('600367-2026'));
		expect(response.status).toBe(200);
		const served = await response.text();
		const tracked = readFileSync(capturePath('600367-2026'), 'utf8');
		expect(tracked).toContain(SCRUB_PLACEHOLDER);
		expect(served).not.toContain(SCRUB_PLACEHOLDER);
		expect(served).toContain(PLANTED_ADDRESS);
		expect(scrubNoticeXml(served)).toBe(tracked);
	});

	// A capture run that skipped the scrub would write what TED served, so every default answer must
	// carry contact data the capture detectors name, and the scrub must give back the tracked file.
	it('serves every tracked notice with contact data the detectors name, which the scrub turns back into the tracked file', async () => {
		const notices = LISTING.map((entry) => entry['publication-number']);
		expect(notices).toHaveLength(363);
		const ted = createScriptedTed({ clock: createFakeClock(START), notices });
		const wrong: string[] = [];
		for (const notice of notices) {
			const served = await (await ted(xml(notice))).text();
			if (contactStringsInFile(`${notice}.xml`, served).length === 0) {
				wrong.push(`${notice}: served without contact data`);
			}
			if (scrubNoticeXml(served) !== readFileSync(capturePath(notice), 'utf8')) {
				wrong.push(`${notice}: the scrub does not give back the tracked file`);
			}
		}
		expect(wrong).toEqual([]);
	}, 30_000);

	it("answers 599 naming the URL for an unnamed notice's XML", async () => {
		const ted = createScriptedTed({ clock: createFakeClock(START), notices: ['600367-2026'] });
		const response = await ted(xml('601147-2026'));
		expect(response.status).toBe(599);
		expect(await response.text()).toContain(tedNoticeXmlUrl('601147-2026'));
	});

	it('answers 599 for any address, method or search body nobody scripted', async () => {
		const ted = createScriptedTed({ clock: createFakeClock(START), notices: ['600367-2026'] });
		const pdf = 'https://ted.europa.eu/en/notice/600367-2026/pdf';
		const answers = [
			await ted(new Request(pdf)),
			await ted(new Request(SEARCH)),
			await ted(new Request(tedNoticeXmlUrl('600367-2026'), { method: 'POST', body: '{}' })),
			await ted(search({ query: 'q' }))
		];
		expect(answers.map((response) => response.status)).toEqual([599, 599, 599, 599]);
		expect(await answers[0].text()).toContain(pdf);
		expect(await answers[1].text()).toContain(SEARCH);
	});

	it('uses a scripted queue for a URL in order before the default answer', async () => {
		const url = tedNoticeXmlUrl('600367-2026');
		const ted = createScriptedTed({
			clock: createFakeClock(START),
			notices: ['600367-2026'],
			script: { [url]: [{ status: 429, headers: { 'Retry-After': '3' } }] }
		});
		const first = await ted(xml('600367-2026'));
		expect(first.status).toBe(429);
		expect(first.headers.get('retry-after')).toBe('3');
		const second = await ted(xml('600367-2026'));
		expect(second.status).toBe(200);
		expect(scrubNoticeXml(await second.text())).toBe(
			readFileSync(capturePath('600367-2026'), 'utf8')
		);
	});

	it('rejects a call scripted to throw, and still records it', async () => {
		const url = tedNoticeXmlUrl('600367-2026');
		const reset = new TypeError('fetch failed: connection reset');
		const ted = createScriptedTed({
			clock: createFakeClock(START),
			notices: ['600367-2026'],
			script: { [url]: [{ throws: reset }] }
		});
		await expect(ted(xml('600367-2026'))).rejects.toBe(reset);
		expect(ted.calls()).toHaveLength(1);
		expect(ted.maxInFlight()).toBe(1);
		expect((await ted(xml('600367-2026'))).status).toBe(200);
	});

	it('serves a synthetic notice only through the script, as text, bytes or a stream', async () => {
		const synthetic = tedNoticeXmlUrl('999901-2026');
		const bytes = tedNoticeXmlUrl('999902-2026');
		const stream = tedNoticeXmlUrl('999903-2026');
		const ted = createScriptedTed({
			clock: createFakeClock(START),
			notices: [],
			script: {
				[synthetic]: [{ status: 200, body: '<ContractNotice/>' }],
				[bytes]: [{ status: 200, body: new TextEncoder().encode('<a/>') }],
				[stream]: [
					{
						status: 200,
						body: new ReadableStream<Uint8Array>({
							start(controller) {
								controller.enqueue(new TextEncoder().encode('<b/>'));
								controller.close();
							}
						})
					}
				]
			}
		});
		expect(await (await ted(new Request(synthetic))).text()).toBe('<ContractNotice/>');
		expect(await (await ted(new Request(bytes))).text()).toBe('<a/>');
		expect(await (await ted(new Request(stream))).text()).toBe('<b/>');
		expect((await ted(new Request(synthetic))).status).toBe(599);
	});

	it('lists every call with its start time on the clock, method, URL and parsed body', async () => {
		const clock = createFakeClock(START);
		const ted = createScriptedTed({ clock, notices: ['600367-2026'] });
		await ted(search({ query: 'q', limit: 250, page: 1 }));
		await clock.sleep(1_000);
		await ted(xml('600367-2026'));
		expect(ted.calls()).toEqual([
			{
				at: START,
				method: 'POST',
				url: SEARCH,
				body: { query: 'q', limit: 250, page: 1 }
			},
			{ at: START + 1_000, method: 'GET', url: tedNoticeXmlUrl('600367-2026'), body: undefined }
		]);
	});

	it('counts one call in flight for awaited calls and two for calls started together', async () => {
		const sequential = createScriptedTed({
			clock: createFakeClock(START),
			notices: ['600367-2026']
		});
		await sequential(xml('600367-2026'));
		await sequential(xml('600367-2026'));
		expect(sequential.maxInFlight()).toBe(1);
		const together = createScriptedTed({
			clock: createFakeClock(START),
			notices: ['600367-2026']
		});
		await Promise.all([together(xml('600367-2026')), together(xml('600367-2026'))]);
		expect(together.maxInFlight()).toBe(2);
	});

	it('refuses at construction a notice the 2026-09-15 listing does not hold', () => {
		expect(() =>
			createScriptedTed({ clock: createFakeClock(START), notices: ['999901-2026'] })
		).toThrow(/999901-2026/);
	});
});
