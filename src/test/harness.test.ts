import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
	devBrowserStatus,
	marginWarnings,
	npmCliPath,
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
	it('names a driver past 60% of its limit, and not one at it', () => {
		// The fixture sits on the boundary: 156 s is exactly 60% of 260 s.
		expect(260 * 0.6).toBe(156);
		expect(
			marginWarnings(
				[
					{ name: 'the light driver', seconds: 156 },
					{ name: 'the dark driver', seconds: 157 }
				],
				260
			)
		).toEqual(['the dark driver took 157 s of its 260 s limit, past 60%']);
	});

	it('is silent while every driver keeps its margin', () => {
		expect(
			marginWarnings(
				[
					{ name: 'canary', seconds: 21 },
					{ name: 'example', seconds: 35 }
				],
				60
			)
		).toEqual([]);
	});
});
