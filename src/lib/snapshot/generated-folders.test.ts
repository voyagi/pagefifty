import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { capturePath } from '../../test/fixtures/node';
import { readReplyFixture } from '../../test/fixtures/replies';
import { CAPTURE_ID } from '../../test/fixtures/roles';
import { readingKey } from '../capture/model-read';
import { MODEL_READ, promptSha256, readReply, userMessage } from '../capture/token-factory';
import { CaptureLineSchema, NoticeRecordSchema, SnapshotIndexSchema } from './index-row';
import { NoticeReadingsSchema, ReadingsFileSchema } from './readings';

// globalSetup has run scripts/build-records.mjs before this file, so these read its real output.
const GENERATED = join('src', 'lib', 'snapshot', 'generated');
const EXAMPLES = 'examples';
// Two versions of notice ad28f539 in the capture: 600367-2026 is VersionID 02, 601147-2026 is 01.
const LATEST = '600367-2026';
const SUPERSEDED = '601147-2026';

const folders = (dir: string) =>
	readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
		.map((entry) => entry.name);

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('generated record folders', () => {
	const generated = folders(GENERATED);

	it('holds at least one capture', () => {
		expect(generated.length).toBeGreaterThan(0);
	});

	it('names every generated folder after a capture folder under examples', () => {
		const examples = new Set(folders(EXAMPLES));
		expect(generated.filter((id) => !examples.has(id))).toEqual([]);
	});

	it.each(folders(GENERATED))('%s: its index names this capture and parses', (id) => {
		const index = SnapshotIndexSchema.parse(readJson(join(GENERATED, id, 'index.json')));
		expect(index.capture.id).toBe(id);
	});

	// The server bundles capture.json so a 404 names the days; it must be the index's own line.
	it.each(folders(GENERATED))('%s: writes capture.json as the index capture line', (id) => {
		const index = SnapshotIndexSchema.parse(readJson(join(GENERATED, id, 'index.json')));
		expect(CaptureLineSchema.parse(readJson(join(GENERATED, id, 'capture.json')))).toEqual(
			index.capture
		);
	});

	it.each(folders(GENERATED))(
		"%s: has one row per listed notice it kept, and TED's stated total",
		(id) => {
			const index = SnapshotIndexSchema.parse(readJson(join(GENERATED, id, 'index.json')));
			const listing = readJson(join(EXAMPLES, id, 'notices.json')) as {
				total: number;
				searchTotal?: number;
			};
			expect(index.rows).toHaveLength(listing.total - index.leftOut.length);
			expect(index.capture.total).toBe(listing.searchTotal ?? listing.total);
		}
	);

	it(`${CAPTURE_ID}: leaves out 601147-2026, superseded by 600367-2026, and keeps the listed total`, () => {
		const index = SnapshotIndexSchema.parse(readJson(join(GENERATED, CAPTURE_ID, 'index.json')));
		const listing = readJson(join(EXAMPLES, CAPTURE_ID, 'notices.json')) as {
			notices: { 'publication-number': string }[];
		};
		const listed = listing.notices.map((notice) => notice['publication-number']);
		const served = index.rows.map((row) => row.noticeNumber);
		expect(served.sort()).toEqual(listed.filter((notice) => notice !== SUPERSEDED).sort());
		expect(index.leftOut).toEqual([{ notice: SUPERSEDED, reason: `superseded by ${LATEST}` }]);
		expect(index.capture.total).toBe(363);
		expect(existsSync(join(GENERATED, CAPTURE_ID, 'records', `${SUPERSEDED}.json`))).toBe(false);
	});

	it.each(folders(GENERATED))('%s: writes one compact record file per row', (id) => {
		const index = SnapshotIndexSchema.parse(readJson(join(GENERATED, id, 'index.json')));
		const files = readdirSync(join(GENERATED, id, 'records')).sort();
		expect(files).toEqual(index.rows.map((row) => `${row.noticeNumber}.json`).sort());
		expect(readFileSync(join(GENERATED, id, 'index.json'), 'utf8')).not.toContain('\n');
	});
});

// The two lots spike 004 read with the capture command's own prompt and settings, thinking off.
const READ_LOTS = [
	{ notice: '610242-2026', lot: 'LOT-0000', fixture: 'de-610242-thinking-off', items: 14 },
	{ notice: '634398-2026', lot: 'LOT-0001', fixture: 'nl-634398-super', items: 10 }
] as const;
const EXAMPLE_READINGS = join(EXAMPLES, CAPTURE_ID, 'readings.json');

