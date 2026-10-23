import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultNotice, loadExampleList, loadExamplePage } from '$lib/server/tenders';
import { load as layoutLoad } from './+layout.server';
import { load as pageLoad } from './+page.server';

// The example's capture is named apart from the newest, so reading the wrong one shows.
vi.mock('$lib/server/records', () => ({
	LATEST_CAPTURE: '2026-10-11',
	EXAMPLE_CAPTURE: '2026-09-15'
}));
const OPEN = vi.hoisted(() => [{ noticeNumber: '610242-2026' }, { noticeNumber: '634398-2026' }]);
vi.mock('$lib/server/tenders', () => ({
	loadExampleList: vi.fn(async () => ({ list: { open: OPEN } })),
	loadExamplePage: vi.fn(async () => ({ tender: { noticeNumber: '610242-2026' } })),
	defaultNotice: vi.fn(() => '610242-2026')
}));

type LayoutEvent = Parameters<typeof layoutLoad>[0];
type PageEvent = Parameters<typeof pageLoad>[0];

beforeEach(() => {
	vi.mocked(loadExampleList).mockClear();
	vi.mocked(loadExamplePage).mockClear();
	vi.mocked(defaultNotice).mockClear();
});

describe('/example layout load', () => {
	it('lists the example capture from the address, and names the tender it opens from that capture', async () => {
		const url = new URL('http://127.0.0.1/example?country=NL');
		const data = await layoutLoad({ url } as LayoutEvent);
		expect(vi.mocked(loadExampleList).mock.calls).toEqual([[{ url }]]);
		expect(vi.mocked(defaultNotice).mock.calls).toEqual([['2026-09-15', OPEN]]);
		expect(data).toEqual({ list: { open: OPEN }, defaultNotice: '610242-2026' });
	});
});

describe('/example page load', () => {
	const pageWith = (notice: string | null) =>
		pageLoad({ parent: async () => ({ defaultNotice: notice }) } as unknown as PageEvent);

	it('loads the tender the example list opens, through the example loader', async () => {
		expect(await pageWith('610242-2026')).toEqual({
			record: { tender: { noticeNumber: '610242-2026' } }
		});
		expect(vi.mocked(loadExamplePage).mock.calls).toEqual([[{ notice: '610242-2026' }]]);
	});

	it('opens no tender, and reads none, when the example list has nothing open', async () => {
		expect(await pageWith(null)).toEqual({ record: null });
		expect(loadExamplePage).not.toHaveBeenCalled();
	});
});
