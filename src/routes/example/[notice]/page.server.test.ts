import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadIndex, loadRecord, snapshotDays } from '$lib/server/records';
import { load } from './+page.server';

// The newest capture is named apart from the example's, so reading the wrong one shows.
vi.mock('$lib/server/records', () => ({
	LATEST_CAPTURE: '2026-10-11',
	EXAMPLE_CAPTURE: '2026-09-15',
	loadRecord: vi.fn(async () => undefined),
	loadIndex: vi.fn(async () => {
		throw new Error('the index must not be read for a notice the snapshot does not hold');
	}),
	snapshotDays: vi.fn((capture: string) =>
		capture === '2026-09-15'
			? {
					capturedOn: '15 Sep 2026',
					fetchedAt: '2026-09-15T19:50:49.157Z',
					firstPublished: '1 Sep 2026'
				}
			: {
					capturedOn: '11 Oct 2026',
					fetchedAt: '2026-10-11T09:00:00.000Z',
					firstPublished: '27 Sep 2026'
				}
	)
}));

const UNKNOWN = {
	message: 'Not Found',
	kind: 'unknown-notice',
	capturedOn: '15 Sep 2026',
	firstPublished: '1 Sep 2026'
};

type LoadEvent = Parameters<typeof load>[0];

async function statusOf(notice: string): Promise<{ status: number; body: unknown }> {
	try {
		await load({ params: { notice } } as LoadEvent);
	} catch (error) {
		if (isHttpError(error)) return { status: error.status, body: error.body };
		throw error;
	}
	throw new Error(`${notice} loaded instead of answering 404`);
}

// The example's tender page refuses what /tenders/[notice] refuses, and reads only the tracked
// capture: the address is the one input a visitor controls here.
describe('/example/[notice] load', () => {
	beforeEach(() => {
		vi.mocked(loadRecord).mockClear();
		vi.mocked(loadIndex).mockClear();
		vi.mocked(snapshotDays).mockClear();
	});

	// A trailing newline arrives as %0A in the address; the pattern must end at the text's end.
	it.each([
		'12345',
		' ',
		'000000-0000',
		'000001-2026',
		'609955-2026x',
		'0609955-2026',
		'609955-2026\n'
	])('answers 404 for the malformed number %j without reading anything', async (notice) => {
		expect(await statusOf(notice)).toEqual({ status: 404, body: { ...UNKNOWN, notice } });
		expect(loadRecord).not.toHaveBeenCalled();
		expect(loadIndex).not.toHaveBeenCalled();
		expect(snapshotDays).toHaveBeenCalledWith('2026-09-15');
	});

	it('looks a well-formed number up in the tracked capture and answers 404 when it is not there', async () => {
		expect(await statusOf('999991-2026')).toEqual({
			status: 404,
			body: { ...UNKNOWN, notice: '999991-2026' }
		});
		expect(loadRecord).toHaveBeenCalledWith('2026-09-15', '999991-2026');
		expect(loadIndex).not.toHaveBeenCalled();
		expect(snapshotDays).toHaveBeenCalledWith('2026-09-15');
	});
});
