// harness.mjs - the pieces every browser run shares: the dev-browser binary, the allowlist
// check, the machine-wide run lock, the build, the wrangler dev child, the driver protocol and
// the example capture's facts the drivers check /example against.
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
	readdirSync,
	readFileSync,
	rmdirSync,
	unlinkSync,
	statSync,
	utimesSync,
	writeFileSync
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';

// The example's facts are read with the site's own rules from src. scripts/preview.mjs imports this
// file too, and its test runs it from a copy of scripts/ alone, so src is loaded only when
// exampleFacts first runs: require loads an erasable TypeScript module under Node's type stripping
// as an import would, and keeps exampleFacts synchronous.
const requireFromHarness = createRequire(import.meta.url);
let decideLotStatus;
let coverage;
let summarizeLot;
let SERVER_TIME_ZONE;
let formatDeadline;
let noticeDeadline;
let lotContextOf;
let lotStatusOf;
let VERDICT_LABELS;
let DEMO_PROFILE;
let captureDay;
let exampleCaptureOf;
let isCaptureId;
let newestCapture;
let CaptureLineSchema;
let NoticeRecordSchema;
let SnapshotIndexSchema;
let NoticeReadingsSchema;
let ReadingRunSchema;
let NoticeSearchSchema;

function loadSiteRules() {
	if (decideLotStatus !== undefined) return;
	({ decideLotStatus } = requireFromHarness('../src/lib/core/compare.ts'));
	({ coverage, summarizeLot } = requireFromHarness('../src/lib/core/coverage-facts.ts'));
	({ SERVER_TIME_ZONE, formatDeadline, noticeDeadline } = requireFromHarness(
		'../src/lib/core/deadline.ts'
	));
	({ lotContextOf } = requireFromHarness('../src/lib/core/lot-context.ts'));
	({ lotStatusOf } = requireFromHarness('../src/lib/core/lot-reading.ts'));
	({ VERDICT_LABELS } = requireFromHarness('../src/lib/core/verdict.ts'));
	({ DEMO_PROFILE } = requireFromHarness('../src/lib/profile/demo-firm.ts'));
	({ captureDay, exampleCaptureOf, isCaptureId, newestCapture } = requireFromHarness(
		'../src/lib/snapshot/capture-id.ts'
	));
	({ CaptureLineSchema, NoticeRecordSchema, SnapshotIndexSchema } = requireFromHarness(
		'../src/lib/snapshot/index-row.ts'
	));
	({ NoticeReadingsSchema, ReadingRunSchema } = requireFromHarness(
		'../src/lib/snapshot/readings.ts'
	));
	({ NoticeSearchSchema } = requireFromHarness('../src/lib/snapshot/searches.ts'));
}

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
			throw new HarnessError(
				1,
				`no allowlist on this computer, and ${url} is not a loopback address`
			);
		}
		console.log(
			`[harness] no allowlist on this computer; ${url} is a loopback address, so it runs`
		);
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
		const blocked =
			run.status === 3 ? 'BLOCKED by the dev-browser allowlist' : `exit ${run.status}`;
		throw new HarnessError(
			1,
			`allowlist check for ${url} failed (${blocked}):\n${run.stdout}${run.stderr}`
		);
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
				JSON.stringify({
					pid: process.pid,
					cwd: process.cwd(),
					since: new Date().toISOString(),
					token
				}),
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
				console.log(
					`[harness] removed a stale run lock (${holder}, ${Math.round(seen.ageMs / 1000)} s old)`
				);
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
export function npmCliPath(
	execPath = process.execPath,
	execPathFromNpm = process.env.npm_execpath
) {
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
		await fetch(`http://127.0.0.1:${port}/`, {
			redirect: 'manual',
			signal: AbortSignal.timeout(2000)
		});
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
	const args = [
		wranglerBin(),
		'dev',
		'--ip',
		'127.0.0.1',
		'--port',
		String(port),
		'--env-file',
		envFile
	];
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
			throw new HarnessError(
				2,
				`wrangler dev exited ${child.exitCode} before answering; log: ${logFile}`
			);
		}
		if (Date.now() > deadline) {
			await stopWorker(child);
			throw new HarnessError(
				2,
				`wrangler dev did not answer on port ${port} within 60 s; log: ${logFile}`
			);
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
		spawnSync(taskkill, ['/PID', String(child.pid), '/T', '/F'], {
			windowsHide: true,
			stdio: 'ignore'
		});
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
			console.error(
				`[harness] port ${port} still answers ${PORT_FREE_MS / 1000} s after ending pid ${child.pid}`
			);
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
	copyFileSync(
		fileURLToPath(import.meta.resolve('axe-core/axe.min.js')),
		join(DEV_BROWSER_TMP, name)
	);
	return name;
}

