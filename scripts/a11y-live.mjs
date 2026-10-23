#!/usr/bin/env node
// a11y-live.mjs - axe-core over the BUILT Worker's pages, route by theme, in a real browser.
//
// The Node layer builds the Worker, serves it with wrangler dev on 127.0.0.1:8788, stages
// axe-core's minified source as text into the dev-browser tmp folder (the QuickJS driver cannot
// import it), and runs scripts/a11y-live.devbrowser.js once per theme in a browser instance named
// for this run alone, so a stylesheet cached by an earlier run can never hide a change. The driver
// owns the literal route list and one screenshot per route and theme; this file owns the theme
// loop and the verdict.
//
// Painted-pixel contrast is not checked here (no pngjs): axe's own contrast rule runs, but a
// colour it cannot composite comes back incomplete, and incomplete fails unless the driver's
// reasoned allowlist names it.
//
// Usage:  node scripts/a11y-live.mjs [--no-build]
// Exit codes: 0 no violation and no unlisted incomplete result,
//             1 a violation, an unlisted incomplete result, no dev-browser, or a URL not allowlisted,
//             2 the audit did not happen: zero routes or themes, a driver result without its theme
//               list, a route list naming a theme this runner does not run, a theme's run that left
//               no result or audited no page, fewer pages than its entries or another theme's, a page
//               that did not load with an h1 and its theme, a page not audited at the width or list
//               layout its entry names, target-size never ran, or the lock, port or server failed.

import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	DEV_BROWSER_TMP,
	HarnessError,
	acquireRunLock,
	buildWorker,
	checkAllowlist,
	checkDevBrowser,
	closedRowsUnaudited,
	exampleFacts,
	expectedListLayout,
	marginWarnings,
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
const GENERATED = 'src/lib/snapshot/generated';
const DRIVER_SECONDS = 260;
// Each theme runs as its own driver with the whole limit. All 26 pages in one run took 171 to 224 s
// on a quiet machine, then passed the limit twice on 2026-10-08 (280 s) while another program used
// about a quarter of the CPU. The limit stays under the run lock's stale age, which runDriver
// enforces, so an audit that outgrows it is split further rather than given more time.
const THEMES = ['light', 'dark'];

function reportPage(page) {
	if (page.loadProblem) {
		console.log(`${page.slug} | ${page.theme} | NOT AUDITED | ${page.loadProblem}`);
		return;
	}
	const accepted = page.acceptedIncomplete.length;
	const status = page.expectStatus ? ` | status ${page.expectStatus} as expected` : '';
	const group = page.auditedGroup ? ` from the ${page.auditedGroup} group` : '';
	const closed =
		page.auditedClosed && page.auditedClosed !== 'none'
			? `, closed group ${page.auditedClosed}`
			: '';
	const layout = page.layout ? ` as ${page.auditedLayout}${group}${closed}` : '';
	const shot = page.shots ? page.screenshot : 'no shots, its route and theme have them';
	const followed = page.followed ? ` | reached ${page.followed} by its row` : '';
	console.log(
		`${page.slug} | ${page.theme} at ${page.auditedWidth}px${layout}${status}${followed} | ${page.violations.length} violations | ` +
			`${page.incomplete.length} incomplete (${accepted} accepted) | ${shot}`
	);
	for (const item of [...page.violations, ...page.incomplete]) {
		const kind = page.violations.includes(item) ? 'violation' : 'incomplete';
		console.log(`  ${kind} ${item.id} (${item.impact}): ${item.help}`);
		for (const node of item.nodes) {
			const place = node.place ? ` [${node.place}]` : '';
			console.log(`    ${node.target}${place} ${node.message}`);
		}
	}
	for (const item of page.acceptedIncomplete) {
		const places = Object.entries(item.places ?? {})
			.map(([place, count]) => `${count} ${place}`)
			.join(', ');
		console.log(`  accepted incomplete ${item.id} on ${item.nodes} nodes (${places}): ${item.why}`);
	}
}

