import { readFileSync } from 'node:fs';
import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// read() needs the adapter's implementation, which only a built app provides. The stand-in reads
// the asset URL that Vite gave the generated file, from disk, the way vite dev does.
const { fromDisk, read } = vi.hoisted(() => {
	const fromDisk = (url: string) =>
		new Response(readFileSync(url.replace(/^\//, '').replace(/\?.*$/, '')));
	return { fromDisk, read: vi.fn(fromDisk) };
});
vi.mock('$app/server', () => ({ read }));

const { EXAMPLE_CAPTURE } = await import('./records');
const { loadTenderPage } = await import('./tender-page');

const CAPTURE_INSTANT = new Date('2026-09-15T19:50:49.157Z');
// The days the error page names for the example's capture, from its built capture line.
const UNKNOWN = {
	message: 'Not Found',
	kind: 'unknown-notice',
	capturedOn: '15 Sep 2026',
	firstPublished: '1 Sep 2026'
};

// The Worker's own failure shape: read() answers at once and the body stream fails when ASSETS
// answers 404 (records.test.ts holds the other shapes).
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

async function failureOf(load: Promise<unknown>): Promise<unknown> {
	try {
		await load;
	} catch (error) {
		return error;
	}
	throw new Error('the load succeeded instead of failing');
}

const load = (notice: string) =>
	loadTenderPage({ capture: EXAMPLE_CAPTURE, notice, now: CAPTURE_INSTANT });

beforeEach(() => {
	read.mockClear();
});

describe('loadTenderPage', () => {
	it('reads the record, then the index for the capture day in the leaf foot', async () => {
		const data = await load('609955-2026');
		expect(data.tender.noticeNumber).toBe('609955-2026');
		expect(data.capture.capturedOn).toBe('15 Sep 2026');
		expect(read.mock.calls.map(([url]) => /records\/|index\.json/.exec(String(url))?.[0])).toEqual([
			'records/',
			'index.json'
		]);
	});

	it('answers a well-formed number the snapshot does not hold with the unknown-notice 404, reading nothing', async () => {
		const error = await failureOf(load('999991-2026'));
		expect(isHttpError(error) && { status: error.status, body: error.body }).toEqual({
			status: 404,
			body: { ...UNKNOWN, notice: '999991-2026' }
		});
		expect(read).not.toHaveBeenCalled();
	});

	// The capture lists 601147-2026, but the build leaves it out as the version 600367-2026 replaced.
	it('answers 601147-2026, the version 600367-2026 replaced, with the unknown-notice 404', async () => {
		const error = await failureOf(load('601147-2026'));
		expect(isHttpError(error) && { status: error.status, body: error.body }).toEqual({
			status: 404,
			body: { ...UNKNOWN, notice: '601147-2026' }
		});
		expect(read).not.toHaveBeenCalled();
	});

	it('fails with a server error, never a 404 naming no days, when a capture has no built line', async () => {
		const error = await failureOf(
			loadTenderPage({ capture: '2026-02-01', notice: '999991-2026', now: CAPTURE_INSTANT })
		);
		expect(isHttpError(error)).toBe(false);
		expect(String(error)).toContain('no built capture line for capture 2026-02-01');
	});

	// The snapshot holds these notices, so a failed read is the server's fault: the 404 would tell the
	// visitor the notice is not in the snapshot, which is false.
	it('fails with a server error, never the 404, when a record the snapshot holds cannot be read', async () => {
		read.mockImplementationOnce(fetchFailed);
		const error = await failureOf(load('609955-2026'));
		expect(isHttpError(error)).toBe(false);
		expect(String(error)).toContain('the 2026-09-15 record 609955-2026 could not be read');
	});

	it('fails with a server error, never the 404, when a record does not match its schema', async () => {
		read.mockImplementationOnce(() => Response.json({ noticeNumber: '609955-2026', lots: 'x' }));
		const error = await failureOf(load('609955-2026'));
		expect(isHttpError(error)).toBe(false);
		expect(String(error)).toContain('the 2026-09-15 record 609955-2026 does not match its schema');
	});

	it('fails with a server error, never the 404, when the index fails after the record was read', async () => {
		read.mockImplementationOnce(fromDisk).mockImplementationOnce(fetchFailed);
		const error = await failureOf(load('609955-2026'));
		expect(isHttpError(error)).toBe(false);
		expect(String(error)).toContain('the 2026-09-15 index could not be read');
		expect(read).toHaveBeenCalledTimes(2);
	});
});
