import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// read() needs the adapter's implementation, which only a built app provides. The stand-in reads
// the asset URL that Vite gave the generated file, from disk, the way vite dev does.
const read = vi.hoisted(() =>
	vi.fn((url: string) => new Response(readFileSync(url.replace(/^\//, '').replace(/\?.*$/, ''))))
);
vi.mock('$app/server', () => ({ read }));

const { DEFAULT_CAPTURE } = await import('./records');
const { loadTenderList } = await import('./tenders');

const CAPTURE_INSTANT = new Date('2026-09-15T19:50:49.157Z');

const load = (search: string, now = CAPTURE_INSTANT) =>
	loadTenderList({
		capture: DEFAULT_CAPTURE,
		url: new URL(`http://127.0.0.1/tenders${search}`),
		now
	});

beforeEach(() => {
	read.mockClear();
});

describe('loadTenderList', () => {
	it('lists every captured notice against the instant it is given, reading the index once', async () => {
		const data = await load('');
		expect(data.list.counts).toEqual({ total: 363, shown: 363, open: 350, closed: 13 });
		expect(data.list.filtered).toBe(false);
		expect(data.dropped).toBe(false);
		expect(data.capture).toEqual({
			capturedOn: '15 Sep 2026',
			fetchedAt: '2026-09-15T19:50:49.157Z',
			firstPublished: '1 Sep 2026'
		});
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('judges open and closed by the "now" it is given, not by the capture', async () => {
		const later = await load('', new Date('2028-01-01T00:00:00Z'));
		expect(later.list.counts).toMatchObject({ total: 363, open: 0, closed: 363 });
	});

	it('reads the filters from the address and lists only the rows they match', async () => {
		const data = await load('?country=NL&cpv=72');
		expect(data.filters).toEqual({ countries: ['NL'], cpv: ['72'] });
		expect(data.dropped).toBe(false);
		expect(data.list.filtered).toBe(true);
		const rows = [...data.list.open, ...data.list.closed];
		expect(rows.length).toBe(data.list.counts.shown);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.length).toBeLessThan(363);
		expect(rows.every((row) => row.countries.includes('Netherlands'))).toBe(true);
	});

	it('flags values it does not know as dropped and still lists every notice', async () => {
		const data = await load('?country=XX&cpv=99&from=2026-02-30');
		expect(data.dropped).toBe(true);
		expect(data.filters).toEqual({ countries: [], cpv: [] });
		expect(data.list.filtered).toBe(false);
		expect(data.list.counts.shown).toBe(363);
	});

	it('fails the whole load, never a partial list, when the index cannot be read', async () => {
		read.mockImplementationOnce(
			() =>
				new Response(
					new ReadableStream({
						start(controller) {
							controller.error(new Error('read(...) failed: could not fetch (404 Not Found)'));
						}
					})
				)
		);
		await expect(load('')).rejects.toThrow('the 2026-09-15 index could not be read');
	});
});
