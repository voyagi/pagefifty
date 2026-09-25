#!/usr/bin/env node
// e2e.mjs - end-to-end checks of the BUILT Worker in a real browser.
//
// Two layers, because dev-browser scripts run in QuickJS and cannot spawn a server or set an
// exit code: this Node layer builds the Worker, serves it with wrangler dev on 127.0.0.1:8788,
// runs every scripts/e2e/*.devbrowser.js driver through the dev-browser CLI in name order, and
// owns the verdict. Each driver reads pagefifty-e2e-run.json from the dev-browser tmp folder
// and writes { driver, checks: [{ name, ok, detail }] } to the result name it finds there.
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
//             2 the run could not run (lock, port, server, zero checks, a crash).

import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

const args = new Set(process.argv.slice(2));
const prove = args.has('--prove');

function driverPaths() {
	if (prove) return [resolve('scripts/e2e/prove/defect.devbrowser.js')];
	return readdirSync('scripts/e2e')
		.filter((name) => name.endsWith('.devbrowser.js'))
		.sort()
		.map((name) => resolve('scripts/e2e', name));
}

function runDrivers(runId) {
	const checks = [];
	for (const [index, driverPath] of driverPaths().entries()) {
		const resultName = `pagefifty-e2e-${runId}-${index}.json`;
		writeRunConfig('pagefifty-e2e-run.json', { runId, resultName });
		const run = runDriver({ browserName: 'pagefifty-e2e', driverPath, timeoutSeconds: 60 });
		const result = readResult(resultName);
		const driver = result?.driver ?? driverPath;
		for (const check of result?.checks ?? []) checks.push({ driver, ...check });
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
	return checks;
}

function verdict(checks) {
	for (const check of checks) {
		console.log(`${check.driver} | ${check.name} | ${check.ok ? 'PASS' : 'FAIL'} | ${check.detail}`);
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
	await acquireRunLock();
	let worker = null;
	let code = 2;
	try {
		if (!args.has('--no-build')) buildWorker();
		const runId = randomUUID().slice(0, 8);
		const logFile = join(DEV_BROWSER_TMP, `pagefifty-e2e-${runId}-wrangler.log`);
		worker = await startWorker({ port: PORT, logFile });
		console.log(`[e2e] wrangler dev pid ${worker.pid} on ${BASE_URL}, log ${logFile}`);
		code = verdict(runDrivers(runId));
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
