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
});

describe('loadRecord', () => {
	it('reads one notice record', async () => {
		const record = await loadRecord(DEFAULT_CAPTURE, '609955-2026');
		expect(record?.noticeNumber).toBe('609955-2026');
		expect(record?.lots[0].deadlines.tender).toBe('2026-10-06T10:30:00+02:00');
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
