#!/usr/bin/env node
// scrub-capture.mjs - copy a TED capture into a tracked folder with personal contact data removed,
// and prove a folder holds none.
//
// A capture that is committed stays in git history, so contact names, email addresses and
// telephone and fax numbers are replaced before the first commit that tracks the files, never
// after. The scrub itself lives in src/lib/snapshot/scrub.ts, imported here under Node's type
// stripping, so the script and the tests run exactly the same code.
//
// Usage:
//   node scripts/scrub-capture.mjs --from <capture dir> --to <dir>
//       copies notices.json, fetch-log.json and xml/*.xml through the scrub, then checks the copy
//       as --check does and exits 1 when anything is left
//   node scripts/scrub-capture.mjs --check <dir> [--against <capture dir>]
//       lists every file under <dir> that still holds contact data; with --against, also proves
//       that the scrub changed nothing else and prints how many spans of each kind it replaced
//
// --against removes every span the scrub may replace from the source, and every placeholder from
// the copy, then requires the two remainders to be identical after CRLF becomes LF and one final
// newline is dropped. XML is compared as text. JSON is compared value by value, both sides written
// in the same two-space form, because the copy is re-serialized rather than edited in place.
//
// A non-empty file that is not text (a PDF, a ZIP) is named rather than read: no pattern sees
// inside it, so it goes into a capture only as extracted, scrubbed text.
//
// Exit codes: 0 clean, 1 contact data, a file that is not text or an unexpected difference found
// (or a usage error),
// 2 nothing was checked: the folder holds no files, or a folder or file could not be read or parsed.

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { decodeCharacterReferences, isUnreadableCaptureFile } from '../src/lib/snapshot/capture-files.ts';
import {
	SCRUB_PLACEHOLDER,
	findNoticeSpans,
	findTextSpans,
	isContactKey,
	replaceSpans,
	scrubJsonValue,
	scrubNoticeXml
} from '../src/lib/snapshot/scrub.ts';

const JSON_FILES = ['notices.json', 'fetch-log.json'];

