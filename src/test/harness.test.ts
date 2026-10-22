import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { REASON_LINES } from '../lib/tenders/verdict-view';
import {
	devBrowserStatus,
	exampleFacts,
	marginWarnings,
	npmCliPath,
	reasonLine,
	reasonLines,
	tallyChecks,
	wranglerDevArgs
} from '../../scripts/harness.mjs';

// Stand-ins for dev-browser's status command. The first starts a daemon and exits, as the real one
// does when none runs: the daemon keeps the output it inherited, and a synchronous spawn that pipes
// the output waits for every holder to close it, which hung npm run test:e2e for 25 minutes.
const STARTS_A_DAEMON = `
import { spawn } from 'node:child_process';
spawn(process.execPath, ['-e', 'setTimeout(() => {}, 8000)'], { detached: true, stdio: 'inherit' }).unref();
`;
const NEVER_ANSWERS = 'setTimeout(() => {}, 8000);';

function standIn(source: string): { script: string; folder: string } {
	const folder = mkdtempSync(join(tmpdir(), 'pagefifty-status-'));
	const script = join(folder, 'status.mjs');
	writeFileSync(script, source);
	return { script, folder };
}

describe('the dev-browser status call', () => {
	it('returns once the command exits, even while a daemon it started keeps running', () => {
		const { script, folder } = standIn(STARTS_A_DAEMON);
		try {
			const started = Date.now();
			const run = devBrowserStatus(process.execPath, [script], 20_000);
			expect(Date.now() - started).toBeLessThan(4_000);
			expect([run.status, run.error]).toEqual([0, undefined]);
		} finally {
			rmSync(folder, { recursive: true, force: true });
		}
	});

	it('stops waiting for a command that never answers once its time is up', () => {
		const { script, folder } = standIn(NEVER_ANSWERS);
		try {
			const started = Date.now();
			const run = devBrowserStatus(process.execPath, [script], 1_000);
			expect(Date.now() - started).toBeLessThan(4_000);
			expect((run.error as NodeJS.ErrnoException | undefined)?.code).toBe('ETIMEDOUT');
		} finally {
			rmSync(folder, { recursive: true, force: true });
		}
	});
});

// The run lock lives under the home folder, so its rules are tried in a child whose home is a
// throwaway folder; the child refuses to touch anything if the harness resolved another home.
const LOCK_SCENARIOS = `
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const harness = await import(process.argv[2]);
const { DEV_BROWSER_TMP, acquireRunLock, assertRunLock, releaseRunLock, takeOverStaleLock } = harness;
if (!DEV_BROWSER_TMP.startsWith(process.env.USERPROFILE)) throw new Error('not the throwaway home');
const lock = join(DEV_BROWSER_TMP, 'pagefifty-browser-run.lock');
const folder = lock + '.takeover';
const ago = (ms) => new Date(Date.now() - ms);
const plant = (ageMs) => {
	mkdirSync(DEV_BROWSER_TMP, { recursive: true });
	const raw = JSON.stringify({ pid: process.pid, cwd: 'planted' });
	writeFileSync(lock, raw);
	utimesSync(lock, ago(ageMs), ago(ageMs));
	return raw;
};
const results = {};
const fresh = plant(0);
results.fresh = [takeOverStaleLock(), readFileSync(lock, 'utf8') === fresh, existsSync(folder)];
plant(600_000);
results.stale = [takeOverStaleLock(), existsSync(lock), existsSync(folder)];
plant(600_000);
mkdirSync(folder);
results.busy = [takeOverStaleLock(), existsSync(lock), existsSync(folder)];
utimesSync(folder, ago(60_000), ago(60_000));
results.deadTakeover = [takeOverStaleLock(), existsSync(folder), takeOverStaleLock(), existsSync(lock)];
plant(600_000);
await acquireRunLock();
const held = JSON.parse(readFileSync(lock, 'utf8')).pid === process.pid;
releaseRunLock();
results.acquire = [held, existsSync(lock)];
// A run that paused past the stale age finds another run's lock in place of its own: it stops, and
// its release leaves the other run's lock alone, even when that lock names the same PID.
plant(600_000);
await acquireRunLock();
assertRunLock();
writeFileSync(lock, JSON.stringify({ pid: process.pid, cwd: 'another run', token: 'another-run' }));
let lostCode = 0;
try {
	assertRunLock();
} catch (error) {
	lostCode = error.exitCode;
}
releaseRunLock();
results.lost = [lostCode, existsSync(lock)];
console.log(JSON.stringify(results));
`;