interface RecordedUsage {
	id: string;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		completion_tokens_details?: { reasoning_tokens?: number };
	};
	choices: { message: { content: string } }[];
}

describe('the example capture readings', () => {
	it('the example readings carry the two lots spike 004 read with the command settings', () => {
		expect(existsSync(EXAMPLE_READINGS)).toBe(true);
		const text = readFileSync(EXAMPLE_READINGS, 'utf8');
		const file = ReadingsFileSchema.parse(JSON.parse(text));
		expect(text).toBe(`${JSON.stringify(file, null, 2)}\n`);
		expect(file.run).toEqual({
			model: MODEL_READ.id,
			provider: 'Nebius Token Factory',
			region: 'us-central1',
			thinking: false,
			runDate: '2026-10-15',
			prices: { inputUsdPerMillion: '0.30', outputUsdPerMillion: '0.90', listedOn: '2026-10-15' },
			lots: { withCriteria: 2, read: 2, reused: 0, notRead: 0 },
			sends: 2,
			tokens: { input: 2811, output: 2563, reasoning: 0 },
			costUsd: '0.003150',
			quotes: { verified: 24, rejected: 0 }
		});
		expect(file.notices.map(({ notice }) => notice)).toEqual(READ_LOTS.map(({ notice }) => notice));
		expect(file.readings).toHaveLength(READ_LOTS.length);
		for (const { notice, lot, fixture, items } of READ_LOTS) {
			const record = NoticeRecordSchema.parse(
				readJson(join(GENERATED, CAPTURE_ID, 'records', `${notice}.json`))
			);
			const criteria = record.lots.find((each) => each.id === lot)?.criteria ?? [];
			const { textSha256 } = readingKey(notice, userMessage(criteria));
			expect(file.notices.find((each) => each.notice === notice)?.lots).toEqual([
				{ lot, status: 'read', textSha256 }
			]);
			const response = readReplyFixture(fixture).response as unknown as RecordedUsage;
			const reply = readReply(response.choices[0].message.content);
			const entry = file.readings.find((each) => each.notice === notice);
			expect(entry).toEqual({
				notice,
				textSha256,
				promptSha256,
				model: MODEL_READ.id,
				readOn: '2026-10-15',
				responseId: response.id,
				usage: {
					input: response.usage.prompt_tokens,
					output: response.usage.completion_tokens,
					reasoning: response.usage.completion_tokens_details?.reasoning_tokens ?? 0
				},
				items: reply.ok ? reply.items : []
			});
			expect(entry?.items).toHaveLength(items);
		}
	});

	it('the records build writes the example readings beside its records', () => {
		const built = join(GENERATED, CAPTURE_ID);
		expect(existsSync(join(built, 'reading-run.json'))).toBe(true);
		expect(existsSync(join(built, 'readings'))).toBe(true);
		const file = ReadingsFileSchema.parse(readJson(EXAMPLE_READINGS));
		expect(readJson(join(built, 'reading-run.json'))).toEqual(file.run);
		expect(readdirSync(join(built, 'readings')).sort()).toEqual(
			READ_LOTS.map(({ notice }) => `${notice}.json`)
		);
		for (const { notice, lots } of file.notices) {
			const written = NoticeReadingsSchema.parse(
				readJson(join(built, 'readings', `${notice}.json`))
			);
			expect(written).toEqual({
				notice,
				lots,
				readings: file.readings.filter((each) => each.notice === notice)
			});
		}
		// A capture with no readings.json gets neither, so its pages keep the phase 1 view.
		for (const id of folders(GENERATED).filter((each) => each !== CAPTURE_ID)) {
			expect(existsSync(join(EXAMPLES, id, 'readings.json'))).toBe(false);
			expect(existsSync(join(GENERATED, id, 'readings'))).toBe(false);
			expect(existsSync(join(GENERATED, id, 'reading-run.json'))).toBe(false);
		}
		expect(folders(GENERATED)).toContain('2026-10-16');
	});
});

