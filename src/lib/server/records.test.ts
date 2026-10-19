import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	assertOpenPastCutoff,
	builtCaptureLines,
	lotsClosingByCutoff
} from '../../test/example-deadlines';
import { CAPTURE_ID, exampleCaptureOf } from '../snapshot/capture-id';
import { captureFacts } from '../tenders/list';

const GENERATED = 'src/lib/snapshot/generated';
// The capture whose own records these tests check, named rather than reached through the example,
// so the example moving to the final capture moves only the tests about the example rule.
const SEPT = '2026-09-15';

// read() needs the adapter's implementation, which only a built app provides. The stand-in reads
// the asset URL that Vite gave the generated file, from disk, the way vite dev does.
const read = vi.hoisted(() =>
	vi.fn((url: string) => new Response(readFileSync(url.replace(/^\//, '').replace(/\?.*$/, ''))))
);
vi.mock('$app/server', () => ({ read }));

const {
	EXAMPLE_CAPTURE,
	LATEST_CAPTURE,
	loadIndex,
	loadNoticeReadings,
	loadNoticeSearch,
	loadRecord,
	newestCapture,
	newestReadingRun,
	parsedSearchRun,
	providersOf,
	readingRunOf,
	searchRunOf,
	snapshotDays
} = await import('./records');

// The shapes SvelteKit's read() really produces on the Worker. Its answer is always status 200: the
// adapter fetches the file through ASSETS inside the body stream and throws there when ASSETS
// answers 404, and a path the manifest does not hold throws before any response exists.
const fetchFailed = () =>
	new Response(
		new ReadableStream({
			start(controller) {
				controller.error(
					new Error('read(...) failed: could not fetch http://127.0.0.1/x.json (404 Not Found)')
				);
			}
		})
	);
const notInManifest = (): Response => {
	throw new Error('Asset does not exist: x.json');
};

beforeEach(() => {
	read.mockClear();
});

describe('newestCapture', () => {
	it('picks the greatest capture date', () => {
		expect(newestCapture(['2026-09-15', '2026-10-11'])).toBe('2026-10-11');
	});

	it('picks the same date whatever order the names come in', () => {
		expect(newestCapture(['2026-10-11', '2026-09-15'])).toBe('2026-10-11');
	});

	it('ignores a name that is not a capture date', () => {
		expect(newestCapture(['2026-09-15', 'notes', '.tmp-2026-12-01-4'])).toBe('2026-09-15');
	});

	it('never chooses 2026-1-5, a real day written without its zeros, which would sort last', () => {
		expect(newestCapture(['2026-09-15', '2026-1-5'])).toBe('2026-09-15');
	});

	it('never chooses 2026-02-30, a date with no such day', () => {
		expect(newestCapture(['2026-01-15', '2026-02-30'])).toBe('2026-01-15');
	});

	it('never chooses 2026-99-99, a date with no such month', () => {
		expect(newestCapture(['2026-09-15', '2026-99-99'])).toBe('2026-09-15');
	});

	it('chooses 29 February in a leap year', () => {
		expect(newestCapture(['2028-02-28', '2028-02-29'])).toBe('2028-02-29');
	});

	it('names the step that writes the captures when none is built', () => {
		expect(() => newestCapture([])).toThrow(
			'no built capture: scripts/build-records.mjs writes them'
		);
		expect(() => newestCapture(['notes', '2026-02-30'])).toThrow('scripts/build-records.mjs');
	});
});

describe('the captures the pages read', () => {
	it('gives the live pages the newest capture the build wrote', () => {
		const built = readdirSync(GENERATED)
			.filter((name) => CAPTURE_ID.test(name))
			.sort();
		expect(built.length).toBeGreaterThan(0);
		expect(LATEST_CAPTURE).toBe(built[built.length - 1]);
	});

	it('chooses the example by the rule over the built capture lines', () => {
		expect(EXAMPLE_CAPTURE).toBe(exampleCaptureOf(builtCaptureLines(GENERATED)));
	});
});

// The 2026-09-15 capture predates the filter, so while it is the example no deadline claim is made
// for it; once a capture the rule chose is the example, every lot it shows must close after the cutoff.
describe('the example and the Devpost cutoff', () => {
	it('the example capture shows no lot closing at or before the cutoff', async () => {
		const { rows } = await loadIndex(EXAMPLE_CAPTURE);
		if (EXAMPLE_CAPTURE === '2026-09-15') {
			expect(lotsClosingByCutoff(rows).length).toBeGreaterThan(0);
			return;
		}
		// Called bare, so a failure prints every lot it names in full rather than a cut message.
		assertOpenPastCutoff(EXAMPLE_CAPTURE, rows);
	});

	it('the fallback example is named, not checked silently', () => {
		const withOpenAfter = [...builtCaptureLines(GENERATED)]
			.filter(([, line]) => line.openAfter !== undefined)
			.map(([id]) => id);
		if (EXAMPLE_CAPTURE === '2026-09-15') {
			expect(withOpenAfter).toEqual([]);
		} else {
			expect(withOpenAfter).toContain(EXAMPLE_CAPTURE);
		}
	});
});

describe('snapshotDays', () => {
	it.each([
		['the example', EXAMPLE_CAPTURE],
		['the newest', LATEST_CAPTURE]
	])('gives %s capture the same days as its built index, with no read', async (_label, capture) => {
		const days = snapshotDays(capture);
		expect(read).not.toHaveBeenCalled();
		const index = await loadIndex(capture);
		expect(days).toEqual(captureFacts(index.capture));
	});

	it('names 15 Sep 2026 and 1 Sep 2026 for the 2026-09-15 capture', () => {
		expect(snapshotDays(SEPT)).toMatchObject({
			capturedOn: '15 Sep 2026',
			firstPublished: '1 Sep 2026'
		});
	});

	// The folder is named because a capture gone from examples/ is not fixed by running the build.
	it('names the step and the folder that write the line when a capture was never built', () => {
		expect(() => snapshotDays('2026-02-01')).toThrow(
			'no built capture line for capture 2026-02-01: scripts/build-records.mjs writes it from examples/2026-02-01/notices.json'
		);
	});
});

describe('loadIndex', () => {
	it('reads every notice of the 2026-09-15 capture through read()', async () => {
		const index = await loadIndex(SEPT);
		expect(index.capture.id).toBe('2026-09-15');
		expect(index.rows).toHaveLength(362);
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('refuses a capture that was never built', async () => {
		await expect(loadIndex('2000-01-01')).rejects.toThrow(
			'no built records for capture 2000-01-01'
		);
	});

	it('fails the whole load when the index does not match its schema', async () => {
		read.mockImplementationOnce(() => Response.json({ capture: {}, rows: [] }));
		await expect(loadIndex(SEPT)).rejects.toThrow('does not match its schema');
	});

	it('names the step and the folder that write the records when a capture was never built', async () => {
		await expect(loadIndex('2000-01-01')).rejects.toThrow(
			'scripts/build-records.mjs writes them from examples/2000-01-01/notices.json'
		);
	});

	it('names the index and the cause when the Worker cannot fetch its file', async () => {
		read.mockImplementationOnce(fetchFailed);
		await expect(loadIndex(SEPT)).rejects.toMatchObject({
			message: expect.stringContaining(
				'the 2026-09-15 index could not be read: Error: read(...) failed: could not fetch'
			),
			cause: expect.objectContaining({ message: expect.stringContaining('read(...) failed') })
		});
	});

	it('names the index when read() refuses its path outright', async () => {
		read.mockImplementationOnce(notInManifest);
		await expect(loadIndex(SEPT)).rejects.toThrow(
			'the 2026-09-15 index could not be read: Error: Asset does not exist'
		);
	});

	it('names the index when its file is not JSON, keeping the parse error as the cause', async () => {
		read.mockImplementationOnce(() => new Response('<!doctype html>'));
		await expect(loadIndex(SEPT)).rejects.toMatchObject({
			message: expect.stringContaining('the 2026-09-15 index is not JSON'),
			cause: expect.any(SyntaxError)
		});
	});
});

describe('the reading runs the pages read', () => {
	const septRun = () =>
		JSON.parse(readFileSync('examples/2026-09-15/readings.json', 'utf8')).run as unknown;

	// Holds while 2026-09-15 is the only capture the model read; the final capture replaces it here.
	it('newestReadingRun returns the 2026-09-15 run, the newest capture the model read', () => {
		expect(LATEST_CAPTURE).not.toBe(SEPT);
		expect(newestReadingRun()?.id).toBe(SEPT);
		expect(newestReadingRun()).toEqual({ id: SEPT, run: septRun() });
		expect(readingRunOf(SEPT)).toEqual(septRun());
		expect(readingRunOf(LATEST_CAPTURE)).toBeNull();
		expect(read).not.toHaveBeenCalled();
	});

	it('loadNoticeReadings reads the German lot readings through read(), and nothing for a notice the readings do not list', async () => {
		const german = await loadNoticeReadings(SEPT, '610242-2026');
		expect(german?.notice).toBe('610242-2026');
		expect(german?.lots.map(({ lot, status }) => `${lot} ${status}`)).toEqual(['LOT-0000 read']);
		expect(german?.readings.map((reading) => reading.items.length)).toEqual([14]);
		expect(read).toHaveBeenCalledTimes(1);
		expect(await loadNoticeReadings(SEPT, '609955-2026')).toBeUndefined();
		expect(await loadNoticeReadings(LATEST_CAPTURE, '610242-2026')).toBeUndefined();
		expect(await loadNoticeReadings(SEPT, '../reading-run')).toBeUndefined();
		expect(read).toHaveBeenCalledTimes(1);
	});
});

describe('the search runs and the providers the trust pages name', () => {
	const run = () => readingRunOf(SEPT);
	const searched = (searches: number) => ({ searches, notSearched: 0, credits: null });

	it('the trust pages name Tavily once the example capture searched', () => {
		expect(searchRunOf('2026-09-15')).toEqual({ searches: 1, notSearched: 0, credits: 1 });
		expect(providersOf(readingRunOf('2026-09-15'), searchRunOf('2026-09-15'))).toEqual([
			'Nebius Token Factory',
			'Tavily'
		]);
		expect(searchRunOf('2026-10-16')).toBeNull();
		expect(providersOf(readingRunOf('2026-10-16'), searchRunOf('2026-10-16'))).toEqual([]);
		expect(read).not.toHaveBeenCalled();
	});

	it('loadNoticeSearch reads the German buyer search through read(), and nothing for a notice it does not list', async () => {
		const german = await loadNoticeSearch(SEPT, '610242-2026');
		expect(german?.status).toBe('searched');
		expect(german?.status === 'searched' && german.results.length).toBe(5);
		expect(read).toHaveBeenCalledTimes(1);
		expect(await loadNoticeSearch(SEPT, '634398-2026')).toBeUndefined();
		expect(await loadNoticeSearch('2026-10-16', '610242-2026')).toBeUndefined();
		expect(await loadNoticeSearch(SEPT, '../search-run')).toBeUndefined();
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('names the model provider of the reading run, and Tavily only for a run with a search', () => {
		expect(providersOf(run(), null)).toEqual(['Nebius Token Factory']);
		expect(providersOf(run(), searched(0))).toEqual(['Nebius Token Factory']);
		expect(providersOf(run(), searched(1))).toEqual(['Nebius Token Factory', 'Tavily']);
		expect(providersOf(null, searched(3))).toEqual(['Tavily']);
		expect(providersOf(null, null)).toEqual([]);
	});

	it('reads a search run the schema accepts as it was written', () => {
		expect(parsedSearchRun('2026-10-16', undefined)).toBeNull();
		expect(parsedSearchRun('2026-10-16', { searches: 2, notSearched: 1, credits: 4 })).toEqual({
			searches: 2,
			notSearched: 1,
			credits: 4
		});
	});

	it.each([
		['a missing count', { searches: 1, credits: null }],
		['a negative count', { searches: -1, notSearched: 0, credits: null }],
		['a fractional count', { searches: 1.5, notSearched: 0, credits: null }],
		['negative credits', { searches: 1, notSearched: 0, credits: -1 }],
		['a key the run never writes', { searches: 1, notSearched: 0, credits: null, query: 'x' }]
	])('a search run with %s is a server error naming the file', (_label, line) => {
		expect(() => parsedSearchRun('2026-10-16', line)).toThrow(
			'the 2026-10-16 search run does not match its schema: '
		);
	});
});

describe('loadNoticeReadings on a damaged file', () => {
	it('a damaged generated readings file is a server error naming the file', async () => {
		read.mockImplementationOnce(() => Response.json({ notice: '610242-2026', lots: 'x' }));
		const failed = loadNoticeReadings(SEPT, '610242-2026');
		await expect(failed).rejects.toThrow(
			'the 2026-09-15 readings of 610242-2026 do not match their schema: '
		);
		await expect(failed).rejects.toThrow('"lots"');
		await expect(failed).rejects.toThrow('"readings"');
	});

	it('names the readings file when it is not JSON', async () => {
		read.mockImplementationOnce(() => new Response('{"notice":'));
		await expect(loadNoticeReadings(SEPT, '610242-2026')).rejects.toThrow(
			'the 2026-09-15 readings of 610242-2026 is not JSON'
		);
	});
});

describe('loadRecord', () => {
	it('reads one notice record', async () => {
		const record = await loadRecord(SEPT, '609955-2026');
		expect(record?.noticeNumber).toBe('609955-2026');
		expect(record?.lots[0].deadlines.tender).toBe('2026-10-06T10:30:00+02:00');
	});

	it('answers nothing for 601147-2026, the version 600367-2026 superseded', async () => {
		expect(await loadRecord(SEPT, '601147-2026')).toBeUndefined();
	});

	it('fails the load when a record does not match its schema', async () => {
		read.mockImplementationOnce(() => Response.json({ noticeNumber: '609955-2026', lots: 'x' }));
		await expect(loadRecord(SEPT, '609955-2026')).rejects.toThrow(
			'the 2026-09-15 record 609955-2026 does not match its schema'
		);
	});

	it('names the record and the cause when the Worker cannot fetch its file', async () => {
		read.mockImplementationOnce(fetchFailed);
		await expect(loadRecord(SEPT, '609955-2026')).rejects.toThrow(
			'the 2026-09-15 record 609955-2026 could not be read: Error: read(...) failed'
		);
	});

	it.each([
		'000000-0000',
		'00609955-2026',
		'609955-2026 ',
		' ',
		'../index',
		'6099552026',
		'12345-2025'
	])('answers %j with nothing and never reads', async (notice) => {
		expect(await loadRecord(SEPT, notice)).toBeUndefined();
		expect(read).not.toHaveBeenCalled();
	});
});
