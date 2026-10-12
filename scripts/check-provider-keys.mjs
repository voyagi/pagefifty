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
// bundles those at deploy together with every package they import by name. A file given with
// --entry must sit inside a scanned folder, and every relative import reachable from it must
// resolve inside one too, so a folder list that misses part of the deployed code refuses to run
// instead of passing over it. A relative import resolves the way esbuild resolves it: the path
// itself, then the path with each implicit extension, then a folder's index file. Each package those
// files import by name is scanned whole from node_modules, with every installed package it lists as
// a dependency, a peer dependency or an optional one, and every installed package its JavaScript
// files import by name, listed or not: more than wrangler bundles, so no export condition decides
// what is read. A package's own node_modules is read only through a package found one of those ways.
//
// Usage:  node scripts/check-provider-keys.mjs DIR... [--entry FILE]... [--canary VALUE]...
// Exit codes: 0 no key name or canary value in any file,
//             1 a file holds one (one line per file and name found),
//             2 bad usage, a missing folder, a folder with no file, a file that could not be read,
//               an entry or one of its relative imports outside the scanned folders, or an import by
//               name in the build that is neither a builtin nor an installed package (nothing scanned
//               is never clean). Inside a package such an import is passed over: an optional require
//               in a try is common there, and a package that is not installed cannot be bundled.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const KEY_NAMES = ['NEBIUS_API_KEY', 'TAVILY_API_KEY'];

const isImportOrRequire = (callee) =>
	callee.kind === ts.SyntaxKind.ImportKeyword ||
	(ts.isIdentifier(callee) && callee.text === 'require');

