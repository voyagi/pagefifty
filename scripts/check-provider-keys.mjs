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
// Usage:  node scripts/check-provider-keys.mjs DIR... [--canary VALUE]...
// Exit codes: 0 no key name or canary value in any file,
//             1 a file holds one (one line per file and name found),
//             2 bad usage, a missing folder, a folder with no file, or a file that could not be read
//               (nothing scanned is never clean).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const KEY_NAMES = ['NEBIUS_API_KEY', 'TAVILY_API_KEY'];

class UsageError extends Error {}

function parseArgs(argv) {
	const folders = [];
	const canaries = [];
	for (let at = 0; at < argv.length; at++) {
		const arg = argv[at];
		if (arg === '--canary') {
			const value = argv[at + 1];
			if (value === undefined || value === '') throw new UsageError('--canary needs a non-empty value');
			canaries.push(value);
			at++;
		} else if (arg.startsWith('--')) {
			throw new UsageError(`unknown option ${arg}`);
		} else {
			folders.push(arg);
		}
	}
	if (folders.length === 0) {
		throw new UsageError('usage: node scripts/check-provider-keys.mjs DIR... [--canary VALUE]...');
	}
	return { folders, canaries };
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
	const { folders, canaries } = parseArgs(argv);
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
