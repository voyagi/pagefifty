import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { figureFile, loadIndex } from '$lib/server/records';
import { defaultNotice, loadExampleList, loadExamplePage } from '$lib/server/tenders';
import { SPREAD_FIGURE } from '../test/home-figure';
import type { PageData } from './$types';
import { load } from './+page.server';
import Page from './+page.svelte';

// The newest capture is named apart from the example's, so reading the wrong one shows while
// 2026-09-15 is still the only capture built.
vi.mock('$lib/server/records', () => ({
	LATEST_CAPTURE: '2026-10-11',
	EXAMPLE_CAPTURE: '2026-09-15',
	loadIndex: vi.fn(),
	figureFile: vi.fn(() => null)
}));
const OPEN = vi.hoisted(() => [{ noticeNumber: '610242-2026' }, { noticeNumber: '634398-2026' }]);
vi.mock('$lib/server/tenders', () => ({
	loadExampleList: vi.fn(async () => ({ list: { open: OPEN } })),
	loadExamplePage: vi.fn(async ({ notice }: { notice: string }) => ({
		tender: { noticeNumber: notice }
	})),
	defaultNotice: vi.fn(() => '634398-2026')
}));

type IndexRows = Awaited<ReturnType<typeof loadIndex>>['rows'];

const indexWith = (query: string, rows: IndexRows = []) => ({
	capture: { id: '2026-10-11', fetchedAt: '2026-10-11T09:00:00.000Z', total: 120, query },
	leftOut: [],
	rows
});

type LoadEvent = Parameters<typeof load>[0];

// The start page is opened with a filter of its own in the address, which the example's list must
// not inherit.
const EVENT = { url: new URL('http://127.0.0.1/?country=NL') } as LoadEvent;
const OPENED = { tender: { noticeNumber: '634398-2026' } };

beforeEach(() => {
	vi.mocked(loadExampleList).mockClear();
	vi.mocked(loadExamplePage).mockClear();
	vi.mocked(defaultNotice).mockClear();
});

describe('/ load', () => {
	it("quotes the newest capture's count, capture day and first publication day", async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('publication-date>=20260927'));
		expect(await load(EVENT)).toStrictEqual({
			served: 0,
			total: 120,
			capturedOn: '11 Oct 2026',
			firstPublished: '27 Sep 2026',
			figure: null,
			example: OPENED
		});
		expect(loadIndex).toHaveBeenCalledWith('2026-10-11');
	});

	// TED's count covers notices the capture left out (closing before the cutoff, failed or
	// outdated), so the count the figure and /tenders use is the rows the site serves.
	it('counts the notices the site serves apart from the count TED stated', async () => {
		const row = {} as IndexRows[number];
		vi.mocked(loadIndex).mockResolvedValueOnce(
			indexWith('publication-date>=20260927', [row, row, row])
		);
		const data = await load(EVENT);
		expect(data).toMatchObject({ served: 3, total: 120 });
	});

	// toStrictEqual, because a firstPublished key holding undefined would pass a plain toEqual.
	it('leaves firstPublished out when the capture query names no first day', async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('buyer-country IN (NLD)'));
		expect(await load(EVENT)).toStrictEqual({
			served: 0,
			total: 120,
			capturedOn: '11 Oct 2026',
			figure: null,
			example: OPENED
		});
	});

	it("reads the figure of the latest capture's own file, never the example's", async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('buyer-country IN (NLD)'));
		vi.mocked(figureFile).mockImplementationOnce((capture) =>
			capture === '2026-10-11' ? SPREAD_FIGURE : null
		);
		const data = await load(EVENT);
		expect(data?.figure).toEqual(SPREAD_FIGURE);
		expect(figureFile).toHaveBeenLastCalledWith('2026-10-11');
	});

	// The same rule as /example with no filter, so the card and the bare example list open the same
	// record, whatever the example capture holds.
	it('loads the record the unfiltered example list opens, chosen by the example rule', async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('buyer-country IN (NLD)'));
		const data = await load(EVENT);
		const [[{ url }]] = vi.mocked(loadExampleList).mock.calls;
		expect([url.pathname, url.search]).toEqual(['/example', '']);
		expect(vi.mocked(defaultNotice).mock.calls).toEqual([['2026-09-15', OPEN]]);
		expect(vi.mocked(loadExamplePage).mock.calls).toEqual([[{ notice: '634398-2026' }]]);
		expect(data?.example).toEqual(OPENED);
	});

	it('gives no example, and reads no record, when the example list opens none', async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('buyer-country IN (NLD)'));
		vi.mocked(defaultNotice).mockReturnValueOnce(null);
		expect((await load(EVENT))?.example).toBeNull();
		expect(loadExamplePage).not.toHaveBeenCalled();
	});

	// The page as the server renders it from what the load returned.
	it('a latest capture with no figure gives a home page with no figure', async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('publication-date>=20260927'));
		vi.mocked(defaultNotice).mockReturnValueOnce(null);
		const data = (await load(EVENT)) as PageData;
		expect(data.figure).toBeNull();
		const { body } = render(Page, { props: { data } });
		expect(body).not.toContain('data-figure');
		expect(body).toContain('Browse open tenders');
		expect(body).toContain('Open the example verdict');
		const withFigure = render(Page, { props: { data: { ...data, figure: SPREAD_FIGURE } } }).body;
		expect(withFigure).toContain('data-figure');
		expect(withFigure.indexOf('Open the example verdict')).toBeLessThan(
			withFigure.indexOf('data-figure')
		);
	});
});