function verdict(result) {
	const pages = result.pages;
	const routes = new Set(pages.map((page) => page.slug)).size;
	const themes = new Set(pages.map((page) => page.theme)).size;
	for (const page of pages) reportPage(page);
	const audited = pages.filter((page) => !page.loadProblem);
	const violations = audited.reduce((sum, page) => sum + page.violations.length, 0);
	const incomplete = audited.reduce((sum, page) => sum + page.incomplete.length, 0);
	// A list is audited in both layouts in each theme, so pages outnumber routes times themes.
	console.log(
		`a11y: ${routes} routes in ${themes} themes, ${audited.length} pages audited, ${violations} violations`
	);
	const shooting = audited.filter((page) => page.shots);
	const shots = shooting.reduce((sum, page) => sum + (page.widthShots ?? []).length, 0);
	console.log(
		`a11y: ${shots} screenshots at 390, 768 and 1440 px for the visual backstops, from the ${shooting.length} pages that take them`
	);
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
	if (shooting.length === 0 || shots !== shooting.length * 3) {
		console.error(
			'a11y: a page is missing a width screenshot, so the visual backstops lack evidence'
		);
		return 2;
	}
	// A list shows each of its layouts only at the widths that bring it, so a page read at any width
	// other than the one its entry names left one layout unaudited.
	if (audited.some((page) => page.auditedWidth !== page.width)) {
		console.error('a11y: a page was not audited at the width its entry names');
		return 2;
	}
	// The width is the means and the layout the claim: a split switch that moved past 1440px would
	// leave both entries of a list on the list alone.
	const misread = audited.filter(
		(page) => page.layout && page.auditedLayout !== expectedListLayout(page)
	);
	if (misread.length > 0) {
		const named = misread.map(
			(page) =>
				`${page.slug} ${page.theme} at ${page.width}px read ${page.auditedLayout}, expected ${expectedListLayout(page)}`
		);
		console.error(`a11y: a list page did not show the layout its entry names: ${named.join(', ')}`);
		return 2;
	}
	// The driver accepts undecided contrast on rows the list column scrolled out of view only because
	// each phone entry decides every row, the closed ones with them.
	const folded = audited.filter(closedRowsUnaudited);
	if (folded.length > 0) {
		const named = folded.map(
			(page) => `${page.slug} ${page.theme} (closed group ${page.auditedClosed ?? 'not reported'})`
		);
		console.error(`a11y: a phone list left its closed rows unaudited: ${named.join(', ')}`);
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
		// The example pages are audited on the example capture's notices with each property, chosen
		// from the build by the rule the e2e run uses, so the audit follows the example to the final
		// capture unchanged.
		const example = exampleFacts(GENERATED);
		console.log(
			`[a11y] example capture ${example.id}: mostLots ${example.probes.mostLots.notice}, oneLot ${example.probes.oneLot.notice}, read ${example.probes.read.notice}`
		);
		const runId = randomUUID().slice(0, 8);
		const logFile = join(DEV_BROWSER_TMP, `pagefifty-a11y-${runId}-wrangler.log`);
		worker = await startWorker({ port: PORT, logFile });
		console.log(`[a11y] wrangler dev pid ${worker.pid} on ${BASE_URL}, log ${logFile}`);
		const axeFile = stageAxe();
		const pages = [];
		const times = [];
		for (const theme of THEMES) {
			const resultName = `pagefifty-a11y-${runId}-${theme}-result.json`;
			writeRunConfig('pagefifty-a11y-run.json', { runId, resultName, axeFile, theme, example });
			const started = Date.now();
			// Fourteen routes, each audited and shot at three widths, and each list audited a second time
			// in its other layout without shots.
			const run = runDriver({
				browserName: `pagefifty-a11y-${runId}`,
				driverPath: resolve('scripts/a11y-live.devbrowser.js'),
				timeoutSeconds: DRIVER_SECONDS
			});
			// The long pages' full-page shots take most of the time (about 10 s a page), so the margin
			// is printed on every run, before a new route spends it.
			const seconds = Math.round((Date.now() - started) / 1000);
			times.push({ name: `the ${theme} driver`, seconds });
			console.log(`a11y: the ${theme} driver took ${seconds} s of its ${DRIVER_SECONDS} s limit`);
			const result = readResult(resultName);
			if (run.code !== 0 || !result) {
				throw new HarnessError(
					2,
					`the ${theme} a11y driver did not finish (dev-browser exit ${run.code}${result ? '' : ', no result file'}): ${run.output.trim()}`
				);
			}
			// The driver keeps only the entries of the theme it is given, so an entry in a theme missing
			// here would never be audited by any run. An empty list means an empty route list, which the
			// page count below refuses by name.
			const listed = result.listedThemes;
			if (!Array.isArray(listed)) {
				throw new HarnessError(
					2,
					`the ${theme} a11y driver's result has no listedThemes, so nothing shows which themes its route list names: the driver must write it beside its pages (scripts/a11y-live.devbrowser.js)`
				);
			}
			const unrun = listed.filter((name) => !THEMES.includes(name));
			if (unrun.length > 0) {
				throw new HarnessError(
					2,
					`the a11y route list names the themes ${JSON.stringify(listed)}, and this runner runs only ${JSON.stringify(THEMES)}: add each missing one to THEMES`
				);
			}
			// A run that audited nothing would leave the verdict reading one theme as the whole audit.
			if (
				result.pages.length === 0 ||
				result.pages.length !== result.entries ||
				result.pages.some((page) => page.theme !== theme)
			) {
				throw new HarnessError(
					2,
					`the ${theme} a11y driver audited ${result.pages.length} pages of its ${result.entries} entries, not exactly the ${theme} ones`
				);
			}
			pages.push(...result.pages);
		}
		code = verdict({ pages });
		for (const line of marginWarnings(times, DRIVER_SECONDS)) {
			console.warn(`a11y: WARNING ${line}: split the audit further before it gains a route`);
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
		console.error(`[a11y] ${error.message}`);
		process.exit(error instanceof HarnessError ? error.exitCode : 2);
	}
);
