// harness.mjs - the pieces every browser run shares: the dev-browser binary, the allowlist
// check, the machine-wide run lock, the build, the wrangler dev child and the driver protocol.
// scripts/e2e.mjs, scripts/a11y-live.mjs and scripts/a11y-prove.mjs import these; none keeps a copy.
//
// Everything a browser run touches is machine-wide (the port, the dev-browser tmp folder, the
// named browser, the .svelte-kit output), so a run never trusts a server it did not start: it
// holds one lock for the whole run and refuses a port that already answers before its own
// wrangler starts.

import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
	appendFileSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmdirSync,
	unlinkSync,
	statSync,
	utimesSync,
	writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';

export const DEV_BROWSER_TMP = join(homedir(), '.dev-browser', 'tmp');
const LOCK_PATH = join(DEV_BROWSER_TMP, 'pagefifty-browser-run.lock');
const LOCK_REFRESH_MS = 30_000;
// The refresh timer cannot fire while a child runs synchronously, so the lock is touched before
// each one, and a lock counts as stale only after longer than the longest of them can take: the
// build's cap below, and a driver's timeout plus 30 s, which runDriver keeps under this.
const BUILD_TIMEOUT_MS = 4 * 60_000;
const LOCK_STALE_MS = 5 * 60_000;
const LOCK_POLL_MS = 5_000;
// Longer than LOCK_STALE_MS, so a waiting run outlives a dead holder, and short enough that the
// whole run still ends inside ten minutes.
const LOCK_WAIT_MS = 8 * 60_000;
// Only the run holding this folder may remove a lock it did not write. A takeover holds it for one
// read and one delete, so a folder older than TAKEOVER_STALE_MS was left by a run that died inside.
const TAKEOVER_PATH = `${LOCK_PATH}.takeover`;
const TAKEOVER_STALE_MS = 30_000;
const TAKEOVER_RETRY_MS = 250;
const WORKER_READY_MS = 60_000;
const PORT_FREE_MS = 20_000;

export class HarnessError extends Error {
	constructor(exitCode, message) {
		super(message);
		this.exitCode = exitCode;
	}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// npm installs dev-browser on Windows as a .cmd shim around a native exe. Spawning a .cmd
// needs a shell, so the exe is read out of the shim and spawned directly instead. Shims come in
// two forms, "%~dp0node_modules\..." and npm's "%dp0%\node_modules\..." after a find_dp0 label;
// the path must sit under node_modules, so the node.exe line of a JavaScript shim never matches.
const SHIM_TARGET = /"%(?:~dp0|dp0%)\\?(node_modules\\[^"]+\.exe)"/i;
function resolveDevBrowser() {
	for (const dir of (process.env.PATH || process.env.Path || '').split(delimiter)) {
		if (!dir) continue;
		if (process.platform !== 'win32') {
			if (existsSync(join(dir, 'dev-browser'))) return join(dir, 'dev-browser');
			continue;
		}
		if (existsSync(join(dir, 'dev-browser.exe'))) return join(dir, 'dev-browser.exe');
		const shim = join(dir, 'dev-browser.cmd');
		if (!existsSync(shim)) continue;
		const target = SHIM_TARGET.exec(readFileSync(shim, 'utf8'));
		if (target && existsSync(join(dir, target[1]))) return join(dir, target[1]);
	}
	return null;
}

let devBrowserExe = null;

const STATUS_TIMEOUT_MS = 60_000;

// The status command starts the daemon when none runs, and the daemon keeps whatever output it
// inherited. A synchronous spawn waits for every holder of a piped output to close it, so a piped
// status call waited as long as the daemon lived (a 25-minute e2e hang). Only the exit code is
// read, so nothing is piped, and a command that never answers is given up on.
export function devBrowserStatus(exe, args = ['status'], timeoutMs = STATUS_TIMEOUT_MS) {
	return spawnSync(exe, args, { stdio: 'ignore', windowsHide: true, timeout: timeoutMs });
}