// A full parse, so comments, strings and regular expressions never read as an import: the server
// build carries JSDoc types such as import('../../../utils/page_nodes.js'), and TypeScript's lighter
// import scanner (preProcessFile) misses export * as ns from and loses an import that follows a
// regular expression holding a backtick. Static imports, re-exports and import() or require() calls
// with a string argument count; a computed import() is passed over, as a bundler passes it over.
// TypeScript picks the parse from the file name: TS for .ts, .mts and .cts, TSX, JSX, JS for the
// rest. Parsed as JavaScript, a .ts type assertion reads as the start of a JSX element.
function importsOf(file, text) {
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
	const found = [];
	const visit = (node) => {
		const specifier =
			ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
				? node.moduleSpecifier
				: ts.isCallExpression(node) && isImportOrRequire(node.expression)
					? node.arguments[0]
					: undefined;
		if (specifier !== undefined && ts.isStringLiteralLike(specifier)) found.push(specifier.text);
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

const isRelative = (specifier) => specifier.startsWith('./') || specifier.startsWith('../');

// esbuild's default implicit extensions (its changelog, 0.9.0 and 0.20.0); wrangler sets no list of
// its own. .mjs and .cjs count only when an import names them.
const IMPLICIT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'];

// The files esbuild's js, jsx, ts and tsx loaders read, the only ones that import anything here. A
// declaration file is never bundled.
const isScriptFile = (file) =>
	/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) && !/\.d\.[cm]?ts$/.test(file);

// Inside a package only JavaScript is parsed for imports: its entry points and exports name
// JavaScript, and esbuild tries .js before .ts in node_modules. The TypeScript sources many packages
// ship beside their build import their own dev tooling, which esbuild never reaches from the build.
const isPackageScript = (file) => /\.(?:[cm]?js|jsx)$/.test(file);

function isFile(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

// The path itself, then with each implicit extension, then a folder's index file the same way.
function resolveRelative(target) {
	if (isFile(target)) return target;
	for (const base of [target, join(target, 'index')]) {
		const found = IMPLICIT_EXTENSIONS.map((extension) => base + extension).find(isFile);
		if (found !== undefined) return found;
	}
	return undefined;
}

// node:async_hooks and async_hooks are both Node's; cloudflare:workers and its siblings are the
// runtime's own.
const isRuntimeModule = (specifier) => isBuiltin(specifier) || specifier.startsWith('cloudflare:');

function packageName(specifier) {
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

// Node's lookup: the nearest node_modules folder holding the package, from the importer upward.
function packageFolder(from, name) {
	for (let dir = from; ; dir = dirname(dir)) {
		const candidate = join(dir, 'node_modules', name);
		if (existsSync(join(candidate, 'package.json'))) return candidate;
		if (dirname(dir) === dir) return undefined;
	}
}

const shownPath = (file) => relative(process.cwd(), file).replaceAll('\\', '/');

// Node names no file when the read meets a folder (EISDIR) and only a position when JSON fails.
function readNamed(file, decode = (bytes) => bytes) {
	try {
		return decode(readFileSync(file));
	} catch (error) {
		throw new Error(`${shownPath(file)} could not be read (${error.message})`);
	}
}

const asText = (bytes) => bytes.toString('utf8');

// A package imports its peers by name like its dependencies, and its optional dependencies when they
// are installed, so wrangler bundles whatever those imports resolve to. A listed package that is not
// installed anywhere above the package could not be bundled either.
const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

// A package's code can import an installed package that none of those fields lists, and esbuild
// bundles whatever the import resolves to, so each JavaScript file's imports by name count too,
// resolved from that file's folder. One that resolves to no installed package is passed over.
function importedPackages(folder) {
	const found = [];
	for (const file of filesUnder(folder, { skipNodeModules: true })) {
		if (!isPackageScript(file)) continue;
		for (const specifier of importsOf(file, readNamed(file, asText))) {
			if (isRelative(specifier) || isRuntimeModule(specifier)) continue;
			found.push(packageFolder(dirname(file), packageName(specifier)));
		}
	}
	return found;
}

function withDependencies(packages) {
	const found = new Set(packages);
	const queue = [...packages];
	while (queue.length > 0) {
		const folder = queue.pop();
		const manifest = readNamed(join(folder, 'package.json'), (bytes) => JSON.parse(asText(bytes)));
		const listed = new Set(DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})));
		const dependencies = [
			...[...listed].map((name) => packageFolder(folder, name)),
			...importedPackages(folder)
		];
		for (const dependency of dependencies) {
			if (dependency !== undefined && !found.has(dependency)) {
				found.add(dependency);
				queue.push(dependency);
			}
		}
	}
	return found;
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
// walk follows each relative import that resolves to a script file; a stylesheet, a JSON file or a
// path that resolves to nothing is not followed, and its bytes are scanned with its folder.
// Returns the folders of the packages those files import by name.
function entryPackages(entry, folders) {
	const start = resolve(entry);
	if (!existsSync(start)) throw new UsageError(`entry ${entry} is missing`);
	if (!insideAny(start, folders)) throw new UsageError(`entry ${entry} is outside the scanned folders`);
	const shown = (file) => (file === start ? `entry ${entry}` : shownPath(file));
	const packages = new Set();
	const seen = new Set([start]);
	const queue = [start];
	while (queue.length > 0) {
		const file = queue.pop();
		for (const specifier of importsOf(file, readNamed(file, asText))) {
			if (!isRelative(specifier)) {
				if (isRuntimeModule(specifier)) continue;
				const folder = packageFolder(dirname(file), packageName(specifier));
				if (folder === undefined) {
					throw new UsageError(
						`${shown(file)} imports ${specifier}, which is neither a builtin nor an installed package`
					);
				}
				packages.add(folder);
				continue;
			}
			const target = resolve(dirname(file), specifier);
			if (!insideAny(target, folders)) {
				throw new UsageError(`${shown(file)} imports ${specifier}, outside the scanned folders`);
			}
			const resolved = resolveRelative(target);
			if (resolved !== undefined && isScriptFile(resolved) && !seen.has(resolved)) {
				seen.add(resolved);
				queue.push(resolved);
			}
		}
	}
	return packages;
}

// A package's own node_modules holds other packages, read only when found as packages themselves.
function filesUnder(dir, { skipNodeModules = false } = {}) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (!entry.isDirectory()) return [path];
		return skipNodeModules && entry.name === 'node_modules' ? [] : filesUnder(path, { skipNodeModules });
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
	const imported = new Set(entries.flatMap((entry) => [...entryPackages(entry, folders)]));
	const packages = withDependencies(imported);
	const names = KEY_NAMES.map((label) => ({ label, needle: Buffer.from(label, 'ascii') }));
	const canaryBytes = canaries.map((value) => Buffer.from(value, 'utf8'));
	const targets = [
		...folders.flatMap((folder) =>
			folderFiles(folder).map((file) => [file, `${folder}/${relative(folder, file)}`.replaceAll('\\', '/')])
		),
		...[...packages].flatMap((folder) =>
			filesUnder(folder, { skipNodeModules: true }).map((file) => [file, shownPath(file)])
		)
	];
	const hits = [];
	for (const [file, shown] of targets) {
		for (const hit of hitsIn(readNamed(file), names, canaryBytes)) {
			hits.push(`provider-keys: ${shown}: ${hit}`);
		}
	}
	if (hits.length > 0) {
		for (const line of hits) console.log(line);
		return 1;
	}
	const inPackages = packages.size > 0 ? ` and ${packages.size} packages` : '';
	console.log(
		`provider-keys: scanned ${targets.length} files in ${folders.length} folders${inPackages}, no key name or canary value`
	);
	return 0;
}

try {
	process.exitCode = main(process.argv.slice(2));
} catch (error) {
	console.error(`provider-keys: ${error.message}`);
	process.exitCode = 2;
}