export function runDriver({ browserName, driverPath, timeoutSeconds }) {
	if ((timeoutSeconds + 30) * 1000 >= LOCK_STALE_MS) {
		throw new HarnessError(
			2,
			`a ${timeoutSeconds} s driver timeout would outlast the run lock's stale age`
		);
	}
	assertRunLock();
	touchLock();
	const run = spawnSync(
		devBrowserExe,
		[
			'--headless',
			'--browser',
			browserName,
			'--timeout',
			String(timeoutSeconds),
			'run',
			driverPath
		],
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

// A driver past this share of its limit still passes, but the next route or check it gains, or a busy
// machine, may not. verify:ship prints only a pass or a fail per step, so the runners print these
// lines last, under their verdict, and the margin is seen shrinking before a run fails on it. Another
// program's load slowed the a11y theme runs on 2026-10-08: 88 to 108 s quiet, 155 and 160 s loaded,
// with the quiet times not recorded per theme, so the slowdown may be as much as 160 / 88, about 1.82
// times. A quiet run at 55% of its limit still fits that inside the limit (60% fits only 1.67 times).
// Whole percents keep the comparison exact.
const MARGIN_WARN_PERCENT = 55;

export function marginWarnings(times, limitSeconds) {
	return times
		.filter(({ seconds }) => seconds * 100 > limitSeconds * MARGIN_WARN_PERCENT)
		.map(
			({ name, seconds }) =>
				`${name} took ${seconds} s of its ${limitSeconds} s limit, past ${MARGIN_WARN_PERCENT}%`
		);
}

// The list layout an audited page must show. A list opens a tender beside it only while one is
// open, so once its rows were read from the closed group (no tender still open, as the live list
// will be when the newest capture's last deadline passes) its wide entry shows the list alone. Any
// other entry shows the layout it names; a page whose entry names none has no list layout to show.
export function expectedListLayout(page) {
	if (page.layout === 'split' && page.auditedGroup === 'closed') return 'list';
	return page.layout;
}

// Whether a phone list entry left its closed rows unaudited. Beside a tender the list column
// scrolls rows out of its visible box, and their undecided contrast is accepted only because each
// phone entry draws every row in full, so the driver unfolds the closed group there before axe runs
// (readLayout). A group it reports folded, or does not report at all, is never a pass.
export function closedRowsUnaudited(page) {
	if (page.layout !== 'list') return false;
	return page.auditedClosed !== 'unfolded' && page.auditedClosed !== 'none';
}

// A check whose probe the example capture lacks did not run, which is never a pass: it is printed
// as such and kept out of the passed count. Only a required probe's check could fail this way, and
// exampleFacts stops the run before any driver when one is missing.
export function tallyChecks(checks) {
	const status = (check) =>
		!check.ok ? 'FAIL' : check.didNotRun === true ? 'DID NOT RUN' : 'PASS';
	const lines = checks.map(
		(check) => `${check.driver} | ${check.name} | ${status(check)} | ${check.detail}`
	);
	const notRunLines = lines.filter((_, index) => status(checks[index]) === 'DID NOT RUN');
	const passed = checks.filter((check) => status(check) === 'PASS').length;
	const notRun = notRunLines.length;
	return {
		lines,
		notRunLines,
		passed,
		notRun,
		failed: checks.length - passed - notRun,
		summary: `e2e: ${checks.length} checks, ${passed} passed${notRun > 0 ? `, ${notRun} did not run` : ''}`
	};
}

// The /example checks visit notices by property, never by number: the example moves to the final
// capture on the day it is built, and every check has to follow it with no driver change.
const REQUIRED_PROBES = ['mostLots', 'documents', 'oneLot', 'read'];
const PROBE_PROPERTIES = {
	mostLots: 'the most lots',
	documents: 'criteria in the notice and in the documents, and an open documents link',
	oneLot: 'one lot and criteria in the notice',
	read: 'a lot the model read',
	readOtherLanguage: 'a lot the model read, in a second language',
	restricted: 'a restricted documents link',
	noCriteria: 'no criteria in the notice, every lot naming the procurement documents as a source'
};

const VERDICT_VIEW = 'src/lib/tenders/verdict-view.ts';
const LIST_CONSTANTS = 'src/lib/tenders/list.ts';

function readBuilt(path, schema, what) {
	let parsed;
	try {
		parsed = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
	} catch (error) {
		throw new HarnessError(2, `${path} could not be read as JSON: ${error.message}`);
	}
	if (!parsed.success) throw new HarnessError(2, `${path} is not ${what}: ${parsed.error.message}`);
	return parsed.data;
}

function readText(path) {
	try {
		return readFileSync(path, 'utf8');
	} catch (error) {
		throw new HarnessError(2, `${path} could not be read: ${error.message}`);
	}
}

// The reason sentences live in verdict-view.ts, which Node cannot import (its own imports carry no
// extension), so they are read from its text, as countryNames reads list.ts. A constant a sentence
// names is resolved from list.ts the same way.
const REASON_BLOCK = /export const REASON_LINES = \{\n([\s\S]*?)\n\} as const/;
const REASON_ENTRY =
	/^\t(?:'([^']+)'|([A-Za-z][\w-]*)):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Z][A-Z0-9_]*))/gm;
const TEXT_CONSTANT = /export const ([A-Z][A-Z0-9_]*) =\s*'((?:[^'\\]|\\.)*)'/g;
const unescaped = (text) => text.replace(/\\(.)/g, '$1');
const lf = (text) => text.replace(/\r\n?/g, '\n');

