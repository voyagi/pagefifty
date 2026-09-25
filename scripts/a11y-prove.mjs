#!/usr/bin/env node
// a11y-prove.mjs - shows the live axe run can fail: it serves a copy of the build that holds one
// planted page, an image with no alt text, and passes only when axe names the image-alt rule.
//
// The copy lives under .stryker-tmp/ (gitignored) and is removed afterwards, so the product
// build is never modified. _worker.js imports ../output/server and ../cloudflare-tmp, so those
// siblings are copied beside .svelte-kit/cloudflare with the same layout. The copy is served by
// wrangler dev on 127.0.0.1:8789 from a temporary config pointing main and assets at it.
//
// Usage:  node scripts/a11y-prove.mjs [--no-build]
// Exit codes: 0 axe named image-alt on the planted page,
//             1 it did not, dev-browser is missing, or the URL is not allowlisted,
//             2 the run could not run (lock, port, server, the planted page did not load).

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
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

const PORT = 8789;
const DEFECT_URL = `http://127.0.0.1:${PORT}/a11y-prove-defect.html`;
const RULE = 'image-alt';

const DEFECT_PAGE = `<!doctype html>
<html lang="en" data-theme="light">
	<head>
		<meta charset="utf-8" />
		<title>a11y prove defect</title>
	</head>
	<body>
		<main>
			<h1>Planted defect</h1>
			<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40" />
		</main>
	</body>
</html>
`;

// wrangler.jsonc may carry comments anywhere and trailing commas; TypeScript's parser reads both.
function readProductConfig() {
	const { config, error } = ts.parseConfigFileTextToJson(
		'wrangler.jsonc',
		readFileSync('wrangler.jsonc', 'utf8')
	);
	if (error) {
		const why = ts.flattenDiagnosticMessageText(error.messageText, ' ');
		throw new HarnessError(2, `wrangler.jsonc did not parse: ${why}`);
	}
	return config;
}

function stageCopy(folder) {
	for (const part of ['cloudflare', 'cloudflare-tmp', join('output', 'server')]) {
		cpSync(join('.svelte-kit', part), join(folder, part), { recursive: true });
	}
	writeFileSync(join(folder, 'cloudflare', 'a11y-prove-defect.html'), DEFECT_PAGE);
	const product = readProductConfig();
	const configPath = join(folder, 'wrangler.json');
	writeFileSync(
		configPath,
		JSON.stringify({
			name: 'pagefifty-a11y-prove',
			compatibility_date: product.compatibility_date,
			compatibility_flags: product.compatibility_flags,
			main: 'cloudflare/_worker.js',
			assets: { binding: 'ASSETS', directory: 'cloudflare' }
		})
	);
	return configPath;
}

async function main() {
	checkDevBrowser();
	checkAllowlist(DEFECT_URL);
	await acquireRunLock();
	const runId = randomUUID().slice(0, 8);
	const folder = resolve('.stryker-tmp', `a11y-prove-${runId}`);
	let worker = null;
	let code = 2;
	try {
		if (!process.argv.includes('--no-build')) buildWorker();
		mkdirSync(folder, { recursive: true });
		const configPath = stageCopy(folder);
		const logFile = join(DEV_BROWSER_TMP, `pagefifty-a11y-prove-${runId}-wrangler.log`);
		worker = await startWorker({ port: PORT, configPath, logFile });
		console.log(`[a11y-prove] wrangler dev pid ${worker.pid} serving the planted copy, log ${logFile}`);
		const resultName = `pagefifty-a11y-prove-${runId}-result.json`;
		writeRunConfig('pagefifty-a11y-run.json', { runId, resultName, axeFile: stageAxe() });
		const run = runDriver({
			browserName: `pagefifty-a11y-${runId}`,
			driverPath: resolve('scripts/a11y-prove.devbrowser.js'),
			timeoutSeconds: 120
		});
		const page = readResult(resultName)?.pages?.[0];
		if (run.code !== 0 || !page) {
			throw new HarnessError(2, `the prove driver did not finish (dev-browser exit ${run.code}): ${run.output.trim()}`);
		}
		if (page.loadProblem) throw new HarnessError(2, `the planted page did not load: ${page.loadProblem}`);
		for (const item of page.violations) console.log(`  violation ${item.id}: ${item.help} (${item.targets.join(', ')})`);
		const caught = page.violations.some((item) => item.id === RULE);
		console.log(
			caught
				? `a11y-prove: axe named ${RULE} on the planted page, so a11y:live can go red`
				: `a11y-prove: axe did not name ${RULE} on the planted page; a11y:live is not proven`
		);
		code = caught ? 0 : 1;
	} finally {
		if (worker && !(await stopWorker(worker.child))) code = 2;
		// A worker that did not stop can still hold a file in the copy. The copy sits in an ignored
		// folder, so the run keeps its own result, says what it left, and still frees the lock.
		try {
			rmSync(folder, { recursive: true, force: true });
		} catch (error) {
			console.error(`[a11y-prove] could not remove ${folder}: ${error.message}`);
		}
		releaseRunLock();
	}
	return code;
}

main().then(
	(code) => process.exit(code),
	(error) => {
		console.error(`[a11y-prove] ${error.message}`);
		process.exit(error instanceof HarnessError ? error.exitCode : 2);
	}
);