describe('the run lock', () => {
	it('removes a stale lock only while holding the takeover folder, and never a fresh one', () => {
		const home = mkdtempSync(join(tmpdir(), 'pagefifty-lock-'));
		try {
			const script = join(home, 'scenarios.mjs');
			writeFileSync(script, LOCK_SCENARIOS);
			const harness = pathToFileURL(resolve('scripts/harness.mjs')).href;
			const run = spawnSync(process.execPath, [script, harness], {
				encoding: 'utf8',
				env: { ...process.env, USERPROFILE: home, HOME: home }
			});
			expect(run.status, run.stderr).toBe(0);
			expect(JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '')).toEqual({
				fresh: ['kept', true, false],
				stale: ['removed', false, false],
				busy: ['busy', true, true],
				deadTakeover: ['busy', false, 'removed', false],
				acquire: [true, false],
				lost: [2, true]
			});
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	}, 30_000);
});

describe('the npm the build step runs', () => {
	it('takes the CLI an npm script names, and otherwise finds it beside node or under lib', () => {
		const prefix = mkdtempSync(join(tmpdir(), 'pagefifty-npm-'));
		try {
			expect(npmCliPath(join(prefix, 'bin', 'node'), '/opt/npm/bin/npm-cli.js')).toBe(
				'/opt/npm/bin/npm-cli.js'
			);
			const unix = join(prefix, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
			mkdirSync(dirname(unix), { recursive: true });
			writeFileSync(unix, '');
			// null: no npm script started this run (undefined would take the default, this run's own).
			expect(npmCliPath(join(prefix, 'bin', 'node'), null)).toBe(unix);
			const windows = join(prefix, 'bin', 'node_modules', 'npm', 'bin', 'npm-cli.js');
			mkdirSync(dirname(windows), { recursive: true });
			writeFileSync(windows, '');
			expect(npmCliPath(join(prefix, 'bin', 'node.exe'), null)).toBe(windows);
		} finally {
			rmSync(prefix, { recursive: true, force: true });
		}
	});

	it('names where it looked when no npm is found', () => {
		expect(() => npmCliPath(join(tmpdir(), 'pagefifty-no-npm', 'bin', 'node'), null)).toThrow(
			/npm's CLI not found; looked in .*npm-cli\.js and .*npm-cli\.js/
		);
	});
});

// Cloudflare's local development docs: a secrets property in the Worker config is loaded from the
// shell environment, whatever CLOUDFLARE_INCLUDE_PROCESS_ENV says, and startWorker hands wrangler
// dev the shell environment. A config that gains one needs startWorker to drop those names first.
function declaredSecrets(text: string): unknown {
	const { config, error } = ts.parseConfigFileTextToJson('wrangler.jsonc', text);
	if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, ' '));
	return (config as { secrets?: unknown }).secrets;
}

describe('the Worker config the browser runs serve', () => {
	it('is read for a secrets property, comments and trailing commas included', () => {
		const planted = '{\n\t// provider keys\n\t"secrets": { "required": ["API_KEY"] },\n}\n';
		expect(declaredSecrets(planted)).toEqual({ required: ['API_KEY'] });
	});

	it('declares no secrets, which local dev would read from the shell environment', () => {
		expect(declaredSecrets(readFileSync('wrangler.jsonc', 'utf8'))).toBeUndefined();
	});
});