export function reasonLines(viewText, constantsText) {
	const block = REASON_BLOCK.exec(lf(viewText));
	if (block === null) {
		throw new HarnessError(2, `${VERDICT_VIEW} holds no REASON_LINES block to expect reasons from`);
	}
	const constants = new Map(
		[...lf(constantsText).matchAll(TEXT_CONSTANT)].map(([, name, value]) => [
			name,
			unescaped(value)
		])
	);
	return new Map(
		[...block[1].matchAll(REASON_ENTRY)].map(([, quoted, bare, single, double, constant]) => {
			if (constant !== undefined && !constants.has(constant)) {
				throw new HarnessError(2, `${LIST_CONSTANTS} defines no ${constant} for REASON_LINES`);
			}
			const line = constant !== undefined ? constants.get(constant) : unescaped(single ?? double);
			return [quoted ?? bare, line];
		})
	);
}

function textConstant(viewText, name) {
	const found = [...lf(viewText).matchAll(TEXT_CONSTANT)].find(([, each]) => each === name);
	if (found === undefined) {
		throw new HarnessError(2, `${VERDICT_VIEW} defines no ${name} to expect`);
	}
	return unescaped(found[2]);
}

export function reasonLine(lines, key) {
	const line = lines.get(key);
	if (line === undefined) {
		throw new HarnessError(
			2,
			`${VERDICT_VIEW} has no REASON_LINES sentence for ${key}, so the reason a page gives cannot be expected`
		);
	}
	return line;
}

// The sentence verdict-view.ts's reasonOf gives a decision, written a second time on purpose: an
// expectation computed by the page's own wording function would agree with any defect in it.
const REASON_PICKS = {
	'route-unsettled': (each) => each.state === 'SHORT_ROUTE_UNSETTLED',
	'profile-field-missing': (each) => each.state === 'PROFILE_GAP',
	'not-compared': (each) => each.notCompared
};

