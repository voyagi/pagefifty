import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createFakeClock, createScriptedTed } from '../../test/ted-stub.ts';
import { runCapture, type MeteredStep } from './run.ts';

const START = Date.parse('2026-10-11T08:00:00Z');
const PID = 6262;

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

interface OpenAfterRun {
	notices: readonly string[];
	argv: readonly string[];
	script?: Parameters<typeof createScriptedTed>[0]['script'];
	meteredSteps?: readonly MeteredStep[];
	prepare?: (root: string) => void;
}

// Each run writes under its own temp root against the stub TED, never the repository's examples/.
async function openAfterRun({ notices, argv, script, meteredSteps, prepare }: OpenAfterRun) {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-open-after-'));
	roots.push(root);
	mkdirSync(join(root, 'examples'));
	prepare?.(root);
	const clock = createFakeClock(START);
	const ted = createScriptedTed({ clock, notices, script });
	const lines: string[] = [];
	const code = await runCapture({
		root,
		transport: ted,
		clock,
		argv,
		env: {},
		head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
		pid: PID,
		isAlive: (pid) => pid === PID,
		log: (line) => lines.push(line),
		meteredSteps
	});
	return { code, lines, root, ted, folder: join(root, 'examples', '2026-10-11') };
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

const writtenNotices = (folder: string): string[] =>
	readJson(join(folder, 'notices.json')).notices.map(
		(hit: Record<string, unknown>) => hit['publication-number']
	);

describe('a capture run with --open-after', () => {
	it('a capture with --open-after keeps only notices whose every lot closes after it', async () => {
		// 624998-2026 closes 25 Sep and 604299-2026 30 Sep; 604321-2026 closes 1 Oct at 10:00 CEST
		// and both lots of 600779-2026 on 5 Oct.
		const run = await openAfterRun({
			notices: ['624998-2026', '604321-2026', '600779-2026', '604299-2026'],
			argv: ['--open-after', '2026-10-01T00:00:00Z']
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(writtenNotices(run.folder)).toEqual(['600779-2026', '604321-2026']);
		expect(readdirSync(join(run.folder, 'xml')).sort()).toEqual([
			'600779-2026.xml',
			'604321-2026.xml'
		]);
		const reason = 'a lot closes at or before 2026-10-01T00:00:00.000Z';
		const record = readJson(join(run.folder, 'run.json'));
		expect(record.notices.leftOut).toEqual([
			{ notice: '604299-2026', reason },
			{ notice: '624998-2026', reason }
		]);
		expect(record.notices.written).toBe(2);
		expect(record.openAfter).toBe('2026-10-01T00:00:00.000Z');
		const keys = Object.keys(record);
		expect(keys[keys.indexOf('modes') + 1]).toBe('openAfter');
		const listing = readJson(join(run.folder, 'notices.json'));
		expect(listing.openAfter).toBe('2026-10-01T00:00:00.000Z');
		expect(Object.keys(listing)).toEqual([
			'fetchedAt',
			'query',
			'scope',
			'onlyLatestVersions',
			'since',
			'openAfter',
			'total',
			'searchTotal',
			'notices'
		]);
	});
});