export function checkDevBrowser() {
	const exe = resolveDevBrowser();
	const status = exe ? devBrowserStatus(exe) : null;
	if (status?.error?.code === 'ETIMEDOUT') {
		throw new HarnessError(
			2,
			`dev-browser status did not answer within ${STATUS_TIMEOUT_MS / 1000} s, so this run audited nothing: run dev-browser status once in its own shell, then run this again`
		);
	}
	if (!status || status.error || status.status !== 0) {
		const why = !exe
			? 'no dev-browser on PATH'
			: status.error
				? status.error.message
				: `dev-browser status exited ${status.status}`;
		throw new HarnessError(
			1,
			`dev-browser not found: install the dev-browser CLI; this run audited nothing (${why})`
		);
	}
	devBrowserExe = exe;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

// The allowlist is a policy of the machine this was built on, kept in its home folder. A computer
// without that folder has no policy to consult, so only a loopback target may pass unchecked there;
// a computer that has the folder but lost the checker fails, so a moved tool never reads as a pass.
export function checkAllowlist(url) {
	const policyHome = join(homedir(), '.claude');
	const tool = join(policyHome, 'scripts', 'dev-browser-allow.js');
	if (!existsSync(policyHome)) {
		if (!LOOPBACK.has(new URL(url).hostname)) {
			throw new HarnessError(1, `no allowlist on this computer, and ${url} is not a loopback address`);
		}
		console.log(`[harness] no allowlist on this computer; ${url} is a loopback address, so it runs`);
		return;
	}
	if (!existsSync(tool)) {
		throw new HarnessError(1, `allowlist check unavailable: ${tool} is missing`);
	}
	const run = spawnSync(process.execPath, [tool, 'check', url], {
		encoding: 'utf8',
		windowsHide: true
	});
	if (run.status !== 0) {
		const blocked = run.status === 3 ? 'BLOCKED by the dev-browser allowlist' : `exit ${run.status}`;
		throw new HarnessError(1, `allowlist check for ${url} failed (${blocked}):\n${run.stdout}${run.stderr}`);
	}
}

function pidRuns(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === 'EPERM';
	}
}

function readLock() {
	let raw;
	let ageMs;
	try {
		raw = readFileSync(LOCK_PATH, 'utf8');
		ageMs = Date.now() - statSync(LOCK_PATH).mtimeMs;
	} catch (error) {
		if (error.code === 'ENOENT') return null;
		// A lock another process holds open for writing can refuse the read for a moment.
		return { raw: '', holder: {}, ageMs: 0, unreadable: true };
	}
	// A holder mid-write reads as unparsable with a fresh mtime and is waited on. One that died
	// mid-write never refreshes it, so it ages past LOCK_STALE_MS and is taken over like any other.
	let holder = {};
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') holder = parsed;
	} catch {
		// Unparsable: judged by its age alone.
	}
	return { raw, holder, ageMs };
}

// Windows reuses PIDs, so a live PID alone does not prove the holder is alive; a holder that
// stopped refreshing the timestamp is dead whatever its PID says.
function lockIsStale(seen) {
	const { pid } = seen.holder;
	return Boolean(pid && !pidRuns(pid)) || seen.ageMs > LOCK_STALE_MS;
}

// A waiter that judged the old lock stale must never touch a lock another waiter has written since:
// moving that aside, even to put it back, leaves a gap a third run can take, and then two runs hold
// the lock. So the lock is judged again inside the takeover folder, and removed only if still stale.
// Returns 'removed', 'kept' (no longer stale, or gone) or 'busy' (another run is taking over).
export function takeOverStaleLock() {
	try {
		mkdirSync(TAKEOVER_PATH);
	} catch (error) {
		if (error.code !== 'EEXIST') throw error;
		removeDeadTakeover();
		return 'busy';
	}
	try {
		const seen = readLock();
		if (!seen || !lockIsStale(seen)) return 'kept';
		unlinkSync(LOCK_PATH);
		return 'removed';
	} catch (error) {
		if (error.code === 'ENOENT') return 'kept';
		throw error;
	} finally {
		rmdirSync(TAKEOVER_PATH);
	}
}

function removeDeadTakeover() {
	try {
		if (Date.now() - statSync(TAKEOVER_PATH).mtimeMs > TAKEOVER_STALE_MS) rmdirSync(TAKEOVER_PATH);
	} catch {
		// Gone already: that takeover finished.
	}
}

let lockTimer = null;
// Each acquisition writes its own token, so a run can tell its lock from one another run wrote after
// taking it over, even when both name the same PID.
let heldToken = null;
let lockLost = false;

export async function acquireRunLock() {
	mkdirSync(DEV_BROWSER_TMP, { recursive: true });
	const deadline = Date.now() + LOCK_WAIT_MS;
	const token = randomUUID();
	let announced = false;
	for (;;) {
		try {
			writeFileSync(
				LOCK_PATH,
				JSON.stringify({ pid: process.pid, cwd: process.cwd(), since: new Date().toISOString(), token }),
				{ flag: 'wx' }
			);
			heldToken = token;
			lockLost = false;
			break;
		} catch (error) {
			if (error.code !== 'EEXIST') throw error;
		}
		const seen = readLock();
		if (!seen) continue;
		const { pid, cwd } = seen.holder;
		const holder = pid ? `pid ${pid} in ${cwd}` : 'a holder whose lock file does not name it';
		if (lockIsStale(seen)) {
			const outcome = takeOverStaleLock();
			if (outcome === 'removed') {
				console.log(`[harness] removed a stale run lock (${holder}, ${Math.round(seen.ageMs / 1000)} s old)`);
			} else if (outcome === 'busy') {
				await sleep(TAKEOVER_RETRY_MS);
			}
			continue;
		}
		if (Date.now() > deadline) {
			throw new HarnessError(
				2,
				`run lock still held after ${LOCK_WAIT_MS / 60_000} min by ${holder} (${LOCK_PATH})`
			);
		}
		if (!announced) {
			console.log(`[harness] waiting for the run lock held by ${holder}`);
			announced = true;
		}
		await sleep(LOCK_POLL_MS);
	}
	lockTimer = setInterval(touchLock, LOCK_REFRESH_MS);
	lockTimer.unref();
}

