#!/usr/bin/env node
// e2e.mjs - end-to-end checks of the BUILT Worker in a real browser.
//
// Two layers, because dev-browser scripts run in QuickJS and cannot spawn a server or set an
// exit code: this Node layer builds the Worker, serves it with wrangler dev on 127.0.0.1:8788,
// runs every scripts/e2e/*.devbrowser.js driver through the dev-browser CLI in name order, and
// owns the verdict. Each driver reads pagefifty-e2e-run.json from the dev-browser tmp folder
// and writes { driver, checks: [{ name, ok, detail }] } to the result name it finds there. A
// driver may add logMustNotContain (strings the Worker's request log must not hold) and
// logMustContain (lines it must), checked here after every driver has run.
//
// A run that checked nothing is never a pass: no dev-browser is exit 1 (never SKIPPED, since
// verify:ship runs this locally and a skip would hide a run that never happened), and zero
// checks run is exit 2.
//
// --prove runs only scripts/e2e/prove/defect.devbrowser.js, whose one check is planted to
// fail, and exits 0 only when that named check failed: the proof this runner can go red.
//
// Usage:  node scripts/e2e.mjs [--no-build] [--prove]
// Exit codes: 0 every check passed (or, with --prove, the planted check failed),
//             1 a check failed, dev-browser is missing or the URL is not allowlisted,
//             2 the run could not run (lock, port, server, zero checks, a crash, or the two
//               copies of the shared width-sweep code differ).

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	DEV_BROWSER_TMP,
	HarnessError,
	acquireRunLock,
	buildWorker,
	checkAllowlist,
	checkDevBrowser,
	readResult,
	releaseRunLock,
	runDriver,
	startWorker,
	stopWorker,
	writeRunConfig
} from './harness.mjs';

const PORT = 8788;
const BASE_URL = `http://127.0.0.1:${PORT}/`;
const PLANTED_CHECK = 'planted: unknown path answers 200';
const DRIVER_SECONDS = 60;

const args = new Set(process.argv.slice(2));
const prove = args.has('--prove');

function driverPaths() {
	if (prove) return [resolve('scripts/e2e/prove/defect.devbrowser.js')];
	return readdirSync('scripts/e2e')
		.filter((name) => name.endsWith('.devbrowser.js'))
		.sort()
		.map((name) => resolve('scripts/e2e', name));
}

// The tenders and example drivers measure their list pages with the same width-sweep code, which
// a driver cannot import, so each carries a copy between two markers. A run refuses to start when
// the copies differ, which is what keeps one from changing without the other.
const TWINS = ['scripts/e2e/tenders.devbrowser.js', 'scripts/e2e/example.devbrowser.js'];

function sharedSweep(path) {
	const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
	const start = text.indexOf('// shared-sweep:start');
	const end = text.indexOf('// shared-sweep:end');
	if (start < 0 || end < start) {
		throw new HarnessError(2, `${path} lacks its shared-sweep:start and shared-sweep:end markers`);
	}
	return text.slice(start, end);
}

function checkTwins() {
	const [first, second] = TWINS.map(sharedSweep);
	if (first !== second) {
		throw new HarnessError(
			2,
			`the shared width-sweep code in ${TWINS.join(' and ')} differs: make the two blocks identical`
		);
	}
}

function readLog(logFile) {
	try {
		return readFileSync(logFile, 'utf8');
	} catch (error) {
		console.error(`[e2e] the wrangler log could not be read: ${error.message}`);
		return '';
	}
}

// The drivers run through spawnSync, which blocks this process, so wrangler's output waits in its
// pipe until the event loop runs again. The log is read once it has stopped growing.
async function settledLog(logFile) {
	let last = -1;
	let log = readLog(logFile);
	for (let wait = 0; wait < 40 && log.length !== last; wait += 1) {
		last = log.length;
		await new Promise((done) => setTimeout(done, 250));
		log = readLog(logFile);
	}
	return log;
}

