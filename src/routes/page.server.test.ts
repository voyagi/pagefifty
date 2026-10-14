import { describe, expect, it, vi } from 'vitest';
import { loadIndex } from '$lib/server/records';
import { load } from './+page.server';

// The newest capture is named apart from the example's, so reading the wrong one shows while
// 2026-09-15 is still the only capture built.
vi.mock('$lib/server/records', () => ({
	LATEST_CAPTURE: '2026-10-11',
	EXAMPLE_CAPTURE: '2026-09-15',
	loadIndex: vi.fn()
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
			firstPublished: '27 Sep 2026'
		});
		expect(loadIndex).toHaveBeenCalledWith('2026-10-11');
	});

	// toStrictEqual, because a firstPublished key holding undefined would pass a plain toEqual.
	it('leaves firstPublished out when the capture query names no first day', async () => {
		vi.mocked(loadIndex).mockResolvedValueOnce(indexWith('buyer-country IN (NLD)'));
		expect(await load({} as LoadEvent)).toStrictEqual({ total: 120, capturedOn: '11 Oct 2026' });
	});
});
