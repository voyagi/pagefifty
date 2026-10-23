import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadTenderPage } from '$lib/server/tender-page';
import { defaultNotice, loadTenderList } from '$lib/server/tenders';
import { load as layoutLoad } from './+layout.server';
import { load as pageLoad } from './+page.server';

// The newest capture is named apart from the example's, so reading the wrong one shows while
// 2026-09-15 is still the only capture built.
vi.mock('$lib/server/records', () => ({
	LATEST_CAPTURE: '2026-10-11',
	EXAMPLE_CAPTURE: '2026-09-15'
}));
const OPEN = vi.hoisted(() => [{ noticeNumber: '700001-2026' }, { noticeNumber: '700002-2026' }]);
vi.mock('$lib/server/tenders', () => ({
	loadTenderList: vi.fn(async () => ({ list: { open: OPEN } })),
	defaultNotice: vi.fn(() => '700002-2026')
}));
vi.mock('$lib/server/tender-page', () => ({
	loadTenderPage: vi.fn(async () => ({ tender: { noticeNumber: '700002-2026' } }))
}));

type LayoutEvent = Parameters<typeof layoutLoad>[0];
type PageEvent = Parameters<typeof pageLoad>[0];

beforeEach(() => {
	vi.mocked(loadTenderList).mockClear();
	vi.mocked(defaultNotice).mockClear();
	vi.mocked(loadTenderPage).mockClear();
});

describe('/tenders layout load', () => {
	it('lists the newest capture, judged against the real clock', async () => {
		const url = new URL('http://127.0.0.1/tenders?country=NL');
		const before = Date.now();
		await layoutLoad({ url } as LayoutEvent);
		const [args] = vi.mocked(loadTenderList).mock.calls[0];
		expect(args.capture).toBe('2026-10-11');
		expect(args.url).toBe(url);
		expect(args.now).toBeInstanceOf(Date);
		expect((args.now as Date).getTime()).toBeGreaterThanOrEqual(before);
	});

	it('names the tender the bare list opens, chosen from its open rows in the newest capture', async () => {
		const data = await layoutLoad({
			url: new URL('http://127.0.0.1/tenders')
		} as LayoutEvent);
		expect(vi.mocked(defaultNotice).mock.calls).toEqual([['2026-10-11', OPEN]]);
		const [args] = vi.mocked(loadTenderList).mock.calls[0];
		expect(data).toEqual({ list: { open: OPEN }, defaultNotice: '700002-2026', now: args.now });
	});
});

describe('/tenders page load', () => {
	// The instant the layout judged its list at, set well before this run so a fresh clock read shows.
	const LISTED = new Date('2026-10-22T11:59:59.000Z');
	const pageWith = (notice: string | null) =>
		pageLoad({
			parent: async () => ({ defaultNotice: notice, now: LISTED })
		} as unknown as PageEvent);

	// The list and the tender it opens are judged at one instant, so a deadline passing between two
	// clock reads can never show the tender open in the list and closed beside it.
	it('loads the tender the list opens from the newest capture, at the instant the list was judged', async () => {
		expect(await pageWith('700002-2026')).toEqual({
			record: { tender: { noticeNumber: '700002-2026' } }
		});
		const [args] = vi.mocked(loadTenderPage).mock.calls[0];
		expect([args.capture, args.notice]).toEqual(['2026-10-11', '700002-2026']);
		expect(args.now).toBe(LISTED);
	});

	it('opens no tender, and reads none, when the list has nothing open', async () => {
		expect(await pageWith(null)).toEqual({ record: null });
		expect(loadTenderPage).not.toHaveBeenCalled();
	});
});
