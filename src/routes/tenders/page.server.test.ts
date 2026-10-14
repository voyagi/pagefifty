import { describe, expect, it, vi } from 'vitest';
import { loadTenderList } from '$lib/server/tenders';
import { load } from './+page.server';

// The newest capture is named apart from the example's, so reading the wrong one shows while
// 2026-09-15 is still the only capture built.
vi.mock('$lib/server/records', () => ({
	LATEST_CAPTURE: '2026-10-11',
	EXAMPLE_CAPTURE: '2026-09-15'
}));
vi.mock('$lib/server/tenders', () => ({ loadTenderList: vi.fn(async () => ({})) }));

type LoadEvent = Parameters<typeof load>[0];

describe('/tenders load', () => {
	it('lists the newest capture, judged against the real clock', async () => {
		const url = new URL('http://127.0.0.1/tenders?country=NL');
		const before = Date.now();
		await load({ url } as LoadEvent);
		const [args] = vi.mocked(loadTenderList).mock.calls[0];
		expect(args.capture).toBe('2026-10-11');
		expect(args.url).toBe(url);
		expect(args.now).toBeInstanceOf(Date);
		expect((args.now as Date).getTime()).toBeGreaterThanOrEqual(before);
	});
});
