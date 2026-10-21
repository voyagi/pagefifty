import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { figureFile, loadIndex } from '$lib/server/records';
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

const indexWith = (query: string) => ({
	capture: { id: '2026-10-11', fetchedAt: '2026-10-11T09:00:00.000Z', total: 120, query },
	leftOut: [],
	rows: []
});

type LoadEvent = Parameters<typeof load>[0];

describe('/ load', () => {
	it("quotes the newest capture's count, capture day and first publication day", async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('publication-date>=20260927'));
		expect(await load({} as LoadEvent)).toStrictEqual({
			total: 120,
			capturedOn: '11 Oct 2026',
			firstPublished: '27 Sep 2026',
			figure: null
		});
		expect(loadIndex).toHaveBeenCalledWith('2026-10-11');
	});

	// toStrictEqual, because a firstPublished key holding undefined would pass a plain toEqual.
	it('leaves firstPublished out when the capture query names no first day', async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('buyer-country IN (NLD)'));
		expect(await load({} as LoadEvent)).toStrictEqual({
			total: 120,
			capturedOn: '11 Oct 2026',
			figure: null
		});
	});

	it("reads the figure of the latest capture's own file, never the example's", async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('buyer-country IN (NLD)'));
		vi.mocked(figureFile).mockImplementationOnce((capture) =>
			capture === '2026-10-11' ? SPREAD_FIGURE : null
		);
		const data = await load({} as LoadEvent);
		expect(data?.figure).toEqual(SPREAD_FIGURE);
		expect(figureFile).toHaveBeenLastCalledWith('2026-10-11');
	});

	// The page as the server renders it from what the load returned.
	it('a latest capture with no figure gives a home page with no figure', async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('publication-date>=20260927'));
		const data = (await load({} as LoadEvent)) as PageData;
		expect(data.figure).toBeNull();
		const { body } = render(Page, { props: { data } });
		expect(body).not.toContain('data-figure');
		expect(body).toContain('Browse open tenders');
		expect(body).toContain('Open the example run');
		const withFigure = render(Page, { props: { data: { ...data, figure: SPREAD_FIGURE } } }).body;
		expect(withFigure).toContain('data-figure');
		expect(withFigure.indexOf('Open the example run')).toBeLessThan(
			withFigure.indexOf('data-figure')
		);
	});
});
