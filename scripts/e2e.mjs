#!/usr/bin/env node
// e2e.mjs - end-to-end checks of the BUILT Worker in a real browser.
//
// Two layers, because dev-browser scripts run in QuickJS and cannot spawn a server or set an
// exit code: this Node layer builds the Worker, serves it with wrangler dev on 127.0.0.1:8788,
// runs every scripts/e2e/*.devbrowser.js driver through the dev-browser CLI in name order, and
// owns the verdict. Each driver reads pagefifty-e2e-run.json from the dev-browser tmp folder
// (its result name, under latest the facts of the newest built capture, and under example the
// example capture's facts and the notices it visits there) and writes
// { driver, checks: [{ name, ok, detail, didNotRun? }] } to the result name it finds there. A
// check marked didNotRun is printed as such and never counted as passed. A driver may add
// logMustNotContain (strings the Worker's request log must not hold) and logMustContain (lines
// it must), checked here after every driver has run.
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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { cetDayEnd } from '../src/lib/core/deadline.ts';
import { captureDay, firstPublishedDay, newestCapture } from '../src/lib/snapshot/capture-id.ts';
import { SnapshotIndexSchema } from '../src/lib/snapshot/index-row.ts';
import { ReadingRunSchema } from '../src/lib/snapshot/readings.ts';
import { SearchRunSchema } from '../src/lib/snapshot/search-run.ts';
import {
	DEV_BROWSER_TMP,
	HarnessError,
	acquireRunLock,
	buildWorker,
	checkAllowlist,
	checkDevBrowser,
	exampleFacts,
	marginWarnings,
	readResult,
	releaseRunLock,
	runDriver,
	startWorker,
	stopWorker,
	tallyChecks,
	writeRunConfig
} from './harness.mjs';

const PORT = 8788;
const BASE_URL = `http://127.0.0.1:${PORT}/`;
const PLANTED_CHECK = 'planted: unknown path answers 200';
const DRIVER_SECONDS = 60;
const CLEANUP_DRIVER = resolve('scripts/e2e/cleanup/close-pages.devbrowser.js');
const CLEANUP_SECONDS = 20;

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

const GENERATED = 'src/lib/snapshot/generated';
const COUNTRY_TABLE = 'src/lib/tenders/list.ts';

