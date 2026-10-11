#!/usr/bin/env node
// check-provider-keys.mjs - fails a ship build whose output names a metered provider key, or holds
// a canary value standing in for one.
//
// The vendored client-secrets gate matches vendor key shapes and knows neither NEBIUS_API_KEY nor
// TAVILY_API_KEY, whose values have no fixed shape. This check reads every file under each folder
// as bytes, so a font, an image or a source map is covered without a list of text types. A value
// given with --canary is searched the same way and never printed, so a build run with made-up key
// values in its environment can prove no environment value reached the output.
//
// The Worker that deploys is more than .svelte-kit/cloudflare: its _worker.js imports the server
// build from .svelte-kit/output/server and a manifest from .svelte-kit/cloudflare-tmp, and wrangler
// bundles those at deploy. A file given with --entry must sit inside a scanned folder, and every
// relative import reachable from it must resolve inside one too, so a folder list that misses part
// of the deployed code refuses to run instead of passing over it.
//
// Usage:  node scripts/check-provider-keys.mjs DIR... [--entry FILE]... [--canary VALUE]...
// Exit codes: 0 no key name or canary value in any file,
//             1 a file holds one (one line per file and name found),
//             2 bad usage, a missing folder, a folder with no file, a file that could not be read, or
//               an entry or one of its relative imports outside the scanned folders (nothing scanned
//               is never clean).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const KEY_NAMES = ['NEBIUS_API_KEY', 'TAVILY_API_KEY'];

// TypeScript's import scanner returns static imports, re-exports, side-effect imports and dynamic
// import() calls, and skips comments and strings: the server build carries JSDoc types such as
// import('../../../utils/page_nodes.js') that a regex reads as an import. Relative only: a bare
// specifier names a package wrangler bundles from node_modules, never this build's output.
function relativeImports(text) {
	return ts
		.preProcessFile(text, true, true)
		.importedFiles.map(({ fileName }) => fileName)
		.filter((name) => name.startsWith('./') || name.startsWith('../'));
}

class UsageError extends Error {}

function parseArgs(argv) {
	const folders = [];
	const canaries = [];
	const entries = [];
	for (let at = 0; at < argv.length; at++) {
		const arg = argv[at];
		if (arg === '--canary' || arg === '--entry') {
			const value = argv[at + 1];
			if (value === undefined || value === '') throw new UsageError(`${arg} needs a non-empty value`);
			(arg === '--canary' ? canaries : entries).push(value);
			at++;
		} else if (arg.startsWith('--')) {
			throw new UsageError(`unknown option ${arg}`);
		} else {
			folders.push(arg);
		}
	}
	if (folders.length === 0) {
		throw new UsageError(
			'usage: node scripts/check-provider-keys.mjs DIR... [--entry FILE]... [--canary VALUE]...'
		);
	}
	return { folders, canaries, entries };
}

function insideAny(path, folders) {
	return folders.some((folder) => {
		const inner = relative(resolve(folder), path);
		return inner !== '' && !inner.startsWith('..') && !isAbsolute(inner);
	});
}

// An entry whose own file, or any relative import reachable from it, lies outside every scanned
// folder means the folder list misses deployed code; that is a usage error, never a clean scan. The
// walk follows each imported .js or .mjs file that exists; a target it cannot read is not followed.
function assertEntryCovered(entry, folders) {
	const start = resolve(entry);
	if (!existsSync(start)) throw new UsageError(`entry ${entry} is missing`);
	if (!insideAny(start, folders)) throw new UsageError(`entry ${entry} is outside the scanned folders`);
	const shown = (file) => (file === start ? `entry ${entry}` : relative(process.cwd(), file).replaceAll('\\', '/'));
	const seen = new Set([start]);
	const queue = [start];
	while (queue.length > 0) {
		const file = queue.pop();
		for (const specifier of relativeImports(readFileSync(file, 'utf8'))) {
			const target = resolve(dirname(file), specifier);
			if (!insideAny(target, folders)) {
				throw new UsageError(`${shown(file)} imports ${specifier}, outside the scanned folders`);
			}
			if (!seen.has(target) && /\.m?js$/.test(target) && existsSync(target)) {
				seen.add(target);
				queue.push(target);
			}
		}
	}
}

function filesUnder(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? filesUnder(path) : [path];
	});
}

function folderFiles(folder) {
	let isFolder;
	try {
		isFolder = statSync(folder).isDirectory();
	} catch {
		throw new UsageError(`${folder} is missing`);
	}
	if (!isFolder) throw new UsageError(`${folder} is not a folder`);
	const files = filesUnder(folder);
	if (files.length === 0) throw new UsageError(`${folder} holds no file`);
	return files;
}

function hitsIn(bytes, names, canaries) {
	const found = names.filter(({ needle }) => bytes.includes(needle)).map(({ label }) => label);
	if (canaries.some((needle) => bytes.includes(needle))) found.push('a canary value');
	return found;
}

function main(argv) {
	const { folders, canaries, entries } = parseArgs(argv);
	for (const entry of entries) assertEntryCovered(entry, folders);
	const names = KEY_NAMES.map((label) => ({ label, needle: Buffer.from(label, 'ascii') }));
	const canaryBytes = canaries.map((value) => Buffer.from(value, 'utf8'));
	const hits = [];
	let scanned = 0;
	for (const folder of folders) {
		for (const file of folderFiles(folder)) {
			scanned++;
			const shown = `${folder}/${relative(folder, file)}`.replaceAll('\\', '/');
			for (const hit of hitsIn(readFileSync(file), names, canaryBytes)) {
				hits.push(`provider-keys: ${shown}: ${hit}`);
			}
		}
	}
	if (hits.length > 0) {
		for (const line of hits) console.log(line);
		return 1;
	}
	console.log(
		`provider-keys: scanned ${scanned} files in ${folders.length} folders, no key name or canary value`
	);
	return 0;
}

try {
	process.exitCode = main(process.argv.slice(2));
} catch (error) {
	console.error(`provider-keys: ${error.message}`);
	process.exitCode = 2;
}