describe('scripts/build-records.mjs on a capture it cannot read', () => {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-records-'));
	const capture = join(root, 'examples', '2026-01-02');
	const out = join(root, 'generated');

	afterAll(() => {
		rmSync(root, { recursive: true, force: true, maxRetries: 5 });
	});

	function writeCapture(notices: string[]) {
		rmSync(capture, { recursive: true, force: true });
		mkdirSync(join(capture, 'xml'), { recursive: true });
		const listing = {
			fetchedAt: '2026-01-02T10:00:00.000Z',
			query: 'test capture',
			total: notices.length,
			notices: notices.map((notice) => ({ 'publication-number': notice }))
		};
		writeFileSync(join(capture, 'notices.json'), JSON.stringify(listing));
		copyFileSync(capturePath('609955-2026'), join(capture, 'xml', '609955-2026.xml'));
	}

	const build = () =>
		spawnSync(
			process.execPath,
			['scripts/build-records.mjs', '--examples', join(root, 'examples'), '--out', out],
			{ encoding: 'utf8' }
		);

	it('writes the records when every listed notice reads', () => {
		writeCapture(['609955-2026']);
		const run = build();
		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toMatch(/^records: 2026-01-02: 1 notices in \d+ ms\r?\n/);
		expect(existsSync(join(out, '2026-01-02', 'records', '609955-2026.json'))).toBe(true);
	});

	it('fails naming each notice and its failure kind, and leaves the old records in place', () => {
		writeCapture(['609955-2026', '600001-2026', '600002-2026']);
		writeFileSync(join(capture, 'xml', '600001-2026.xml'), '<ContractNotice><cbc:Name>');
		const run = build();
		expect(run.status).toBe(1);
		expect(run.stderr).toContain('records: 2026-01-02: 600001-2026: malformed:');
		expect(run.stderr).toContain('records: 2026-01-02: 600002-2026: missing: snapshot miss');
		expect(run.stderr).toContain('nothing was written');
		const kept = readJson(join(out, '2026-01-02', 'index.json')) as { rows: unknown[] };
		expect(kept.rows).toHaveLength(1);
		expect(readdirSync(out).filter((name) => name.startsWith('.tmp-'))).toEqual([]);
	});

	it('refuses a listed notice number the pages could not serve, and writes nothing', () => {
		writeCapture(['0609955-2026']);
		copyFileSync(capturePath('609955-2026'), join(capture, 'xml', '0609955-2026.xml'));
		const run = build();
		expect(run.status).toBe(1);
		expect(run.stderr).toContain('records: 2026-01-02: 0609955-2026: record:');
		expect(run.stderr).toContain('noticeNumber');
		expect(existsSync(join(out, '2026-01-02', 'records', '0609955-2026.json'))).toBe(false);
	});

	it.each([
		['is not JSON', '{"notices": [', 'could not be read as JSON'],
		['has no notices list', '{"fetchedAt": "2026-01-02T10:00:00.000Z"}', 'holds no notices list']
	])('fails naming the capture when its notices.json %s', (_what, listing, named) => {
		writeCapture(['609955-2026']);
		expect(build().status).toBe(0);
		writeFileSync(join(capture, 'notices.json'), listing);
		const run = build();
		expect(run.status).toBe(1);
		expect(run.stderr).toContain('records: 2026-01-02:');
		expect(run.stderr).toContain(named);
		const kept = readJson(join(out, '2026-01-02', 'index.json')) as { rows: unknown[] };
		expect(kept.rows).toHaveLength(1);
	});

	it('refuses a listing whose total disagrees with the notices it lists, keeping the old records', () => {
		writeCapture(['609955-2026']);
		expect(build().status).toBe(0);
		const listing = readJson(join(capture, 'notices.json')) as Record<string, unknown>;
		writeFileSync(join(capture, 'notices.json'), JSON.stringify({ ...listing, total: 5 }));
		const run = build();
		expect(run.status).toBe(1);
		expect(run.stderr).toContain(
			'records: 2026-01-02: (listing): listing: total is 5 but 1 notices are listed'
		);
		const kept = readJson(join(out, '2026-01-02', 'index.json')) as { capture: { total: number } };
		expect(kept.capture.total).toBe(1);
	});

	it('refuses a listing whose query names a first publication day that does not exist', () => {
		writeCapture(['609955-2026']);
		expect(build().status).toBe(0);
		const listing = readJson(join(capture, 'notices.json')) as Record<string, unknown>;
		const query = 'publication-date>=20261340';
		writeFileSync(join(capture, 'notices.json'), JSON.stringify({ ...listing, query }));
		const run = build();
		expect(run.status).toBe(1);
		expect(run.stderr).toContain('records: 2026-01-02: (index): index:');
		expect(run.stderr).toContain('publication-date>= names no calendar day');
		const kept = readJson(join(out, '2026-01-02', 'index.json')) as { capture: { query: string } };
		expect(kept.capture.query).toBe('test capture');
	});

	// The live pages skip a folder named for a day that does not exist, so the build names it rather
	// than write a capture no page would serve, or, as the only one, leave every page failing.
	it('refuses a capture folder named for a day that does not exist, and writes nothing', () => {
		writeCapture(['609955-2026']);
		expect(build().status).toBe(0);
		const mistyped = join(root, 'examples', '2026-02-30');
		try {
			mkdirSync(join(mistyped, 'xml'), { recursive: true });
			copyFileSync(join(capture, 'notices.json'), join(mistyped, 'notices.json'));
			copyFileSync(capturePath('609955-2026'), join(mistyped, 'xml', '609955-2026.xml'));
			const run = build();
			expect(run.status).toBe(1);
			expect(run.stderr).toContain('records: 2026-02-30: (index): index:');
			expect(run.stderr).toContain('a capture is named by a calendar day');
			expect(existsSync(join(out, '2026-02-30'))).toBe(false);
		} finally {
			rmSync(mistyped, { recursive: true, force: true });
		}
	});

	it.each([
		['absent', {}],
		['empty', { 'publication-number': '' }]
	])('names each notice whose number is %s, never as a repeat of another', (_what, numberless) => {
		writeCapture(['609955-2026']);
		const listing = readJson(join(capture, 'notices.json')) as Record<string, unknown>;
		const notices = [{ 'publication-number': '609955-2026' }, numberless, numberless];
		writeFileSync(join(capture, 'notices.json'), JSON.stringify({ ...listing, total: 3, notices }));
		const run = build();
		expect(run.status).toBe(1);
		const named = run.stderr.match(
			/\(none\): listing: a notice in notices\.json has no publication-number/g
		);
		expect(named).toHaveLength(2);
		expect(run.stderr).not.toContain('listed more than once');
		expect(run.stderr).not.toContain('undefined');
	});

	// Every file under the out folder with its bytes, so "unchanged" covers names and contents.
	function folderState(dir: string): Record<string, string> {
		const state: Record<string, string> = {};
		for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
			if (!entry.isFile()) continue;
			const path = join(entry.parentPath, entry.name);
			state[path] = readFileSync(path, 'utf8');
		}
		return state;
	}

	const exampleRun = () => ReadingsFileSchema.parse(readJson(EXAMPLE_READINGS)).run;

	it.each([
		['missing its run', () => ({ schemaVersion: 1, notices: [], readings: [] }), 'run'],
		[
			'naming a notice that is no TED notice number',
			() => ({
				schemaVersion: 1,
				run: exampleRun(),
				notices: [{ notice: '../../escape', lots: [] }],
				readings: []
			}),
			'"../../escape" is not a TED notice number'
		]
	])(
		'a readings file the schema refuses stops the build and writes nothing: %s',
		(_what, readings, named) => {
			writeCapture(['609955-2026']);
			expect(build().status).toBe(0);
			const before = folderState(out);
			writeFileSync(join(capture, 'readings.json'), JSON.stringify(readings()));
			const run = build();
			expect(run.status).toBe(1);
			expect(run.stderr).toContain('records: 2026-01-02: (readings): readings: ');
			expect(run.stderr).toContain(join(capture, 'readings.json'));
			expect(run.stderr).toContain(named);
			expect(run.stderr).toContain('nothing was written');
			expect(folderState(out)).toEqual(before);
			expect(existsSync(join(root, 'escape'))).toBe(false);
		}
	);

	it('writes the readings of a capture whose readings.json parses, and none for one without', () => {
		writeCapture(['609955-2026']);
		expect(build().status).toBe(0);
		expect(existsSync(join(out, '2026-01-02', 'readings'))).toBe(false);
		expect(existsSync(join(out, '2026-01-02', 'reading-run.json'))).toBe(false);
		const readings = {
			schemaVersion: 1,
			run: exampleRun(),
			notices: [{ notice: '609955-2026', lots: [{ lot: 'LOT-0000', status: 'no-criteria' }] }],
			readings: []
		};
		writeFileSync(join(capture, 'readings.json'), JSON.stringify(readings));
		const run = build();
		expect(run.status, run.stderr).toBe(0);
		expect(readJson(join(out, '2026-01-02', 'readings', '609955-2026.json'))).toEqual({
			notice: '609955-2026',
			lots: readings.notices[0].lots,
			readings: []
		});
		expect(readJson(join(out, '2026-01-02', 'reading-run.json'))).toEqual(readings.run);
	});

	const searchesOf = (url: string, notice = '609955-2026') => ({
		schemaVersion: 1,
		run: { searches: 1, notSearched: 0, credits: 1 },
		notices: [
			{
				notice,
				status: 'searched',
				query: 'Ein Auftraggeber Vergabe Zuschlag IT Dienstleistungen',
				results: [{ title: 'Earlier awards of a buyer', url, score: 0.5 }]
			}
		]
	});

	it('writes the searches of a capture whose searches.json parses, and none for one without', () => {
		writeCapture(['609955-2026']);
		expect(build().status).toBe(0);
		expect(existsSync(join(out, '2026-01-02', 'searches'))).toBe(false);
		expect(existsSync(join(out, '2026-01-02', 'search-run.json'))).toBe(false);
		const searches = searchesOf('https://awards.example/buyer');
		writeFileSync(join(capture, 'searches.json'), JSON.stringify(searches));
		const run = build();
		expect(run.status, run.stderr).toBe(0);
		expect(existsSync(join(out, '2026-01-02', 'searches'))).toBe(true);
		expect(readdirSync(join(out, '2026-01-02', 'searches'))).toEqual(['609955-2026.json']);
		expect(readJson(join(out, '2026-01-02', 'searches', '609955-2026.json'))).toEqual(
			searches.notices[0]
		);
		expect(readJson(join(out, '2026-01-02', 'search-run.json'))).toEqual(searches.run);
	});

	it.each([
		[
			'holding a result whose address is not http or https',
			searchesOf('javascript:alert(1)'),
			'url'
		],
		[
			'naming a notice that is no TED notice number',
			searchesOf('https://awards.example/buyer', '../../escape'),
			'"../../escape" is not a TED notice number'
		]
	])(
		'a searches file the schema refuses stops the build and writes nothing: %s',
		(_what, searches, named) => {
			writeCapture(['609955-2026']);
			expect(build().status).toBe(0);
			const before = folderState(out);
			writeFileSync(join(capture, 'searches.json'), JSON.stringify(searches));
			const run = build();
			expect(run.status).toBe(1);
			expect(run.stderr).toContain('records: 2026-01-02: (searches): searches: ');
			expect(run.stderr).toContain(join(capture, 'searches.json'));
			expect(run.stderr).toContain(named);
			expect(run.stderr).toContain('nothing was written');
			expect(folderState(out)).toEqual(before);
			expect(existsSync(join(root, 'escape'))).toBe(false);
		}
	);

	it('replaces the records of a rebuilt capture and leaves no set-aside folder', () => {
		writeCapture(['609955-2026']);
		expect(build().status).toBe(0);
		const run = build();
		expect(run.status, run.stderr).toBe(0);
		expect(existsSync(join(out, '2026-01-02', 'records', '609955-2026.json'))).toBe(true);
		expect(readdirSync(out).filter((name) => name.startsWith('.'))).toEqual([]);
	});

	it('removes an old set-aside folder an earlier run could not delete', () => {
		writeCapture(['609955-2026']);
		expect(build().status).toBe(0);
		mkdirSync(join(out, '.old-2026-01-02-999', 'records'), { recursive: true });
		const run = build();
		expect(run.status, run.stderr).toBe(0);
		expect(readdirSync(out).filter((name) => name.startsWith('.'))).toEqual([]);
	});

	it.each([
		['newer first', [LATEST, SUPERSEDED]],
		['older first', [SUPERSEDED, LATEST]]
	])('keeps only the latest version of a notice listed %s', (_order, listed) => {
		writeCapture(listed);
		for (const notice of listed) {
			copyFileSync(capturePath(notice), join(capture, 'xml', `${notice}.xml`));
		}
		const run = build();
		expect(run.status, run.stderr).toBe(0);
		const index = SnapshotIndexSchema.parse(readJson(join(out, '2026-01-02', 'index.json')));
		expect(index.rows.map((row) => row.noticeNumber)).toEqual([LATEST]);
		expect(index.leftOut).toEqual([{ notice: SUPERSEDED, reason: `superseded by ${LATEST}` }]);
		expect(existsSync(join(out, '2026-01-02', 'records', `${SUPERSEDED}.json`))).toBe(false);
		expect(run.stdout).toMatch(
			/^records: 2026-01-02: 1 notices in \d+ ms, 1 left out: 601147-2026 \(superseded by 600367-2026\)\r?\n/
		);
	});

	it('names the notice when reading its recorded response fails', () => {
		writeCapture(['609955-2026', '600003-2026']);
		mkdirSync(join(capture, 'xml', '600003-2026.xml'));
		const run = build();
		expect(run.status).toBe(1);
		expect(run.stderr).toContain('records: 2026-01-02: 600003-2026: reading stopped:');
	});

	it('exits 2 when no capture folder holds a notices.json', () => {
		const run = spawnSync(
			process.execPath,
			['scripts/build-records.mjs', '--examples', join(root, 'none'), '--out', out],
			{ encoding: 'utf8' }
		);
		expect(run.status).toBe(2);
		expect(run.stderr).toContain('no capture folder');
	});
});