function documentsReasonKey(facts) {
	if (facts.namesDocuments) return 'criteria-in-documents/documents';
	if (facts.namesEspd) return 'criteria-in-documents/espd';
	if (facts.pointsToDocuments) return 'criteria-in-documents/points';
	if (facts.sourceUnnamed) return 'criteria-in-documents/unnamed';
	return 'criteria-in-documents';
}

function reasonOf({ decision, criteria, reservation }, facts, lines) {
	if (decision.verdict !== 'ASK FIRST') return reasonLine(lines, decision.verdict);
	const pick = REASON_PICKS[decision.reason];
	if (pick !== undefined) {
		const requirements = [
			...criteria.flatMap((outcome) => outcome.requirements),
			...(reservation ? [reservation] : [])
		];
		const keys = [...new Set(requirements.filter(pick).map((each) => each.why))].map(
			(why) => `${decision.reason}/${why}`
		);
		const named = [...new Set(keys.filter((key) => lines.has(key)).map((key) => lines.get(key)))];
		return named.length > 0 ? named.join(' ') : reasonLine(lines, decision.reason);
	}
	if (decision.reason === 'criteria-in-documents') {
		return reasonLine(lines, documentsReasonKey(facts));
	}
	return reasonLine(lines, decision.reason);
}

// The order and wording of RunRecord.svelte's RUN_RECORD_FIELDS, written a second time on purpose.
const enGB = (value) => value.toLocaleString('en-GB');

function runRecordOf(run) {
	return [
		['Model', run.model],
		['Provider', run.provider],
		['Region', run.region],
		['Run date', run.runDate],
		['Input tokens', enGB(run.tokens.input)],
		['Output tokens', enGB(run.tokens.output)],
		['Reasoning tokens', enGB(run.tokens.reasoning)],
		['Cost in USD', run.costUsd],
		['Quotes verified', enGB(run.quotes.verified)],
		['Quotes rejected', enGB(run.quotes.rejected)]
	];
}

// The documents link every documents link on the page names: the notice's own, the one on each
// lot's coverage list and the face-down leaf's. Only one address with one restriction for the whole
// notice is shown in all those places, which is what a check of "the" documents link needs.
function pageDocuments(record) {
	const links = record.lots.map((lot) => lot.documents ?? record.documents);
	if (record.documents) links.push(record.documents);
	const [first] = links;
	const uniform = links.every(
		(link) =>
			link !== undefined &&
			link.published === first.published &&
			Boolean(link.restricted) === Boolean(first.restricted)
	);
	return uniform && first.href !== undefined
		? { href: first.href, restricted: first.restricted === true }
		: null;
}

// The verdict the example page shows on a lot, for the demo firm at the capture instant.
function lotFactsOf(record, lot, readings, now, lines) {
	const summary = summarizeLot(lot);
	const facts = coverage(summary);
	const status = lotStatusOf(lot, readings);
	const decided = decideLotStatus(status, DEMO_PROFILE, {
		...lotContextOf(record, lot),
		now: now.toISOString()
	});
	const read = status.status === 'read';
	return {
		coverage: {
			criteriaInNotice: facts.criteriaInNotice,
			namesDocuments: facts.namesDocuments,
			namesEspd: facts.namesEspd,
			sourceUnnamed: facts.sourceUnnamed,
			pointsToDocuments: facts.pointsToDocuments,
			sourceUnread: facts.facts.includes('SOURCE_UNREAD')
		},
		read,
		verdict: decided ? VERDICT_LABELS[decided.decision.verdict] : null,
		reason: decided ? reasonOf(decided, facts, lines) : null,
		// One AI reading per verified requirement; CriterionRow sets a clause's readings under one label.
		readings: read
			? status.reading.criteria.reduce((sum, criterion) => sum + criterion.verified.length, 0)
			: 0
	};
}

// How many web results the page lists for the notice's buyer: the built count for a notice the
// capture searched, 0 included, and null for one it did not search or a capture with no search, so
// the verdict driver checks the links, the none-found line or the absence of the list.
function searchResultsOf(search) {
	return search?.status === 'searched' ? search.results.length : null;
}

