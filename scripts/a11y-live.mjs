#!/usr/bin/env node
// a11y-live.mjs - axe-core over the BUILT Worker's pages, route by theme, in a real browser.
//
// The Node layer builds the Worker, serves it with wrangler dev on 127.0.0.1:8788, stages
// axe-core's minified source as text into the dev-browser tmp folder (the QuickJS driver cannot
// import it), and runs scripts/a11y-live.devbrowser.js in a browser instance named for this run
// alone, so a stylesheet cached by an earlier run can never hide a change. The driver owns the
// literal route list, the theme loop and one screenshot per route and theme; this file owns the
// verdict.
//
// Painted-pixel contrast is not checked here (no pngjs): axe's own contrast rule runs, but a
// colour it cannot composite comes back incomplete, and incomplete fails unless the driver's
// reasoned allowlist names it.
//
// Usage:  node scripts/a11y-live.mjs [--no-build]
// Exit codes: 0 no violation and no unlisted incomplete result,
//             1 a violation, an unlisted incomplete result, no dev-browser, or a URL not allowlisted,
//             2 the audit did not happen: zero routes or themes, a page that did not load with an
//               h1 and its theme, a page not audited at the width or list layout its entry names,
//               target-size never ran, or the lock, port or server failed.

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
	stageAxe,
	startWorker,
	stopWorker,
	writeRunConfig
} from './harness.mjs';

const PORT = 8788;
const BASE_URL = `http://127.0.0.1:${PORT}/`;
const DRIVER_SECONDS = 260;

function reportPage(page) {
	if (page.loadProblem) {
		console.log(`${page.slug} | ${page.theme} | NOT AUDITED | ${page.loadProblem}`);
		return;
	}
	const accepted = page.acceptedIncomplete.length;
	const status = page.expectStatus ? ` | status ${page.expectStatus} as expected` : '';
	const layout = page.layout ? ` as ${page.auditedLayout}` : '';
	console.log(
		`${page.slug} | ${page.theme} at ${page.auditedWidth}px${layout}${status} | ${page.violations.length} violations | ` +
			`${page.incomplete.length} incomplete (${accepted} accepted) | ${page.screenshot}`
	);
	for (const item of [...page.violations, ...page.incomplete]) {
		const kind = page.violations.includes(item) ? 'violation' : 'incomplete';
		console.log(`  ${kind} ${item.id} (${item.impact}): ${item.help}`);
		for (const node of item.nodes) console.log(`    ${node.target} ${node.message}`);
	}
	for (const item of page.acceptedIncomplete)
		console.log(`  accepted incomplete ${item.id}: ${item.why}`);
}

function verdict(result) {
	const pages = result.pages;
	const routes = new Set(pages.map((page) => page.slug)).size;
	const themes = new Set(pages.map((page) => page.theme)).size;
	for (const page of pages) reportPage(page);
	const audited = pages.filter((page) => !page.loadProblem);
	const violations = audited.reduce((sum, page) => sum + page.violations.length, 0);
	const incomplete = audited.reduce((sum, page) => sum + page.incomplete.length, 0);
	console.log(
		`a11y: ${routes} routes x ${themes} themes = ${audited.length} pages audited, ${violations} violations`
	);
	const shots = audited.reduce((sum, page) => sum + (page.widthShots ?? []).length, 0);
	console.log(`a11y: ${shots} screenshots at 390, 768 and 1440 px for the visual backstops`);
	if (routes === 0 || themes === 0) {
		console.error('a11y: zero routes or themes configured, so nothing was audited');
		return 2;
	}
	if (audited.length !== pages.length) {
		console.error(
			'a11y: a page did not load with its expected status, an h1 and its theme, so it was not audited'
		);
		return 2;
	}
	if (shots !== audited.length * 3) {
		console.error(
			'a11y: a page is missing a width screenshot, so the visual backstops lack evidence'
		);
		return 2;
	}
	// A list is audited as its table only at the width its entry names, so a page read at any other
	// width left one layout unaudited.
	if (audited.some((page) => page.auditedWidth !== page.width)) {
		console.error('a11y: a page was not audited at the width its entry names');
		return 2;
	}
	// The width is the means and the layout the claim: a switch that moved past 1440px would leave
	// both entries of a list on its cards.
	if (audited.some((page) => page.layout && page.auditedLayout !== page.layout)) {
		console.error('a11y: a list page did not show the layout its entry names');
		return 2;
	}
	if (audited.some((page) => !page.targetSizeRan)) {
		console.error('a11y: the target-size rule did not run, so WCAG 2.5.8 went unchecked');
		return 2;
	}
	if (incomplete > 0)
		console.error(`a11y: ${incomplete} incomplete results not in the driver's allowlist`);
	return violations > 0 || incomplete > 0 ? 1 : 0;
}

async function main() {
	checkDevBrowser();
	checkAllowlist(BASE_URL);
	await acquireRunLock();
	let worker = null;
	let code = 2;
	try {
		if (!process.argv.includes('--no-build')) buildWorker();
		const runId = randomUUID().slice(0, 8);
		const logFile = join(DEV_BROWSER_TMP, `pagefifty-a11y-${runId}-wrangler.log`);
		worker = await startWorker({ port: PORT, logFile });
		console.log(`[a11y] wrangler dev pid ${worker.pid} on ${BASE_URL}, log ${logFile}`);
		const resultName = `pagefifty-a11y-${runId}-result.json`;
		writeRunConfig('pagefifty-a11y-run.json', { runId, resultName, axeFile: stageAxe() });
		const started = Date.now();
		const run = runDriver({
			browserName: `pagefifty-a11y-${runId}`,
			driverPath: resolve('scripts/a11y-live.devbrowser.js'),
			// Eleven routes in two themes, each audited and then shot at three widths; kept under the
			// run lock's stale age, which runDriver enforces, so the cap cannot grow much past this.
			timeoutSeconds: DRIVER_SECONDS
		});
		// The long pages' full-page shots take most of the time (about 206 s of 260 on 2026-10-01,
		// about 9 s a page), so the margin is printed on every run, before a new route spends it.
		const seconds = (Date.now() - started) / 1000;
		console.log(`a11y: the driver took ${seconds.toFixed(0)} s of its ${DRIVER_SECONDS} s limit`);
		const result = readResult(resultName);
		if (run.code !== 0 || !result) {
			throw new HarnessError(
				2,
				`the a11y driver did not finish (dev-browser exit ${run.code}): ${run.output.trim()}`
			);
		}
		code = verdict(result);
	} finally {
		if (worker && !(await stopWorker(worker.child))) code = 2;
		releaseRunLock();
	}
	return code;
}

main().then(
	(code) => process.exit(code),
	(error) => {
		console.error(`[a11y] ${error.message}`);
		process.exit(error instanceof HarnessError ? error.exitCode : 2);
	}
);