// The browser runs serve the build with wrangler dev, which reads a .dev.vars file beside the
// config unless it is given an env file. A probe with a planted .dev.vars showed its key reaching
// the Worker without the flag and not with it; this pins the flag.
describe('the wrangler dev command of the browser runs', () => {
	it('names the env file it is given, so no .dev.vars file is read', () => {
		const args = wranglerDevArgs({ port: 8788, envFile: 'empty.env' });
		const at = args.indexOf('--env-file');
		expect(at).toBeGreaterThan(0);
		expect(args[at + 1]).toBe('empty.env');
	});

	it('listens on the loopback address and port it is given', () => {
		const args = wranglerDevArgs({ port: 8789, envFile: 'empty.env' });
		expect(args.slice(1, 6)).toEqual(['dev', '--ip', '127.0.0.1', '--port', '8789']);
	});

	it('passes a config only when one is given', () => {
		expect(wranglerDevArgs({ port: 8788, envFile: 'empty.env' })).not.toContain('--config');
		const args = wranglerDevArgs({ port: 8788, envFile: 'empty.env', configPath: 'copy.json' });
		expect(args.slice(-2)).toEqual(['--config', 'copy.json']);
	});
});

// verify:ship prints only a pass or a fail per step, so a driver's shrinking margin shows only in
// these lines, printed under each runner's verdict.
describe('the time margin warning of the browser runs', () => {
	it('names a driver past 55% of its limit, and not one at it', () => {
		// The fixture sits on the boundary: 143 s is exactly 55% of 260 s.
		expect(143 * 100).toBe(260 * 55);
		expect(
			marginWarnings(
				[
					{ name: 'the light driver', seconds: 143 },
					{ name: 'the dark driver', seconds: 144 }
				],
				260
			)
		).toEqual(['the dark driver took 144 s of its 260 s limit, past 55%']);
	});

	// The loaded a11y theme runs of 2026-10-08 passed with 155 and 160 s of 260, and the share is set
	// so a run that slow warns.
	it('names both loaded theme runs that passed on 2026-10-08', () => {
		expect(
			marginWarnings(
				[
					{ name: 'the light driver', seconds: 155 },
					{ name: 'the dark driver', seconds: 160 }
				],
				260
			)
		).toHaveLength(2);
	});

	// The slowest e2e drivers of the loaded verify:ship run of 2026-10-08 (font-scale 21 s, profile-demo
	// 19 s, of 60).
	it('is silent while every driver keeps its margin', () => {
		expect(
			marginWarnings(
				[
					{ name: 'font-scale', seconds: 21 },
					{ name: 'profile-demo', seconds: 19 }
				],
				60
			)
		).toEqual([]);
	});
});

const GENERATED = 'src/lib/snapshot/generated';
const SEPT = '2026-09-15';

// The 2026-09-15 readings run as the verdict driver pinned it while it named its notices.
const SEPT_RUN = [
	['Model', 'nvidia/nemotron-3-super-120b-a12b'],
	['Provider', 'Nebius Token Factory'],
	['Region', 'us-central1'],
	['Run date', '2026-10-15'],
	['Input tokens', '2,811'],
	['Output tokens', '2,563'],
	['Reasoning tokens', '0'],
	['Cost in USD', '0.003150'],
	['Quotes verified', '24'],
	['Quotes rejected', '0']
];
// The final capture's readings run, the example's since 2026-10-22.
const FINAL_RUN = [
	['Model', 'nvidia/nemotron-3-super-120b-a12b'],
	['Provider', 'Nebius Token Factory'],
	['Region', 'us-central1'],
	['Run date', '2026-10-22'],
	['Input tokens', '293,177'],
	['Output tokens', '208,761'],
	['Reasoning tokens', '0'],
	['Cost in USD', '0.275838'],
	['Quotes verified', '1,789'],
	['Quotes rejected', '76']
];
const FIRM_JUDGES =
	'Only the firm can judge whether its references, staff or line of business fit what the buyer names.';
