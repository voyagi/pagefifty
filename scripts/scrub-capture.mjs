#!/usr/bin/env node
// scrub-capture.mjs - copy a TED capture into a tracked folder with personal contact data removed,
// and prove a folder holds none.
//
// A capture that is committed stays in git history, so contact names, email addresses and
// telephone and fax numbers are replaced before the first commit that tracks the files, never
// after. The scrub itself lives in src/lib/snapshot/scrub.ts and the folder check in
// src/lib/snapshot/scrub-check.ts, imported here under Node's type stripping, so the script, the
// capture command and the tests run exactly the same code.
//
// Usage:
//   node scripts/scrub-capture.mjs --from <capture dir> --to <dir>
//       copies notices.json, fetch-log.json and xml/*.xml through the scrub, then checks the copy
//       as --check does and exits 1 when anything is left
//   node scripts/scrub-capture.mjs --check <dir> [--against <capture dir>]
//       lists every file under <dir> that still holds contact data, every link, which it never
//       reads because git keeps a link and not what it points at, and every entry that is not a
//       regular file (a pipe, a socket, a device), which git cannot keep and it never opens; with
//       --against, also proves that the scrub changed nothing else and prints how many spans of
//       each kind it replaced
//
// --against removes every span the scrub may replace from the source, and every placeholder from
// the copy, then requires the two remainders to be identical after CRLF becomes LF and one final
// newline is dropped. XML is compared as text. JSON is compared value by value, both sides written
// in the same two-space form, because the copy is re-serialized rather than edited in place.
//
// A non-empty file that is not text (a PDF, a ZIP) is named rather than read: no pattern sees
// inside it, so it goes into a capture only as extracted, scrubbed text.
//
// Exit codes: 0 clean, 1 contact data, a file that is not text, a link, an entry that is not a
// regular file or an unexpected difference found (or a usage error),
// 2 nothing was checked: the folder holds no files, or a folder or file could not be read or parsed.

import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { checkCaptureFolder, naming, walkJson } from '../src/lib/snapshot/scrub-check.ts';
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
// before leaves such a file in place, and a person who commits the folder commits it too. An xml
// entry the check refused is never listed, since listing it would follow the refused link.
function filesNotInSource(dir, sourceXmlNames, isRefused = () => false) {
	const expected = new Set(sourceXmlNames);
	const xml = existsSync(join(dir, 'xml')) && !isRefused('xml')
		? xmlNames(dir)
				.filter((name) => !expected.has(name))
				.map((name) => join('xml', name))
		: [];
	const json = readdirSync(dir).filter((name) => name.endsWith('.json') && !JSON_FILES.includes(name));
	return [...xml, ...json];
}

function isLink(path) {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
	}
}

// A link inside the copy (xml/ or one file pointing back into the source) would write the scrub
// through it onto the source, which the folder check above cannot see. Every path the copy writes
// is refused when it is a link, before anything is written.
function linkedTargets(to, names) {
	const targets = [join(to, 'xml'), ...JSON_FILES.map((name) => join(to, name)), ...names.map((name) => join(to, 'xml', name))];
	return targets.filter(isLink);
}

// A file already in the copy may share its content with the source (a hard link looks like any
// other file), so it is never written into: its entry is removed, which leaves the source's content
// alone whatever kind of link the entry was, and a new file is created that refuses to overwrite.
function writeFresh(path, text) {
	rmSync(path, { force: true });
	writeFileSync(path, text, { flag: 'wx' });
}

function copyScrubbed(from, to) {
	const linked = linkedTargets(to, xmlNames(from));
	if (linked.length > 0) {
		for (const path of linked) console.error(`${path}: a link, so the copy would write through it; nothing was written`);
		return null;
	}
	mkdirSync(join(to, 'xml'), { recursive: true });
	for (const name of JSON_FILES) {
		const value = JSON.parse(readFileSync(join(from, name), 'utf8'));
		writeFresh(join(to, name), `${JSON.stringify(scrubJsonValue(value), null, 2)}\n`);
	}
	const names = xmlNames(from);
	for (const name of names) {
		writeFresh(join(to, 'xml', name), scrubNoticeXml(readFileSync(join(from, 'xml', name), 'utf8')));
	}
	console.log(`scrubbed ${names.length} notices and ${JSON_FILES.length} JSON files into ${to}`);
	const extras = filesNotInSource(to, names);
	for (const file of extras) {
		console.error(`${file}: in ${to} but not in the source capture, so it may be stale; remove it or copy into a fresh folder`);
	}
	return extras.length;
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

// The check has already named every refused entry, and reading one here would read through the link
// it refused (or block on a pipe), so a file at or under a refused path is never listed or compared.
function compareAgainst(dir, against, refused) {
	const counts = {};
	const sourceXml = xmlNames(against);
	const isRefused = (file) => refused.some((entry) => file === entry || file.startsWith(`${entry}${sep}`));
	const problems = filesNotInSource(dir, sourceXml, isRefused).map((file) => `${file}: not in the source capture`);
	const expected = [...JSON_FILES, ...sourceXml.map((name) => join('xml', name))].filter((file) => !isRefused(file));
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
	const { files, dirty, notText, links, special } = checkCaptureFolder(dir);
	for (const line of links) console.error(`a link, not a file, so git would keep the link and not what it points at: ${line}`);
	for (const line of special) console.error(`not a regular file, so git cannot keep it: ${line}`);
	if (files === 0 && links.length === 0 && special.length === 0) {
		console.error(`no files under ${dir}`);
		return 2;
	}
	for (const line of dirty) console.error(`contact data: ${line}`);
	for (const line of notText) console.error(`not text, so no pattern can read it: ${line}`);
	console.log(`checked ${files} files under ${dir}, ${dirty.length} with contact data, ${notText.length} not text, ${links.length} links refused, ${special.length} not regular files`);
	const found = dirty.length + notText.length + links.length + special.length;
	if (!against) return found > 0 ? 1 : 0;

	const { counts, problems, compared } = compareAgainst(dir, against, [...links, ...special]);
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
		if (stale === null) return 1;
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
