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
import { SnapshotIndexSchema } from './index-row';

// globalSetup has run scripts/build-records.mjs before this file, so these read its real output.
const GENERATED = join('src', 'lib', 'snapshot', 'generated');
const EXAMPLES = 'examples';

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

	it.each(folders(GENERATED))("%s: has one row per notice in the capture's total", (id) => {
		const index = SnapshotIndexSchema.parse(readJson(join(GENERATED, id, 'index.json')));
		const listing = readJson(join(EXAMPLES, id, 'notices.json')) as { total: number };
		expect(index.rows).toHaveLength(listing.total);
		expect(index.capture.total).toBe(listing.total);
	});

	it.each(folders(GENERATED))('%s: writes one compact record file per row', (id) => {
		const index = SnapshotIndexSchema.parse(readJson(join(GENERATED, id, 'index.json')));
		const files = readdirSync(join(GENERATED, id, 'records')).sort();
		expect(files).toEqual(index.rows.map((row) => `${row.noticeNumber}.json`).sort());
		expect(readFileSync(join(GENERATED, id, 'index.json'), 'utf8')).not.toContain('\n');
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
		expect(run.stdout).toMatch(/^records: 2026-01-02: 1 notices in \d+ ms/);
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