const NOT_NAMED =
	'The buyer asks for a certificate this version cannot match by name with the profile.';

type Json = Record<string, unknown> & { lots?: Json[]; rows?: Json[] };
const readJson = (path: string): Json => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path: string, value: unknown) => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(value));
};

interface PlantOptions {
	notices: string[];
	openAfter?: string;
	edit?: (notice: string, record: Json, row: Json, readings: Json | undefined) => void;
	// Buyer searches to plant, by notice; none unless a test names them.
	searches?: Record<string, Json>;
}

// A generated folder holding one capture built from a few 2026-09-15 notices, so a probe the real
// build always has can be left out. The repository's own generated folder is never touched.
function plantCapture(
	root: string,
	id: string,
	{ notices, openAfter, edit, searches = {} }: PlantOptions
) {
	const from = join(GENERATED, SEPT);
	const line = { ...readJson(join(from, 'capture.json')), id, ...(openAfter && { openAfter }) };
	const index = readJson(join(from, 'index.json'));
	const rows: Json[] = [];
	for (const notice of notices) {
		const row = index.rows?.find((each) => each.noticeNumber === notice);
		if (row === undefined) throw new Error(`${notice} is not a 2026-09-15 row`);
		const record = readJson(join(from, 'records', `${notice}.json`));
		const readingsPath = join(from, 'readings', `${notice}.json`);
		const readings = existsSync(readingsPath) ? readJson(readingsPath) : undefined;
		edit?.(notice, record, row, readings);
		rows.push(row);
		writeJson(join(root, id, 'records', `${notice}.json`), record);
		if (readings) writeJson(join(root, id, 'readings', `${notice}.json`), readings);
	}
	for (const [notice, search] of Object.entries(searches)) {
		writeJson(join(root, id, 'searches', `${notice}.json`), search);
	}
	writeJson(join(root, id, 'capture.json'), line);
	writeJson(join(root, id, 'index.json'), { capture: line, leftOut: [], rows });
	if (notices.includes('610242-2026')) {
		writeJson(join(root, id, 'reading-run.json'), readJson(join(from, 'reading-run.json')));
	}
}

