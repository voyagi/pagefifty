import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// read() needs the adapter's implementation, which only a built app provides. The stand-in reads
// the asset URL that Vite gave the generated file, from disk, the way vite dev does.
const read = vi.hoisted(() =>
	vi.fn((url: string) => new Response(readFileSync(url.replace(/^\//, '').replace(/\?.*$/, ''))))
);
vi.mock('$app/server', () => ({ read }));

const { DEFAULT_CAPTURE, loadIndex, loadRecord } = await import('./records');

beforeEach(() => {
	read.mockClear();
});

describe('loadIndex', () => {
	it('reads every notice of the default capture through read()', async () => {
		const index = await loadIndex(DEFAULT_CAPTURE);
		expect(index.capture.id).toBe('2026-09-15');
		expect(index.rows).toHaveLength(363);
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('refuses a capture that was never built', async () => {
		await expect(loadIndex('2000-01-01')).rejects.toThrow(
			'no built records for capture 2000-01-01'
		);
	});

	it('fails the whole load when the index does not match its schema', async () => {
		read.mockImplementationOnce(() => Response.json({ capture: {}, rows: [] }));
		await expect(loadIndex(DEFAULT_CAPTURE)).rejects.toThrow('does not match its schema');
	});

	it('names the step that writes the records when a capture was never built', async () => {
		await expect(loadIndex('2000-01-01')).rejects.toThrow('scripts/build-records.mjs writes them');
	});

	// On the Worker, ASSETS answers a file that is not there with a 404 and a body that is no JSON.
	it('names the index and the status when the file cannot be read', async () => {
		read.mockImplementationOnce(() => new Response('Not Found', { status: 404 }));
		await expect(loadIndex(DEFAULT_CAPTURE)).rejects.toThrow(
			'the 2026-09-15 index could not be read: HTTP 404'
		);
	});

	it('names the index when its file is not JSON', async () => {
		read.mockImplementationOnce(() => new Response('<!doctype html>'));
		await expect(loadIndex(DEFAULT_CAPTURE)).rejects.toThrow('the 2026-09-15 index is not JSON');
	});
});

describe('loadRecord', () => {
	it('reads one notice record', async () => {
		const record = await loadRecord(DEFAULT_CAPTURE, '609955-2026');
		expect(record?.noticeNumber).toBe('609955-2026');
		expect(record?.lots[0].deadlines.tender).toBe('2026-10-06T10:30:00+02:00');
	});

	it('fails the load when a record does not match its schema', async () => {
		read.mockImplementationOnce(() => Response.json({ noticeNumber: '609955-2026', lots: 'x' }));
		await expect(loadRecord(DEFAULT_CAPTURE, '609955-2026')).rejects.toThrow(
			'the 2026-09-15 record 609955-2026 does not match its schema'
		);
	});

	it('names the record and the status when its file cannot be read', async () => {
		read.mockImplementationOnce(() => new Response('Not Found', { status: 404 }));
		await expect(loadRecord(DEFAULT_CAPTURE, '609955-2026')).rejects.toThrow(
			'the 2026-09-15 record 609955-2026 could not be read: HTTP 404'
		);
	});

	it.each([
		'000000-0000',
		'00609955-2026',
		'609955-2026 ',
		' ',
		'../index',
		'6099552026',
		'12345-2025'
	])('answers %j with nothing and never reads', async (notice) => {
		expect(await loadRecord(DEFAULT_CAPTURE, notice)).toBeUndefined();
		expect(read).not.toHaveBeenCalled();
	});
});