function parseArgs(argv) {
	const args = {};
	for (let index = 0; index < argv.length; index += 2) {
		const flag = argv[index];
		if (!['--from', '--to', '--check', '--against'].includes(flag)) throw new Error(`unknown argument ${flag}`);
		const value = argv[index + 1];
		if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a folder after it`);
		args[flag.slice(2)] = value;
	}
	return args;
}

function xmlNames(dir) {
	return readdirSync(join(dir, 'xml'))
		.filter((name) => name.endsWith('.xml'))
		.sort();
}

// The source capture is the only unscrubbed copy, and a later scrub fix is applied from it again, so
// the copy may never land on the source or inside it, nor the source inside the copy. Paths are
// compared after links are followed, so a junction or symlink that points into the source is caught.
// The copy's folder may not exist yet: its nearest existing ancestor is followed and the rest kept.
function realPath(path) {
	const missing = [];
	let current = resolve(path);
	while (!existsSync(current)) {
		const parent = dirname(current);
		if (parent === current) break;
		missing.unshift(basename(current));
		current = parent;
	}
	return join(existsSync(current) ? realpathSync.native(current) : current, ...missing);
}

function overlapProblem(from, to) {
	const fold = (path) => (process.platform === 'win32' ? realPath(path).toLowerCase() : realPath(path));
	const source = fold(from);
	const copy = fold(to);
	if (source === copy) return `--to ${to} would overwrite its source ${from}`;
	const holds = (outer, inner) => {
		const path = relative(outer, inner);
		// Only ".." itself or "../x" climbs out; a child folder may be named "..copy".
		return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
	};
	return holds(source, copy) || holds(copy, source) ? `--from ${from} and --to ${to}: one folder holds the other` : null;
}

// Notices and JSON files a capture folder holds that its source does not. A copy into a folder used
// before leaves such a file in place, and a person who commits the folder commits it too.
function filesNotInSource(dir, sourceXmlNames) {
	const expected = new Set(sourceXmlNames);
	const xml = existsSync(join(dir, 'xml'))
		? xmlNames(dir)
				.filter((name) => !expected.has(name))
				.map((name) => join('xml', name))
		: [];
	const json = readdirSync(dir).filter((name) => name.endsWith('.json') && !JSON_FILES.includes(name));
	return [...xml, ...json];
}

function copyScrubbed(from, to) {
	mkdirSync(join(to, 'xml'), { recursive: true });
	for (const name of JSON_FILES) {
		const value = JSON.parse(readFileSync(join(from, name), 'utf8'));
		writeFileSync(join(to, name), `${JSON.stringify(scrubJsonValue(value), null, 2)}\n`);
	}
	const names = xmlNames(from);
	for (const name of names) {
		writeFileSync(join(to, 'xml', name), scrubNoticeXml(readFileSync(join(from, 'xml', name), 'utf8')));
	}
	console.log(`scrubbed ${names.length} notices and ${JSON_FILES.length} JSON files into ${to}`);
	const extras = filesNotInSource(to, names);
	for (const file of extras) {
		console.error(`${file}: in ${to} but not in the source capture, so it may be stale; remove it or copy into a fresh folder`);
	}
	return extras.length;
}

function listFiles(dir) {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name))
		.sort();
}

// A leaf is judged by the nearest contact key above it, however deep, because scrubJsonValue
// replaces everything under such a key; TED sends multilingual fields as objects keyed by language.
function walkJson(value, visit, key = '') {
	if (Array.isArray(value)) return value.map((item) => walkJson(item, visit, key));
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([inner, child]) => [inner, walkJson(child, visit, isContactKey(key) ? key : inner)])
		);
	}
	return visit(value, key);
}

function jsonLeftovers(value) {
	const kinds = [];
	walkJson(value, (leaf, key) => {
		if (isContactKey(key) && leaf !== null && typeof leaf !== 'boolean' && leaf !== SCRUB_PLACEHOLDER) {
			kinds.push('json-contact-key');
		} else if (typeof leaf === 'string') {
			kinds.push(...findTextSpans(leaf).map((span) => span.kind));
			kinds.push(...encodedKinds(leaf));
		}
		return leaf;
	});
	return kinds;
}

const unscrubbedKinds = (text, spans) =>
	spans.filter((span) => text.slice(span.start, span.end) !== SCRUB_PLACEHOLDER).map((span) => span.kind);

// What a copy with its character references decoded still shows, named as encoded.
function encodedKinds(text) {
	const decoded = decodeCharacterReferences(text);
	return decoded === text ? [] : unscrubbedKinds(decoded, findTextSpans(decoded)).map((kind) => `encoded ${kind}`);
}

// JSON.parse decodes a JSON escape itself. XML and HTML write characters as references (&#64; is an
// at sign), which the scrub does not decode, so an address written that way is found in a decoded
// copy and named as encoded: the scrub itself would leave it in place.
function leftovers(path, text) {
	if (path.endsWith('.json')) return jsonLeftovers(JSON.parse(text));
	const kinds = unscrubbedKinds(text, path.endsWith('.xml') ? findNoticeSpans(text) : findTextSpans(text));
	return [...kinds, ...encodedKinds(text)];
}

// Puts the file's name on an error that would otherwise not say which file broke.
function naming(file, work) {
	try {
		return work();
	} catch (error) {
		throw new Error(`${file}: ${error.message}`);
	}
}

const normalize = (text) => text.replace(/\r\n/g, '\n').replace(/\n$/, '');
const dropPlaceholders = (text) => text.split(SCRUB_PLACEHOLDER).join('');

function countKinds(counts, spans) {
	for (const span of spans) counts[span.kind] = (counts[span.kind] ?? 0) + 1;
}

function xmlRemainders(source, copy, counts) {
	const spans = findNoticeSpans(source);
	countKinds(counts, spans);
	return [replaceSpans(source, spans, ''), dropPlaceholders(copy)];
}

function jsonRemainders(source, copy, counts) {
	const reducedSource = walkJson(JSON.parse(source), (leaf, key) => {
		if (isContactKey(key) && leaf !== null && typeof leaf !== 'boolean') {
			counts['json-contact-key'] = (counts['json-contact-key'] ?? 0) + 1;
			return '';
		}
		if (typeof leaf !== 'string') return leaf;
		const spans = findTextSpans(leaf);
		countKinds(counts, spans);
		return replaceSpans(leaf, spans, '');
	});
	const reducedCopy = walkJson(JSON.parse(copy), (leaf) => (typeof leaf === 'string' ? dropPlaceholders(leaf) : leaf));
	return [JSON.stringify(reducedSource, null, 2), JSON.stringify(reducedCopy, null, 2)];
}

function compareAgainst(dir, against) {
	const counts = {};
	const sourceXml = xmlNames(against);
	const problems = filesNotInSource(dir, sourceXml).map((file) => `${file}: not in the source capture`);
	const expected = [...JSON_FILES, ...sourceXml.map((name) => join('xml', name))];
	for (const file of expected) {
		let copy;
		try {
			copy = normalize(readFileSync(join(dir, file), 'utf8'));
		} catch {
			problems.push(`${file}: missing from the scrubbed copy`);
			continue;
		}
		const [left, right] = naming(file, () => {
			const source = normalize(readFileSync(join(against, file), 'utf8'));
			return file.endsWith('.json') ? jsonRemainders(source, copy, counts) : xmlRemainders(source, copy, counts);
		});
		if (left !== right) problems.push(`${file}: differs from the source outside the scrubbed spans`);
	}
	return { counts, problems, compared: expected.length };
}

function check(dir, against) {
	const files = listFiles(dir);
	if (files.length === 0) {
		console.error(`no files under ${dir}`);
		return 2;
	}
	const dirty = [];
	// A PDF or an archive read as text shows no pattern anything, so it is named, never passed.
	const notText = [];
	for (const path of files) {
		const bytes = readFileSync(path);
		if (isUnreadableCaptureFile(path, bytes)) {
			notText.push(relative(dir, path));
			continue;
		}
		const kinds = naming(relative(dir, path), () => leftovers(path, bytes.toString('utf8')));
		if (kinds.length > 0) dirty.push(`${relative(dir, path)}: ${[...new Set(kinds)].join(', ')}`);
	}
	for (const line of dirty) console.error(`contact data: ${line}`);
	for (const line of notText) console.error(`not text, so no pattern can read it: ${line}`);
	console.log(
		`checked ${files.length} files under ${dir}, ${dirty.length} with contact data, ${notText.length} not text`
	);
	const found = dirty.length + notText.length;
	if (!against) return found > 0 ? 1 : 0;

	const { counts, problems, compared } = compareAgainst(dir, against);
	for (const line of problems) console.error(line);
	console.log(`compared ${compared} files against ${against}, ${problems.length} unexpected differences`);
	for (const kind of Object.keys(counts).sort()) console.log(`replaced ${kind}: ${counts[kind]}`);
	return found > 0 || problems.length > 0 ? 1 : 0;
}

function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (error) {
		console.error(`${error.message}\nusage: --from <dir> --to <dir> | --check <dir> [--against <dir>]`);
		return 1;
	}
	if (!args.check && !(args.from && args.to)) {
		console.error('usage: --from <dir> --to <dir> | --check <dir> [--against <dir>]');
		return 1;
	}
	const overlap = args.check ? null : overlapProblem(args.from, args.to);
	if (overlap) {
		console.error(overlap);
		return 1;
	}
	// A folder or file that cannot be read means nothing was checked, which is never a finding.
	try {
		if (args.check) return check(args.check, args.against);
		const stale = copyScrubbed(args.from, args.to);
		// The scrub leaves what it cannot see (an address written with a character reference), so
		// the copy is checked before it is called clean: a copy is never trusted without its check.
		const checked = check(args.to);
		return stale > 0 || checked !== 0 ? 1 : 0;
	} catch (error) {
		console.error(`scrub-capture: ${error.message}`);
		return 2;
	}
}

process.exitCode = main();
