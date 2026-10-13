import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_ID } from '../snapshot/capture-id';

// read() needs the adapter's implementation, which only a built app provides. The stand-in reads
// the asset URL that Vite gave the generated file, from disk, the way vite dev does.
const read = vi.hoisted(() =>
	vi.fn((url: string) => new Response(readFileSync(url.replace(/^\//, '').replace(/\?.*$/, ''))))
);
vi.mock('$app/server', () => ({ read }));

const { EXAMPLE_CAPTURE, LATEST_CAPTURE, loadIndex, loadRecord, newestCapture } =
	await import('./records');

// The shapes SvelteKit's read() really produces on the Worker. Its answer is always status 200: the
// adapter fetches the file through ASSETS inside the body stream and throws there when ASSETS
// answers 404, and a path the manifest does not hold throws before any response exists.
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
const notInManifest = (): Response => {
	throw new Error('Asset does not exist: x.json');
};

beforeEach(() => {
	read.mockClear();
});

describe('newestCapture', () => {
	it('picks the greatest capture date', () => {
		expect(newestCapture(['2026-09-15', '2026-10-11'])).toBe('2026-10-11');
	});

	it('picks the same date whatever order the names come in', () => {
		expect(newestCapture(['2026-10-11', '2026-09-15'])).toBe('2026-10-11');
	});

	it('ignores a name that is not a capture date', () => {
		expect(newestCapture(['2026-09-15', 'notes', '.tmp-2026-12-01-4'])).toBe('2026-09-15');
	});

	it('never chooses 2026-1-5, a real day written without its zeros, which would sort last', () => {
		expect(newestCapture(['2026-09-15', '2026-1-5'])).toBe('2026-09-15');
	});

	it('never chooses 2026-02-30, a date with no such day', () => {
		expect(newestCapture(['2026-01-15', '2026-02-30'])).toBe('2026-01-15');
	});

	it('never chooses 2026-99-99, a date with no such month', () => {
		expect(newestCapture(['2026-09-15', '2026-99-99'])).toBe('2026-09-15');
	});

	it('chooses 29 February in a leap year', () => {
		expect(newestCapture(['2028-02-28', '2028-02-29'])).toBe('2028-02-29');
	});

	it('names the step that writes the captures when none is built', () => {
		expect(() => newestCapture([])).toThrow(
			'no built capture: scripts/build-records.mjs writes them'
		);
		expect(() => newestCapture(['notes', '2026-02-30'])).toThrow('scripts/build-records.mjs');
	});
});

describe('the captures the pages read', () => {
	it('gives the live pages the newest capture the build wrote', () => {
		const built = readdirSync('src/lib/snapshot/generated')
			.filter((name) => CAPTURE_ID.test(name))
			.sort();
		expect(built.length).toBeGreaterThan(0);
		expect(LATEST_CAPTURE).toBe(built[built.length - 1]);
	});

	it('keeps the example on the 2026-09-15 capture', () => {
		expect(EXAMPLE_CAPTURE).toBe('2026-09-15');
	});
});

describe('loadIndex', () => {
	it('reads every notice of the example capture through read()', async () => {
		const index = await loadIndex(EXAMPLE_CAPTURE);
		expect(index.capture.id).toBe('2026-09-15');
		expect(index.rows).toHaveLength(362);
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('refuses a capture that was never built', async () => {
		await expect(loadIndex('2000-01-01')).rejects.toThrow(
			'no built records for capture 2000-01-01'
		);
	});

	it('fails the whole load when the index does not match its schema', async () => {
		read.mockImplementationOnce(() => Response.json({ capture: {}, rows: [] }));
		await expect(loadIndex(EXAMPLE_CAPTURE)).rejects.toThrow('does not match its schema');
	});

	it('names the step that writes the records when a capture was never built', async () => {
		await expect(loadIndex('2000-01-01')).rejects.toThrow('scripts/build-records.mjs writes them');
	});

	it('names the index and the cause when the Worker cannot fetch its file', async () => {
		read.mockImplementationOnce(fetchFailed);
		await expect(loadIndex(EXAMPLE_CAPTURE)).rejects.toMatchObject({
			message: expect.stringContaining(
				'the 2026-09-15 index could not be read: Error: read(...) failed: could not fetch'
			),
			cause: expect.objectContaining({ message: expect.stringContaining('read(...) failed') })
		});
	});

	it('names the index when read() refuses its path outright', async () => {
		read.mockImplementationOnce(notInManifest);
		await expect(loadIndex(EXAMPLE_CAPTURE)).rejects.toThrow(
			'the 2026-09-15 index could not be read: Error: Asset does not exist'
		);
	});

	it('names the index when its file is not JSON, keeping the parse error as the cause', async () => {
		read.mockImplementationOnce(() => new Response('<!doctype html>'));
		await expect(loadIndex(EXAMPLE_CAPTURE)).rejects.toMatchObject({
			message: expect.stringContaining('the 2026-09-15 index is not JSON'),
			cause: expect.any(SyntaxError)
		});
	});
});

describe('loadRecord', () => {
	it('reads one notice record', async () => {
		const record = await loadRecord(EXAMPLE_CAPTURE, '609955-2026');
		expect(record?.noticeNumber).toBe('609955-2026');
		expect(record?.lots[0].deadlines.tender).toBe('2026-10-06T10:30:00+02:00');
	});

	it('answers nothing for 601147-2026, the version 600367-2026 superseded', async () => {
		expect(await loadRecord(EXAMPLE_CAPTURE, '601147-2026')).toBeUndefined();
	});

	it('fails the load when a record does not match its schema', async () => {
		read.mockImplementationOnce(() => Response.json({ noticeNumber: '609955-2026', lots: 'x' }));
		await expect(loadRecord(EXAMPLE_CAPTURE, '609955-2026')).rejects.toThrow(
			'the 2026-09-15 record 609955-2026 does not match its schema'
		);
	});

	it('names the record and the cause when the Worker cannot fetch its file', async () => {
		read.mockImplementationOnce(fetchFailed);
		await expect(loadRecord(EXAMPLE_CAPTURE, '609955-2026')).rejects.toThrow(
			'the 2026-09-15 record 609955-2026 could not be read: Error: read(...) failed'
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
		expect(await loadRecord(EXAMPLE_CAPTURE, notice)).toBeUndefined();
		expect(read).not.toHaveBeenCalled();
	});
});
