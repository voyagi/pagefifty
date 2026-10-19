import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { capturePath } from '../../test/fixtures/node';
import { CAPTURE_ID, exampleCaptureOf, FINAL_CUTOFF } from '../snapshot/capture-id';
import { captureDay, CaptureLineSchema, SnapshotIndexSchema } from '../snapshot/index-row';

// read() needs the adapter's implementation, which only a built app provides. The stand-in reads
// the asset URL that Vite gave the generated file, from disk, the way vite dev does.
const read = vi.hoisted(() =>
	vi.fn((url: string) => new Response(readFileSync(url.replace(/^\//, '').replace(/\?.*$/, ''))))
);
vi.mock('$app/server', () => ({ read }));

const { EXAMPLE_CAPTURE, LATEST_CAPTURE, newestCapture } = await import('./records');
const { loadExampleList, loadTenderList } = await import('./tenders');

const GENERATED = join('src', 'lib', 'snapshot', 'generated');
const indexOf = (folder: string) =>
	SnapshotIndexSchema.parse(JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8')));

const tempRoots: string[] = [];

afterAll(() => {
	for (const root of tempRoots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

// A temp examples/ and generated/ pair, so the repository's own generated folder is never touched.
function tempCaptures(prefix: string) {
	const root = mkdtempSync(join(tmpdir(), prefix));
	tempRoots.push(root);
	return { examples: join(root, 'examples'), out: join(root, 'generated') };
}

function writeDatedCapture(examples: string, id: string, notice: string, openAfter?: string) {
	const folder = join(examples, id);
	mkdirSync(join(folder, 'xml'), { recursive: true });
	const listing = {
		fetchedAt: `${id}T09:00:00.000Z`,
		query: `publication-date>=${id.replaceAll('-', '')}`,
		...(openAfter !== undefined && { openAfter }),
		total: 1,
		notices: [{ 'publication-number': notice }]
	};
	writeFileSync(join(folder, 'notices.json'), JSON.stringify(listing));
	copyFileSync(capturePath(notice), join(folder, 'xml', `${notice}.xml`));
}

function buildRecords(examples: string, out: string) {
	return spawnSync(
		process.execPath,
		['scripts/build-records.mjs', '--examples', examples, '--out', out],
		{ encoding: 'utf8' }
	);
}

// Each built capture's line, keyed by its folder, as records.ts keys the lines it bundles.
function builtLines(out: string) {
	return new Map(
		readdirSync(out)
			.filter((name) => CAPTURE_ID.test(name))
			.map((id) => [
				id,
				CaptureLineSchema.parse(JSON.parse(readFileSync(join(out, id, 'capture.json'), 'utf8')))
			])
	);
}

// records.ts globs the generated folder when Vite builds it, so a second capture cannot be added
// under a running test. The pair is proven where the folders are written, and the glob wiring by the
// loaders below, which turn into a two-capture test by themselves once a newer capture is tracked.
describe('two captures built side by side', () => {
	const { examples, out } = tempCaptures('pagefifty-capture-choice-');

	it('builds both with scripts/build-records.mjs and gives the live pages the later one', () => {
		writeDatedCapture(examples, '2026-01-02', '609955-2026');
		writeDatedCapture(examples, '2026-01-09', '600779-2026');
		const run = buildRecords(examples, out);
		expect(run.status, run.stderr).toBe(0);
		expect(indexOf(join(out, '2026-01-02')).rows.map((row) => row.noticeNumber)).toEqual([
			'609955-2026'
		]);
		expect(indexOf(join(out, '2026-01-09')).rows.map((row) => row.noticeNumber)).toEqual([
			'600779-2026'
		]);
		expect(newestCapture(readdirSync(out))).toBe('2026-01-09');
		expect(exampleCaptureOf(builtLines(out))).toBe('2026-09-15');
		expect(EXAMPLE_CAPTURE).toBe('2026-09-15');
	});
});

describe('the example rule over built captures', () => {
	const { examples, out } = tempCaptures('pagefifty-example-rule-');

	it('the newest capture with an openAfter at or after the cutoff becomes the example', () => {
		writeDatedCapture(examples, '2026-01-02', '609955-2026', FINAL_CUTOFF);
		writeDatedCapture(examples, '2026-01-09', '600779-2026');
		const run = buildRecords(examples, out);
		expect(run.status, run.stderr).toBe(0);
		const lines = builtLines(out);
		expect(lines.get('2026-01-02')?.openAfter).toBe('2026-10-30T17:00:00.000Z');
		expect(lines.get('2026-01-09')?.openAfter).toBeUndefined();
		expect(exampleCaptureOf(lines)).toBe('2026-01-02');
		expect(newestCapture(lines.keys())).toBe('2026-01-09');
	});
});

describe('the live list and the example', () => {
	const tenders = new URL('http://127.0.0.1/tenders');
	const example = new URL('http://127.0.0.1/example');

	it('dates the live list by the newest generated capture and the example by 15 Sep 2026', async () => {
		const built = readdirSync(GENERATED)
			.filter((name) => CAPTURE_ID.test(name))
			.sort();
		const newest = indexOf(join(GENERATED, built[built.length - 1]));
		const live = await loadTenderList({ capture: LATEST_CAPTURE, url: tenders, now: 'capture' });
		const pinned = await loadExampleList({ url: example });
		expect(live.capture.capturedOn).toBe(captureDay(newest.capture.fetchedAt));
		expect(pinned.capture.capturedOn).toBe('15 Sep 2026');
		expect(live.capture.capturedOn === pinned.capture.capturedOn).toBe(
			LATEST_CAPTURE === '2026-09-15'
		);
	});

	it('lists 600367-2026 on the example and never 601147-2026, the version it replaced', async () => {
		const { list } = await loadExampleList({ url: example });
		const listed = [...list.open, ...list.closed].map((row) => row.noticeNumber);
		expect(listed).toContain('600367-2026');
		expect(listed).not.toContain('601147-2026');
	});
});
