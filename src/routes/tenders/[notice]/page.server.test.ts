import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadIndex, loadRecord } from '$lib/server/records';
import { load } from './+page.server';

vi.mock('$lib/server/records', () => ({
	DEFAULT_CAPTURE: '2026-09-15',
	loadRecord: vi.fn(async () => undefined),
	loadIndex: vi.fn(async () => {
		throw new Error('the index must not be read for a notice the snapshot does not hold');
	})
}));

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

describe('/tenders/[notice] load', () => {
	beforeEach(() => {
		vi.mocked(loadRecord).mockClear();
		vi.mocked(loadIndex).mockClear();
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
		expect(await statusOf(notice)).toEqual({
			status: 404,
			body: { message: 'Not Found', kind: 'unknown-notice', notice }
		});
		expect(loadRecord).not.toHaveBeenCalled();
		expect(loadIndex).not.toHaveBeenCalled();
	});

	it('answers 404 with kind unknown-notice for a well-formed number the snapshot does not hold', async () => {
		expect(await statusOf('999991-2026')).toEqual({
			status: 404,
			body: { message: 'Not Found', kind: 'unknown-notice', notice: '999991-2026' }
		});
		expect(loadRecord).toHaveBeenCalledWith('2026-09-15', '999991-2026');
		expect(loadIndex).not.toHaveBeenCalled();
	});

	it('answers each of several parallel unknown notices with its own 404', async () => {
		const notices = ['999991-2026', '999992-2026', '999993-2026'];
		const results = await Promise.all(notices.map(statusOf));
		expect(results.map((result) => result.status)).toEqual([404, 404, 404]);
		expect(results.map((result) => (result.body as { notice: string }).notice)).toEqual(notices);
	});
});