function noticeFacts(record, readings, search, now, lines) {
	const lotFacts = record.lots.map((lot) => lotFactsOf(record, lot, readings, now, lines));
	return {
		notice: record.noticeNumber,
		title: record.title.text,
		language: record.title.lang ?? null,
		lots: record.lots.length,
		// Every clause's descriptions, each a blockquote tagged with its language, in page order.
		quoteLangs: record.lots.flatMap((lot) =>
			lot.criteria.flatMap((criterion) =>
				criterion.descriptions.map((description) => description.lang ?? null)
			)
		),
		documents: pageDocuments(record),
		lotFacts,
		readings: lotFacts.reduce((sum, lot) => sum + lot.readings, 0),
		searchResults: searchResultsOf(search)
	};
}

function captureLines(generatedDir) {
	let names;
	try {
		names = readdirSync(generatedDir);
	} catch (error) {
		throw new HarnessError(2, `${generatedDir}: ${error.message}`);
	}
	const lines = names
		.filter(isCaptureId)
		.map((id) => [
			id,
			readBuilt(join(generatedDir, id, 'capture.json'), CaptureLineSchema, 'a built capture line')
		]);
	if (lines.length === 0) {
		throw new HarnessError(
			2,
			`${generatedDir} holds no built capture: scripts/build-records.mjs writes them`
		);
	}
	return lines;
}

function publicationOrder(left, right) {
	const [leftRunning, leftYear] = left.noticeNumber.split('-').map(Number);
	const [rightRunning, rightYear] = right.noticeNumber.split('-').map(Number);
	return leftYear - rightYear || leftRunning - rightRunning;
}

// Records are read only for the rows a probe rule reaches, each once.
function noticeReader(folder, now, lines) {
	const read = new Map();
	return {
		hasReadings: (row) => existsSync(join(folder, 'readings', `${row.noticeNumber}.json`)),
		facts(row) {
			const notice = row.noticeNumber;
			if (!read.has(notice)) {
				const record = readBuilt(
					join(folder, 'records', `${notice}.json`),
					NoticeRecordSchema,
					'a built record'
				);
				const readingsPath = join(folder, 'readings', `${notice}.json`);
				const readings = existsSync(readingsPath)
					? readBuilt(readingsPath, NoticeReadingsSchema, 'built readings')
					: undefined;
				const searchPath = join(folder, 'searches', `${notice}.json`);
				const search = existsSync(searchPath)
					? readBuilt(searchPath, NoticeSearchSchema, 'a built buyer search')
					: undefined;
				read.set(notice, noticeFacts(record, readings, search, now, lines));
			}
			return read.get(notice);
		}
	};
}

const criteriaInNotice = (row) =>
	row.lots.reduce((sum, lot) => sum + lot.coverage.criteriaCount, 0);
const someLot = (row, fact) => row.lots.some((lot) => fact(coverage(lot.coverage)));
const everyLot = (row, fact) => row.lots.every((lot) => fact(coverage(lot.coverage)));

// Each rule takes the first row in publication order that has its property, so a tie goes to the
// notice published first.
function probeRows(rows, notices) {
	const wasRead = (row) =>
		notices.hasReadings(row) && notices.facts(row).lotFacts.some((lot) => lot.read);
	const read = rows.find(wasRead);
	const mostLots = rows.reduce((most, row) => (row.lots.length > most.lots.length ? row : most));
	return {
		mostLots,
		documents: rows.find(
			(row) =>
				criteriaInNotice(row) > 0 &&
				someLot(row, (facts) => facts.facts.includes('SOURCE_UNREAD')) &&
				notices.facts(row).documents?.restricted === false
		),
		oneLot: rows.find((row) => row.lots.length === 1 && criteriaInNotice(row) > 0),
		read,
		readOtherLanguage:
			read &&
			rows.find(
				(row) =>
					row !== read &&
					wasRead(row) &&
					notices.facts(row).language !== notices.facts(read).language
			),
		restricted: rows.find((row) => notices.facts(row).documents?.restricted === true),
		noCriteria: rows.find(
			(row) => criteriaInNotice(row) === 0 && everyLot(row, (facts) => facts.namesDocuments)
		)
	};
}