// A lock the read could not open for a moment still counts as this run's. Another run's token means
// this run paused past the stale age (a sleeping machine, a debugger) and was taken over.
function holdsRunLock() {
	const seen = readLock();
	return Boolean(seen) && (seen.unreadable === true || seen.holder.token === heldToken);
}

function touchLock() {
	if (!lockTimer) return;
	if (!holdsRunLock()) {
		lockLost = true;
		return;
	}
	const now = new Date();
	try {
		utimesSync(LOCK_PATH, now, now);
	} catch {
		// The lock vanished under us; releaseRunLock reports nothing to remove.
	}
}

// Checked before and after every long step. A run that lost its lock would share the port, the
// browser and the build with the run that took over, so it stops instead of reporting anything.
export function assertRunLock() {
	if (heldToken && !lockLost && holdsRunLock()) return;
	lockLost = true;
	throw new HarnessError(
		2,
		`this run no longer holds the run lock (${LOCK_PATH}): it paused past the lock's stale age and another run took over, so its results cannot be trusted`
	);
}

export function releaseRunLock() {
	if (lockTimer) clearInterval(lockTimer);
	lockTimer = null;
	const seen = readLock();
	if (seen && heldToken && seen.holder.token === heldToken) unlinkSync(LOCK_PATH);
	heldToken = null;
	lockLost = false;
}

