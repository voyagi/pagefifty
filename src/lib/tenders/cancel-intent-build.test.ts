import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { capturePath, readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES } from '../../test/fixtures/roles';
import type { FilterState } from '../core/filters';
import { NoticeRecordSchema, SnapshotIndexSchema } from '../snapshot/index-row';
import { buildTenderList } from './list';

const CAPTURE = '2026-01-02';
const MARKED = FIXTURE_ROLES['cancel-intent-notice'].derivedFrom;
const UNMARKED = '609955-2026';
const NO_FILTER: FilterState = { countries: [], cpv: [] };

// The mark has to survive the build and the JSON files it writes, not only each function on its own:
// the site reads the written index and records, never the reader's output.
describe('a cancel-intent notice built by scripts/build-records.mjs', () => {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-cancel-intent-'));
	const examples = join(root, 'examples');
	const out = join(root, 'generated');
	let run: ReturnType<typeof spawnSync>;

	beforeAll(() => {
		const capture = join(examples, CAPTURE);
		mkdirSync(join(capture, 'xml'), { recursive: true });
		const listing = {
			fetchedAt: '2026-01-02T10:00:00.000Z',
			query: 'test capture',
			total: 2,
			notices: [MARKED, UNMARKED].map((notice) => ({ 'publication-number': notice }))
		};
		writeFileSync(join(capture, 'notices.json'), JSON.stringify(listing));
		writeFileSync(join(capture, 'xml', `${MARKED}.xml`), readFixture('cancel-intent-notice'));
		copyFileSync(capturePath(UNMARKED), join(capture, 'xml', `${UNMARKED}.xml`));
		run = spawnSync(
			process.execPath,
			['scripts/build-records.mjs', '--examples', examples, '--out', out],
			{ encoding: 'utf8' }
		);
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true, maxRetries: 5 });
	});

	const readJson = (...parts: string[]): unknown =>
		JSON.parse(readFileSync(join(out, CAPTURE, ...parts), 'utf8'));
	const builtIndex = () => SnapshotIndexSchema.parse(readJson('index.json'));
	const rowOf = (notice: string) => builtIndex().rows.find((row) => row.noticeNumber === notice);

	it('builds the capture with both notices kept', () => {
		expect(run.status, String(run.stderr)).toBe(0);
		expect(
			builtIndex()
				.rows.map((row) => row.noticeNumber)
				.sort()
		).toEqual([MARKED, UNMARKED]);
	});

	it('writes cancelIntent true on the marked row of the index file', () => {
		expect(rowOf(MARKED)?.cancelIntent).toBe(true);
	});

	it('writes no cancelIntent key on the unmarked row', () => {
		const row = rowOf(UNMARKED);
		expect(row).toBeDefined();
		expect(Object.hasOwn(row ?? {}, 'cancelIntent')).toBe(false);
	});

	it('writes cancelIntent true in the marked record file', () => {
		const record = NoticeRecordSchema.parse(readJson('records', `${MARKED}.json`));
		expect(record.cancelIntent).toBe(true);
	});

	it('carries the mark from the parsed index into the list rows', () => {
		const list = buildTenderList(builtIndex(), NO_FILTER, new Date('2026-01-02T10:00:00Z'));
		const rows = [...list.open, ...list.closed];
		const marks = Object.fromEntries(rows.map((row) => [row.noticeNumber, row.cancelIntent]));
		expect(marks).toEqual({ [MARKED]: true, [UNMARKED]: false });
	});
});