// wrangler dev logs each request by method and path only, so this is a second check on paths; the
// canary driver's own capture of every request the page sends is the proof on addresses, headers
// and bodies. A driver that names strings the log must hold proves the log read is this run's.
function logChecks(log, logRules) {
	return logRules.flatMap(({ driver, mustNotContain, mustContain }) => {
		const found = mustNotContain.filter((marker) => log.includes(marker));
		const missing = mustContain.filter((line) => !log.includes(line));
		return [
			{
				driver,
				name: 'Worker log carries no marker',
				ok: log.length > 0 && missing.length === 0 && found.length === 0,
				detail:
					`${log.split(/\r?\n/).length} log lines, ${mustNotContain.length} markers, ` +
					`found ${JSON.stringify(found)}, expected lines missing ${JSON.stringify(missing)}`
			}
		];
	});
}

function runDrivers(runId) {
	const checks = [];
	const logRules = [];
	const times = [];
	for (const [index, driverPath] of driverPaths().entries()) {
		const resultName = `pagefifty-e2e-${runId}-${index}.json`;
		writeRunConfig('pagefifty-e2e-run.json', { runId, resultName });
		const started = Date.now();
		const run = runDriver({
			browserName: 'pagefifty-e2e',
			driverPath,
			timeoutSeconds: DRIVER_SECONDS
		});
		const seconds = Math.round((Date.now() - started) / 1000);
		times.push(`${basename(driverPath, '.devbrowser.js')} ${seconds}`);
		const result = readResult(resultName);
		const driver = result?.driver ?? driverPath;
		for (const check of result?.checks ?? []) checks.push({ driver, ...check });
		if (Array.isArray(result?.logMustNotContain)) {
			logRules.push({
				driver,
				mustNotContain: result.logMustNotContain,
				mustContain: Array.isArray(result.logMustContain) ? result.logMustContain : []
			});
		}
		// A driver that died part-way must not leave only its passing checks behind.
		if (run.code !== 0 || !result) {
			checks.push({
				driver,
				name: 'driver ran to completion',
				ok: false,
				detail: `dev-browser exit ${run.code}${result ? '' : ', no result file'}: ${run.output.trim()}`
			});
		}
	}
	// A driver is stopped at its limit, so each one's time is printed on every run, before a new
	// check spends the margin. It is timed around the whole browser call, start-up included.
	console.log(`[e2e] seconds per driver, each of a ${DRIVER_SECONDS} s limit: ${times.join(', ')}`);
	return { checks, logRules };
}

function verdict(checks) {
	for (const check of checks) {
		console.log(
			`${check.driver} | ${check.name} | ${check.ok ? 'PASS' : 'FAIL'} | ${check.detail}`
		);
	}
	const passed = checks.filter((check) => check.ok).length;
	console.log(`e2e: ${checks.length} checks, ${passed} passed`);
	if (checks.length === 0) {
		console.error('e2e: zero checks ran, so this run proved nothing');
		return 2;
	}
	if (prove) {
		const planted = checks.find((check) => check.name === PLANTED_CHECK);
		const caught = planted && !planted.ok && checks.length === 1;
		console.log(
			caught
				? `e2e --prove: the planted check "${PLANTED_CHECK}" failed, so this runner can go red`
				: `e2e --prove: the planted check "${PLANTED_CHECK}" did not fail alone; this runner is not proven`
		);
		return caught ? 0 : 1;
	}
	return passed === checks.length ? 0 : 1;
}

async function main() {
	checkDevBrowser();
	checkAllowlist(BASE_URL);
	checkTwins();
	await acquireRunLock();
	let worker = null;
	let code = 2;
	try {
		if (!args.has('--no-build')) buildWorker();
		const runId = randomUUID().slice(0, 8);
		const logFile = join(DEV_BROWSER_TMP, `pagefifty-e2e-${runId}-wrangler.log`);
		worker = await startWorker({ port: PORT, logFile });
		console.log(`[e2e] wrangler dev pid ${worker.pid} on ${BASE_URL}, log ${logFile}`);
		const { checks, logRules } = runDrivers(runId);
		const log = logRules.length > 0 ? await settledLog(logFile) : '';
		code = verdict([...checks, ...logChecks(log, logRules)]);
	} finally {
		if (worker && !(await stopWorker(worker.child))) code = 2;
		releaseRunLock();
	}
	return code;
}

main().then(
	(code) => process.exit(code),
	(error) => {
		console.error(`[e2e] ${error.message}`);
		process.exit(error instanceof HarnessError ? error.exitCode : 2);
	}
);
