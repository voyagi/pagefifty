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
import { CAPTURE_ID } from '../snapshot/capture-id';
import { captureDay, SnapshotIndexSchema } from '../snapshot/index-row';

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

// records.ts globs the generated folder when Vite builds it, so a second capture cannot be added
// under a running test. The pair is proven where the folders are written, and the glob wiring by the
// loaders below, which turn into a two-capture test by themselves once a newer capture is tracked.
describe('two captures built side by side', () => {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-capture-choice-'));
	const examples = join(root, 'examples');
	const out = join(root, 'generated');

	afterAll(() => {
		rmSync(root, { recursive: true, force: true, maxRetries: 5 });
	});

	function writeDatedCapture(id: string, notice: string) {
		const folder = join(examples, id);
		mkdirSync(join(folder, 'xml'), { recursive: true });
		const listing = {
			fetchedAt: `${id}T09:00:00.000Z`,
			query: `publication-date>=${id.replaceAll('-', '')}`,
			total: 1,
			notices: [{ 'publication-number': notice }]
		};
		writeFileSync(join(folder, 'notices.json'), JSON.stringify(listing));
		copyFileSync(capturePath(notice), join(folder, 'xml', `${notice}.xml`));
	}

	it('builds both with scripts/build-records.mjs and gives the live pages the later one', () => {
		writeDatedCapture('2026-01-02', '609955-2026');
		writeDatedCapture('2026-01-09', '600779-2026');
		const run = spawnSync(
			process.execPath,
			['scripts/build-records.mjs', '--examples', examples, '--out', out],
			{ encoding: 'utf8' }
		);
		expect(run.status, run.stderr).toBe(0);
		expect(indexOf(join(out, '2026-01-02')).rows.map((row) => row.noticeNumber)).toEqual([
			'609955-2026'
		]);
		expect(indexOf(join(out, '2026-01-09')).rows.map((row) => row.noticeNumber)).toEqual([
			'600779-2026'
		]);
		expect(newestCapture(readdirSync(out))).toBe('2026-01-09');
		expect(EXAMPLE_CAPTURE).toBe('2026-09-15');
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