// The example capture is chosen by exampleCaptureOf over the built capture lines, the rule the site
// itself uses, and every count and probe is read at its capture instant, as /example shows it.
export function exampleFacts(generatedDir) {
	loadSiteRules();
	const id = exampleCaptureOf(captureLines(generatedDir));
	const folder = join(generatedDir, id);
	const index = readBuilt(join(folder, 'index.json'), SnapshotIndexSchema, 'a built index');
	if (index.rows.length === 0) {
		throw new HarnessError(
			2,
			`${folder}/index.json holds no row, so /example has nothing to check`
		);
	}
	const { fetchedAt } = index.capture;
	const now = new Date(fetchedAt);
	const rows = [...index.rows].sort(publicationOrder);
	const lines = reasonLines(readText(VERDICT_VIEW), readText(LIST_CONSTANTS));
	const notices = noticeReader(folder, now, lines);
	const probes = Object.fromEntries(
		Object.entries(probeRows(rows, notices)).map(([name, row]) => [
			name,
			row ? notices.facts(row) : null
		])
	);
	const missing = REQUIRED_PROBES.filter((name) => probes[name] === null);
	if (missing.length > 0) {
		throw new HarnessError(
			2,
			`the example capture ${id} holds no notice for the ${missing.join(', ')} probe (${missing.map((name) => PROBE_PROPERTIES[name]).join('; ')}), so the browser checks that visit one cannot run`
		);
	}
	const runPath = join(folder, 'reading-run.json');
	if (!existsSync(runPath)) {
		throw new HarnessError(2, `${runPath} is missing although ${probes.read.notice} was read`);
	}
	const open = rows.filter((row) => noticeDeadline(row.lots, now).open).length;
	return {
		id,
		capturedOn: captureDay(fetchedAt),
		capturedAt: formatDeadline(fetchedAt, SERVER_TIME_ZONE).split(', ')[1],
		rows: rows.length,
		open,
		closed: rows.length - open,
		run: runRecordOf(readBuilt(runPath, ReadingRunSchema, 'a built readings run')),
		required: REQUIRED_PROBES,
		properties: PROBE_PROPERTIES,
		probes
	};
}

// The live list serves the newest capture, so the partner-line driver visits the first notice there,
// in publication order, with a lot that lotStatusOf and decideLotStatus read as PARTNER NEEDED for the
// firm it enters, at the instant the live page compares at. The word and the Article 63 line it
// expects are the site's own; null when no lot reads so.
export function partnerProbe(generatedDir, firm, now = new Date()) {
	loadSiteRules();
	const id = newestCapture(captureLines(generatedDir).map(([each]) => each));
	const folder = join(generatedDir, id);
	const index = readBuilt(join(folder, 'index.json'), SnapshotIndexSchema, 'a built index');
	for (const row of [...index.rows].sort(publicationOrder)) {
		const notice = row.noticeNumber;
		const record = readBuilt(
			join(folder, 'records', `${notice}.json`),
			NoticeRecordSchema,
			'a built record'
		);
		const readingsPath = join(folder, 'readings', `${notice}.json`);
		const readings = existsSync(readingsPath)
			? readBuilt(readingsPath, NoticeReadingsSchema, 'built readings')
			: undefined;
		const at = record.lots.findIndex(
			(lot) =>
				decideLotStatus(lotStatusOf(lot, readings), firm, {
					...lotContextOf(record, lot),
					now: now.toISOString()
				})?.decision.verdict === 'PARTNER NEEDED'
		);
		if (at >= 0) {
			return {
				capture: id,
				notice,
				anchor: `lot-${at + 1}`,
				word: VERDICT_LABELS['PARTNER NEEDED'],
				article63: textConstant(readText(VERDICT_VIEW), 'ARTICLE_63_LINE')
			};
		}
	}
	return null;
}
