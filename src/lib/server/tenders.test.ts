import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noticeDeadline } from '../core/deadline';
import { captureDay, SnapshotIndexSchema } from '../snapshot/index-row';

// read() needs the adapter's implementation, which only a built app provides. The stand-in reads
// the asset URL that Vite gave the generated file, from disk, the way vite dev does.
const fromDisk = vi.hoisted(
	() => (url: string) => readFileSync(url.replace(/^\//, '').replace(/\?.*$/, ''), 'utf8')
);
const read = vi.hoisted(() => vi.fn((url: string) => new Response(fromDisk(url))));
vi.mock('$app/server', () => ({ read }));

const { EXAMPLE_CAPTURE } = await import('./records');
const { loadExampleList, loadExamplePage, loadTenderList } = await import('./tenders');
const { loadTenderPage } = await import('./tender-page');

// The 2026-09-15 capture is named, not reached through the example, since these figures are its own.
const SEPT = '2026-09-15';
const CAPTURE_INSTANT = new Date('2026-09-15T19:50:49.157Z');

const load = (search: string, now = CAPTURE_INSTANT) =>
	loadTenderList({
		capture: SEPT,
		url: new URL(`http://127.0.0.1/tenders${search}`),
		now
	});

beforeEach(() => {
	read.mockClear();
});

describe('loadTenderList', () => {
	it('lists every captured notice against the instant it is given, reading the index once', async () => {
		const data = await load('');
		expect(data.list.counts).toEqual({ total: 362, shown: 362, open: 349, closed: 13 });
		expect(data.list.filtered).toBe(false);
		expect(data.dropped).toBe(false);
		expect(data.capture).toEqual({
			capturedOn: '15 Sep 2026',
			fetchedAt: '2026-09-15T19:50:49.157Z',
			firstPublished: '1 Sep 2026'
		});
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('judges open and closed by the "now" it is given, not by the capture', async () => {
		const later = await load('', new Date('2028-01-01T00:00:00Z'));
		expect(later.list.counts).toMatchObject({ total: 362, open: 0, closed: 362 });
	});

	it('reads the filters from the address and lists only the rows they match', async () => {
		const data = await load('?country=NL&cpv=72');
		expect(data.filters).toEqual({ countries: ['NL'], cpv: ['72'] });
		expect(data.dropped).toBe(false);
		expect(data.list.filtered).toBe(true);
		const rows = [...data.list.open, ...data.list.closed];
		expect(rows.length).toBe(data.list.counts.shown);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.length).toBeLessThan(data.list.counts.total);
		expect(rows.every((row) => row.countries.includes('Netherlands'))).toBe(true);
	});

	it('flags values it does not know as dropped and still lists every notice', async () => {
		const data = await load('?country=XX&cpv=99&from=2026-02-30');
		expect(data.dropped).toBe(true);
		expect(data.filters).toEqual({ countries: [], cpv: [] });
		expect(data.list.filtered).toBe(false);
		expect(data.list.counts.shown).toBe(362);
	});

	it('fails the whole load, never a partial list, when the index cannot be read', async () => {
		read.mockImplementationOnce(
			() =>
				new Response(
					new ReadableStream({
						start(controller) {
							controller.error(new Error('read(...) failed: could not fetch (404 Not Found)'));
						}
					})
				)
		);
		await expect(load('')).rejects.toThrow('the 2026-09-15 index could not be read');
	});
});

// The example is whichever capture the rule chose, so its own index gives the instant it is judged
// at and a notice open then; these tests hold on the day the final capture becomes the example.
const EXAMPLE_INDEX = SnapshotIndexSchema.parse(
	JSON.parse(fromDisk(`src/lib/snapshot/generated/${EXAMPLE_CAPTURE}/index.json`))
);
const EXAMPLE_INSTANT = new Date(EXAMPLE_INDEX.capture.fetchedAt);
const OPEN_NOTICE = EXAMPLE_INDEX.rows.find(
	(row) => noticeDeadline(row.lots, EXAMPLE_INSTANT).open
)?.noticeNumber;

describe('the example run', () => {
	const exampleList = (search = '') =>
		loadExampleList({ url: new URL(`http://127.0.0.1/example${search}`) });
	const atExample = (search: string, now = EXAMPLE_INSTANT) =>
		loadTenderList({
			capture: EXAMPLE_CAPTURE,
			url: new URL(`http://127.0.0.1/tenders${search}`),
			now
		});
	const openNotice = () => {
		if (OPEN_NOTICE === undefined) throw new Error(`${EXAMPLE_CAPTURE} lists no open notice`);
		return OPEN_NOTICE;
	};

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it('lists the same notices as /tenders judged at the capture instant, reading the index once', async () => {
		const tenders = await atExample('');
		read.mockClear();
		const example = await exampleList();
		expect(read).toHaveBeenCalledTimes(1);
		expect(example).toEqual(tenders);
		expect(example.list.open.length).toBeGreaterThan(0);
	});

	it('filters the same way as /tenders', async () => {
		expect(await exampleList('?country=NL&cpv=72')).toEqual(await atExample('?country=NL&cpv=72'));
	});

	it('builds the same tender page as /tenders for a notice open at the capture instant', async () => {
		const notice = openNotice();
		const tenders = await loadTenderPage({
			capture: EXAMPLE_CAPTURE,
			notice,
			now: EXAMPLE_INSTANT
		});
		const example = await loadExamplePage({ notice });
		expect(example).toEqual(tenders);
		expect(example.tender.deadline.open).toBe(true);
	});

	it('answers an unknown notice with the unknown-notice 404 before reading the index', async () => {
		await expect(loadExamplePage({ notice: '999991-2026' })).rejects.toMatchObject({
			status: 404,
			body: { kind: 'unknown-notice', notice: '999991-2026' }
		});
		expect(read).not.toHaveBeenCalled();
	});

	it('is still the capture as it stood on 15 Dec 2026, with no PAGEFIFTY variable set', async () => {
		const atCapture = await exampleList();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
		expect(new Date().toISOString()).toBe('2026-12-15T12:00:00.000Z');
		expect(Object.keys(process.env).filter((name) => name.startsWith('PAGEFIFTY'))).toEqual([]);
		const judging = await exampleList();
		expect(judging.list.open.length).toBeGreaterThan(0);
		expect(judging.capture.capturedOn).toBe(captureDay(EXAMPLE_INDEX.capture.fetchedAt));
		expect(judging).toEqual(atCapture);
		// The same capture judged long after every deadline has none open, so the example is not
		// reading the clock.
		const later = await atExample('', new Date('2099-01-01T00:00:00Z'));
		expect(later.list.counts.open).toBe(0);
	});

	it('ignores the live switch: the example reads no environment variable', async () => {
		const before = await exampleList();
		vi.stubEnv('PAGEFIFTY_LIVE', '1');
		expect(await exampleList()).toEqual(before);
	});

	describe('a lot whose deadline is the capture instant itself', () => {
		function withDeadline(deadline: string) {
			read.mockImplementationOnce((url: string) => {
				const index = JSON.parse(fromDisk(url)) as {
					rows: { noticeNumber: string; lots: { deadlines: unknown }[] }[];
				};
				const row = index.rows.find((each) => each.noticeNumber === openNotice());
				if (row === undefined) throw new Error(`${openNotice()} is not in the capture index`);
				for (const lot of row.lots) lot.deadlines = { tender: deadline };
				return new Response(JSON.stringify(index));
			});
		}
		const where = (data: Awaited<ReturnType<typeof exampleList>>) => ({
			open: data.list.open.some((row) => row.noticeNumber === openNotice()),
			closed: data.list.closed.some((row) => row.noticeNumber === openNotice())
		});
		// The instant written at +02:00, as a buyer in summer time publishes it, so the comparison is
		// shown to be by instant and not by the text.
		const atPlusTwo = (ms: number) => new Date(ms + 7_200_000).toISOString().replace('Z', '+02:00');

		it('is closed in the example, since a deadline equal to now has passed', async () => {
			withDeadline(atPlusTwo(EXAMPLE_INSTANT.getTime()));
			expect(where(await exampleList())).toEqual({ open: false, closed: true });
		});

		it('is open one millisecond later', async () => {
			withDeadline(atPlusTwo(EXAMPLE_INSTANT.getTime() + 1));
			expect(where(await exampleList())).toEqual({ open: true, closed: false });
		});
	});
});
