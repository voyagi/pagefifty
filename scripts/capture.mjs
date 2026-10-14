#!/usr/bin/env node
// capture.mjs - npm run capture: searches TED for today's open IT notices in the Netherlands,
// Belgium and Germany, downloads each notice's XML into .capture-cache/, keeps active notices and
// latest versions only, scrubs contact data in a staging folder, checks it, and only then writes
// examples/<capture date>/ in the shape scripts/build-records.mjs reads.
//
// This script is a thin caller: it builds the live transport, the real clock, the repository root
// and the git HEAD, and hands them to runCapture (src/lib/capture/run.ts), where every rule lives
// and where the tests drive it with a stub TED. Code under src/ may not spawn a process, so git is
// read here.
//
// Usage:  npm run capture
// Exit codes: 0 the capture was written,
//             1 the run failed and wrote no folder,
//             2 refused before any request.

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCapture } from '../src/lib/capture/run.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REQUEST_TIMEOUT_MS = 30_000;

function gitHead() {
	return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
}

// No redirect is followed: an address TED answers with a 3xx is a failed notice, never a request to
// wherever the answer points.
const transport = (request) =>
	fetch(request, { redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

const clock = {
	now: () => Date.now(),
	sleep: (ms) => new Promise((done) => setTimeout(done, ms))
};

async function main() {
	let head;
	try {
		head = gitHead();
	} catch (error) {
		console.error(`capture: could not read the git HEAD commit: ${error.message}`);
		return 2;
	}
	return runCapture({
		root: repository,
		transport,
		clock,
		argv: process.argv.slice(2),
		// The only variable the command reads, from the shell that runs it.
		env: { PAGEFIFTY_LIVE: process.env.PAGEFIFTY_LIVE },
		head,
		pid: process.pid,
		log: (line) => console.log(line)
	});
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error) => {
		console.error(`capture: ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
);