// The tender page names a buyer country through the table in list.ts, which Node cannot import
// (its own imports carry no extension), so the table is read from that file's text.
function countryNames() {
	const text = readFileSync(COUNTRY_TABLE, 'utf8');
	return new Map(
		[...text.matchAll(/\['([A-Z]{3})', '([^']+)'\]/g)].map(([, code, name]) => [code, name])
	);
}

// A deadline filter that ends the day before the capture day keeps only tenders closed before the
// capture, so it is closed under the real clock whichever capture is served.
function dayBefore(id) {
	const [year, month, day] = id.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
	return { date, endsAt: cetDayEnd(date).toISOString() };
}

function noticeOrder(left, right) {
	const [leftRunning, leftYear] = left.noticeNumber.split('-').map(Number);
	const [rightRunning, rightYear] = right.noticeNumber.split('-').map(Number);
	return leftYear - rightYear || leftRunning - rightRunning;
}

// The live routes serve whatever capture is newest, so their expectations come from the build,
// never from the drivers: the next capture then needs no driver change.
function latestCapture() {
	let id;
	try {
		id = newestCapture(readdirSync(GENERATED));
	} catch (error) {
		throw new HarnessError(2, `${GENERATED}: ${error.message}`);
	}
	const path = join(GENERATED, id, 'index.json');
	let parsed;
	try {
		parsed = SnapshotIndexSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
	} catch (error) {
		throw new HarnessError(2, `${path} could not be read as JSON: ${error.message}`);
	}
	if (!parsed.success) {
		throw new HarnessError(2, `${path} is not a built index: ${parsed.error.message}`);
	}
	const { capture, rows } = parsed.data;
	if (rows.length === 0 || capture.total === 0) {
		throw new HarnessError(
			2,
			`${path} holds ${rows.length} rows of a stated ${capture.total}, so there is nothing to check the live pages against`
		);
	}
	const [first] = [...rows].sort(noticeOrder);
	const names = countryNames();
	const unnamed = first.country.filter((code) => !names.has(code));
	if (unnamed.length > 0) {
		throw new HarnessError(2, `${COUNTRY_TABLE} names no country for ${unnamed.join(', ')}`);
	}
	return {
		id,
		rows: rows.length,
		total: capture.total,
		capturedOn: captureDay(capture.fetchedAt),
		firstPublished: firstPublishedDay(capture.query),
		dayBefore: dayBefore(id),
		probe: {
			notice: first.noticeNumber,
			lots: first.lots.length,
			countries: first.country.map((code) => names.get(code))
		}
	};
}

function builtJson(path, schema) {
	let parsed;
	try {
		parsed = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
	} catch (error) {
		throw new HarnessError(2, `${path} could not be read as JSON: ${error.message}`);
	}
	if (!parsed.success)
		throw new HarnessError(2, `${path} is not a built run: ${parsed.error.message}`);
	return parsed.data;
}

// The trust pages name the model of the newest capture the model read and the providers that
// capture used, so the drivers expect what the build wrote. The rule for naming the search
// provider is written here a second time on purpose: an expectation computed by the page's own
// function would agree with any defect in it.
function trustFacts() {
	const read = readdirSync(GENERATED).filter((name) =>
		existsSync(join(GENERATED, name, 'reading-run.json'))
	);
	if (read.length === 0) {
		throw new HarnessError(
			2,
			`${GENERATED} holds no reading-run.json, so the AI page has nothing to show`
		);
	}
	const id = newestCapture(read);
	const run = builtJson(join(GENERATED, id, 'reading-run.json'), ReadingRunSchema);
	const searchPath = join(GENERATED, id, 'search-run.json');
	const search = existsSync(searchPath) ? builtJson(searchPath, SearchRunSchema) : null;
	const providers = [run.provider, ...(search !== null && search.searches > 0 ? ['Tavily'] : [])];
	return { capture: id, model: run.model, region: run.region, providers };
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

function runDrivers(runId, latest, trust, example) {
	const checks = [];
	const logRules = [];
	const times = [];
	for (const [index, driverPath] of driverPaths().entries()) {
		const resultName = `pagefifty-e2e-${runId}-${index}.json`;
		writeRunConfig('pagefifty-e2e-run.json', { runId, resultName, latest, trust, example });
		const started = Date.now();
		const run = runDriver({
			browserName: 'pagefifty-e2e',
			driverPath,
			timeoutSeconds: DRIVER_SECONDS
		});
		const seconds = Math.round((Date.now() - started) / 1000);
		times.push({ name: basename(driverPath, '.devbrowser.js'), seconds });
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
			// Its named page may still be open, and the next page on the same site would crash.
			const cleanup = runDriver({
				browserName: 'pagefifty-e2e',
				driverPath: CLEANUP_DRIVER,
				timeoutSeconds: CLEANUP_SECONDS
			});
			console.log(
				`[e2e] after ${basename(driverPath)}: cleanup exit ${cleanup.code}, ${cleanup.output.trim()}`
			);
		}
	}
	// A driver is stopped at its limit, so each one's time is printed on every run, before a new
	// check spends the margin. It is timed around the whole browser call, start-up included.
	console.log(
		`[e2e] seconds per driver, each of a ${DRIVER_SECONDS} s limit: ${times.map(({ name, seconds }) => `${name} ${seconds}`).join(', ')}`
	);
	return { checks, logRules, times };
}

function verdict(checks) {
	const tally = tallyChecks(checks);
	for (const line of tally.lines) console.log(line);
	console.log(tally.summary);
	for (const line of tally.notRunLines) console.log(`e2e: ${line}`);
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
	return tally.failed === 0 ? 0 : 1;
}

function describeExample(example) {
	const picks = Object.entries(example.probes)
		.map(([name, probe]) => `${name} ${probe ? probe.notice : 'none'}`)
		.join(', ');
	return `[e2e] example capture ${example.id}: ${example.rows} rows, ${example.open} open and ${example.closed} closed at its capture instant; probes ${picks}`;
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
		const latest = latestCapture();
		console.log(
			`[e2e] newest capture ${latest.id}: ${latest.rows} rows of ${latest.total} listed, probe ${latest.probe.notice}`
		);
		const trust = trustFacts();
		console.log(
			`[e2e] trust pages: model ${trust.model} in ${trust.region} from capture ${trust.capture}, providers ${trust.providers.join(', ')}`
		);
		const example = exampleFacts(GENERATED);
		console.log(describeExample(example));
		const runId = randomUUID().slice(0, 8);
		const logFile = join(DEV_BROWSER_TMP, `pagefifty-e2e-${runId}-wrangler.log`);
		worker = await startWorker({ port: PORT, logFile });
		console.log(`[e2e] wrangler dev pid ${worker.pid} on ${BASE_URL}, log ${logFile}`);
		const { checks, logRules, times } = runDrivers(runId, latest, trust, example);
		const log = logRules.length > 0 ? await settledLog(logFile) : '';
		code = verdict([...checks, ...logChecks(log, logRules)]);
		for (const line of marginWarnings(times, DRIVER_SECONDS)) {
			console.warn(`e2e: WARNING driver ${line}: split it before it gains a check`);
		}
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