// An npm script names npm's CLI in npm_execpath. Run directly, the CLI sits beside node.exe on
// Windows and under lib/ beside bin/node elsewhere.
/** @param {string} [execPath] @param {string | null} [execPathFromNpm] null when no npm script ran this */
export function npmCliPath(execPath = process.execPath, execPathFromNpm = process.env.npm_execpath) {
	if (execPathFromNpm && execPathFromNpm.endsWith('.js')) return execPathFromNpm;
	const candidates = [
		join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
		join(dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
	];
	const found = candidates.find((path) => existsSync(path));
	if (!found) {
		throw new HarnessError(
			2,
			`npm's CLI not found; looked in ${candidates.join(' and ')}. Run this through npm (npm run test:e2e).`
		);
	}
	return found;
}

export function buildWorker() {
	console.log('[harness] npm run build');
	assertRunLock();
	touchLock();
	const run = spawnSync(process.execPath, [npmCliPath(), 'run', 'build', '--silent'], {
		stdio: ['ignore', 'pipe', 'pipe'],
		encoding: 'utf8',
		windowsHide: true,
		timeout: BUILD_TIMEOUT_MS
	});
	assertRunLock();
	if (run.error || run.status !== 0) {
		const why = run.error ? run.error.message : `exit ${run.status}`;
		throw new HarnessError(2, `build failed (${why}):\n${run.stdout}\n${run.stderr}`);
	}
}

function portAnswers(port) {
	return new Promise((resolve) => {
		const socket = connect({ host: '127.0.0.1', port });
		const done = (answers) => {
			socket.destroy();
			resolve(answers);
		};
		socket.setTimeout(1000, () => done(false));
		socket.once('connect', () => done(true));
		socket.once('error', () => done(false));
	});
}

async function httpAnswers(port) {
	try {
		await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
		return true;
	} catch {
		return false;
	}
}

const wranglerBin = () => join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');

// wrangler dev reads a .dev.vars file beside the config whenever it is given no env file, and the
// dotenv switch in startWorker does not cover that file. Naming one empty env file closes it: with
// a list, .dev.vars is never read, and the dotenv step, switched off anyway, could read only that.
/** @param {{ port: number, configPath?: string, envFile: string }} options */
export function wranglerDevArgs({ port, configPath, envFile }) {
	const args = [wranglerBin(), 'dev', '--ip', '127.0.0.1', '--port', String(port), '--env-file', envFile];
	if (configPath) args.push('--config', configPath);
	return args;
}

export async function startWorker({ port, configPath, logFile }) {
	assertRunLock();
	if (await portAnswers(port)) {
		throw new HarnessError(
			2,
			`port ${port} already answers: a server this run did not start is listening; stop it by its PID`
		);
	}
	mkdirSync(dirname(logFile), { recursive: true });
	// Written synchronously: a failing run exits at once, and a buffered stream would lose the
	// last lines of the very log its error message points to.
	writeFileSync(logFile, '');
	const envFile = join(dirname(logFile), 'pagefifty-empty.env');
	writeFileSync(envFile, '');
	const args = wranglerDevArgs({ port, configPath, envFile });
	const child = spawn(process.execPath, args, {
		env: {
			...process.env,
			WRANGLER_SEND_METRICS: 'false',
			// Local dev otherwise hands the Worker every key in a dotenv file beside the config (the
			// main checkout keeps the real provider keys there), or the whole shell environment when
			// the shell asks for it. A browser check needs neither. With no variable at all the Worker
			// has no provider key and no live switch, so the app's transport can only replay the
			// snapshot. Code that called fetch itself would still reach the network: the fetch-only
			// import and lint rules keep that out of app code, not this harness.
			CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
			CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false'
		},
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
		// A process group of its own, so stopWorker can end the whole tree off Windows.
		detached: process.platform !== 'win32'
	});
	let output = '';
	for (const stream of [child.stdout, child.stderr]) {
		stream.on('data', (chunk) => {
			output += chunk;
			appendFileSync(logFile, chunk);
		});
	}
	const deadline = Date.now() + WORKER_READY_MS;
	while (!(await httpAnswers(port))) {
		if (child.exitCode !== null) {
			throw new HarnessError(2, `wrangler dev exited ${child.exitCode} before answering; log: ${logFile}`);
		}
		if (Date.now() > deadline) {
			await stopWorker(child);
			throw new HarnessError(2, `wrangler dev did not answer on port ${port} within 60 s; log: ${logFile}`);
		}
		await sleep(500);
	}
	// Whatever answered must be this child: still running, and its own log saying it bound here.
	const ready = new RegExp(`Ready on http://127\\.0\\.0\\.1:${port}\\b`);
	if (child.exitCode !== null || !ready.test(output)) {
		await stopWorker(child);
		throw new HarnessError(
			2,
			`port ${port} answered but not from this run's wrangler (child exit ${child.exitCode}); log: ${logFile}`
		);
	}
	return { child, pid: child.pid };
}

// On Windows, ending only the spawned PID leaves wrangler's workerd child listening on the
// port, so the whole tree goes, and the run waits until the port really refuses.
export async function stopWorker(child) {
	if (!child || child.pid === undefined) return true;
	if (process.platform === 'win32') {
		const taskkill = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
		spawnSync(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
	} else {
		try {
			process.kill(-child.pid, 'SIGTERM');
		} catch {
			// Already gone.
		}
	}
	const port = child.spawnargs[child.spawnargs.indexOf('--port') + 1];
	const deadline = Date.now() + PORT_FREE_MS;
	// taskkill /F already ends the tree outright; off Windows a tree still listening halfway to the
	// deadline ignored SIGTERM, so it gets SIGKILL.
	let forced = process.platform === 'win32';
	while (await portAnswers(Number(port))) {
		if (!forced && Date.now() > deadline - PORT_FREE_MS / 2) {
			forced = true;
			try {
				process.kill(-child.pid, 'SIGKILL');
			} catch {
				// Already gone.
			}
		}
		if (Date.now() > deadline) {
			console.error(`[harness] port ${port} still answers ${PORT_FREE_MS / 1000} s after ending pid ${child.pid}`);
			return false;
		}
		await sleep(250);
	}
	return true;
}

export function writeRunConfig(name, config) {
	writeFileSync(join(DEV_BROWSER_TMP, name), JSON.stringify(config));
}

// The driver cannot import axe-core, so it reads the minified source as text and injects it.
export function stageAxe() {
	const name = 'pagefifty-axe.min.js';
	copyFileSync(fileURLToPath(import.meta.resolve('axe-core/axe.min.js')), join(DEV_BROWSER_TMP, name));
	return name;
}

export function runDriver({ browserName, driverPath, timeoutSeconds }) {
	if ((timeoutSeconds + 30) * 1000 >= LOCK_STALE_MS) {
		throw new HarnessError(2, `a ${timeoutSeconds} s driver timeout would outlast the run lock's stale age`);
	}
	assertRunLock();
	touchLock();
	const run = spawnSync(
		devBrowserExe,
		['--headless', '--browser', browserName, '--timeout', String(timeoutSeconds), 'run', driverPath],
		{ encoding: 'utf8', windowsHide: true, timeout: (timeoutSeconds + 30) * 1000 }
	);
	assertRunLock();
	return {
		code: run.error ? -1 : run.status,
		output: `${run.stdout || ''}${run.stderr || ''}${run.error ? run.error.message : ''}`
	};
}

export function readResult(name) {
	const path = join(DEV_BROWSER_TMP, name);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} finally {
		unlinkSync(path);
	}
}