function withPlantedRoot<T>(use: (root: string) => T): T {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-example-'));
	try {
		return use(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function thrown(run: () => unknown): { exitCode?: number; message: string } {
	try {
		run();
	} catch (error) {
		return error as { exitCode?: number; message: string };
	}
	throw new Error('expected a throw');
}

interface LotFacts {
	coverage: {
		criteriaInNotice: number;
		namesDocuments: boolean;
		sourceUnread: boolean;
	};
	verdict: string | null;
	reason: string | null;
}
interface NoticeFacts {
	notice: string;
	title: string;
	language: string | null;
	lots: number;
	quoteLangs: (string | null)[];
	documents: { href: string; restricted: boolean } | null;
	lotFacts: LotFacts[];
	readings: number;
}

describe('the example capture the browser runs follow', () => {
	// Every 2026-09-15 row planted alone, so the probe rules run on the notices named here whichever
	// capture the real build makes the example.
	const septNotices = () =>
		(readJson(join(GENERATED, SEPT, 'index.json')).rows ?? []).map((row) =>
			String(row.noticeNumber)
		);
	const septSearch = () => readJson(join(GENERATED, SEPT, 'searches', '610242-2026.json'));

	it('exampleFacts picks the 2026-09-15 probes on that capture', () => {
		withPlantedRoot((root) => {
			plantCapture(root, SEPT, { notices: septNotices() });
			const example = exampleFacts(root);
			expect([
				example.id,
				example.capturedOn,
				example.capturedAt,
				example.rows,
				example.open,
				example.closed
			]).toEqual([SEPT, '15 Sep 2026', '21:50 CEST', 362, 349, 13]);
			expect(example.run).toEqual(SEPT_RUN);
			const probes = example.probes as Record<string, NoticeFacts | null>;
			const { mostLots, documents, oneLot, read, readOtherLanguage, restricted, noCriteria } =
				probes as Record<string, NoticeFacts>;
			expect([mostLots.notice, mostLots.lots]).toEqual(['600457-2026', 17]);
			expect([read.notice, read.readings]).toEqual(['610242-2026', 14]);
			expect(read.lotFacts.map((lot) => [lot.verdict, lot.reason])).toEqual([
				['Ask first', FIRM_JUDGES]
			]);
			expect([readOtherLanguage.notice, readOtherLanguage.readings]).toEqual(['634398-2026', 10]);
			expect(readOtherLanguage.language).not.toBe(read.language);
			expect(readOtherLanguage.lotFacts.map((lot) => [lot.verdict, lot.reason])).toEqual([
				['Ask first', NOT_NAMED]
			]);
			expect(documents.lotFacts.some((lot) => lot.coverage.sourceUnread)).toBe(true);
			expect(documents.documents).toEqual({ href: expect.any(String), restricted: false });
			expect(documents.quoteLangs.length).toBeGreaterThan(0);
			expect([oneLot.lots, oneLot.quoteLangs.length > 0]).toEqual([1, true]);
			expect(restricted.documents).toEqual({ href: expect.any(String), restricted: true });
			expect(noCriteria.lotFacts.every((lot) => lot.coverage.criteriaInNotice === 0)).toBe(true);
			expect(noCriteria.lotFacts.some((lot) => lot.coverage.namesDocuments)).toBe(true);
			for (const probe of Object.values(probes)) {
				expect(probe?.title).toEqual(expect.any(String));
				expect(probe?.lotFacts).toHaveLength(probe?.lots ?? -1);
			}
		});
	});

	// The real build's example is the final capture: every notice open at its capture instant, its
	// own run record, and a notice for every probe the browser runs visit.
	it('exampleFacts follows the final capture the real build makes the example', () => {
		const example = exampleFacts(GENERATED);
		expect([example.id, example.capturedOn, example.rows, example.open, example.closed]).toEqual([
			'2026-10-22',
			'22 Oct 2026',
			323,
			323,
			0
		]);
		expect(example.run).toEqual(FINAL_RUN);
		const probes = example.probes as Record<string, NoticeFacts | null>;
		expect(
			Object.fromEntries(Object.entries(probes).map(([name, probe]) => [name, probe?.notice]))
		).toEqual({
			mostLots: '708524-2026',
			documents: '693066-2026',
			oneLot: '693139-2026',
			read: '693066-2026',
			readOtherLanguage: '696976-2026',
			restricted: '699958-2026',
			noCriteria: '693836-2026'
		});
	});

	it('a missing required probe stops the run naming it', () => {
		withPlantedRoot((root) => {
			plantCapture(root, SEPT, { notices: ['600457-2026', '609955-2026'] });
			const error = thrown(() => exampleFacts(root));
			expect(error.exitCode).toBe(2);
			expect(error.message).toMatch(/\bread\b/);
		});
	});

	it('a missing optional probe is null, never another notice', () => {
		withPlantedRoot((root) => {
			plantCapture(root, SEPT, { notices: ['600457-2026', '609955-2026', '610242-2026'] });
			const { probes } = exampleFacts(root);
			expect([probes.restricted, probes.noCriteria, probes.readOtherLanguage]).toEqual([
				null,
				null,
				null
			]);
			expect([probes.mostLots?.notice, probes.read?.notice]).toEqual([
				'600457-2026',
				'610242-2026'
			]);
		});
	});

	it('exampleFacts carries the read probe search results', () => {
		const notices = ['600457-2026', '609955-2026', '610242-2026'];
		const searched = (results: Json[]) => ({
			notice: '610242-2026',
			status: 'searched',
			query: 'Berlin TXL Management GmbH Vergabe Zuschlag IT Dienstleistungen',
			results
		});
		const cases: [string, Record<string, Json> | undefined, number | null][] = [
			['no searches', undefined, null],
			['the recorded search', { '610242-2026': septSearch() }, 5],
			['searched with no result', { '610242-2026': searched([]) }, 0],
			[
				'searched with one result',
				{ '610242-2026': searched([{ title: 'A', url: 'https://a.example/', score: 0.5 }]) },
				1
			],
			[
				'not searched',
				{ '610242-2026': { notice: '610242-2026', status: 'not-searched', reason: 'cap-reached' } },
				null
			]
		];
		for (const [what, searches, expected] of cases) {
			withPlantedRoot((root) => {
				plantCapture(root, SEPT, { notices, searches });
				const read = exampleFacts(root).probes.read as { searchResults: unknown };
				expect(read.searchResults, what).toBe(expected);
			});
		}
	});

	it("takes the read probe's verdicts from decideLotStatus, a lot not read included", () => {
		withPlantedRoot((root) => {
			plantCapture(root, SEPT, {
				notices: ['600457-2026', '609955-2026', '610242-2026'],
				edit(notice, record, row, readings) {
					if (notice !== '610242-2026' || !record.lots || !row.lots || !readings) return;
					record.lots.push({ ...record.lots[0], id: 'LOT-0001' });
					row.lots.push({ ...row.lots[0], id: 'LOT-0001' });
					readings.lots?.push({ lot: 'LOT-0001', status: 'not-read', reason: 'dry-run' });
				}
			});
			const read = exampleFacts(root).probes.read as NoticeFacts;
			expect([read.lots, read.readings]).toEqual([2, 14]);
			expect(read.lotFacts.map((lot) => [lot.verdict, lot.reason])).toEqual([
				['Ask first', FIRM_JUDGES],
				[null, null]
			]);
		});
	});

	it('follows the capture the example rule chooses, never merely the newest', () => {
		withPlantedRoot((root) => {
			const notices = ['600457-2026', '609955-2026', '610242-2026'];
			plantCapture(root, SEPT, { notices });
			plantCapture(root, '2026-10-21', { notices, openAfter: '2026-10-30T17:00:00Z' });
			plantCapture(root, '2026-10-25', { notices });
			expect(exampleFacts(root).id).toBe('2026-10-21');
		});
	});

	it('reads the reason sentences from verdict-view.ts as written', () => {
		const view = readFileSync('src/lib/tenders/verdict-view.ts', 'utf8');
		const list = readFileSync('src/lib/tenders/list.ts', 'utf8');
		expect(reasonLines(view, list)).toEqual(new Map(Object.entries(REASON_LINES)));
		const planted = reasonLines(view.replace(/\n\t'not-read': '[^']*',/, ''), list);
		const error = thrown(() => reasonLine(planted, 'not-read'));
		expect([error.exitCode, error.message.includes('not-read')]).toEqual([2, true]);
	});

	it('prints a check that did not run as such and never counts it as a pass', () => {
		const tally = tallyChecks([
			{ driver: 'probe', name: 'ran and passed', ok: true, detail: 'one' },
			{
				driver: 'probe',
				name: 'a check did not run: the example capture holds no restricted notice',
				ok: true,
				didNotRun: true,
				detail: 'two'
			},
			{ driver: 'probe', name: 'ran and failed', ok: false, detail: 'three' }
		]);
		expect([tally.passed, tally.failed, tally.notRun]).toEqual([1, 1, 1]);
		expect(tally.lines[1]).toContain(' | DID NOT RUN | ');
		expect(tally.summary).toBe('e2e: 3 checks, 1 passed, 1 did not run');
	});
});
