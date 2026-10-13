// The contact check over a capture folder. scripts/scrub-capture.mjs --check runs it, and the capture
// command runs it on its staged folder before the rename into examples/, so the two never judge a
// folder differently. Imported by the script under Node type stripping: erasable syntax only.

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { decodeCharacterReferences, isUnreadableCaptureFile } from './capture-files.ts';
import {
	SCRUB_PLACEHOLDER,
	findNoticeSpans,
	findTextSpans,
	isContactKey,
	type ScrubSpan
} from './scrub.ts';

interface CaptureCheck {
	files: number;
	dirty: string[];
	notText: string[];
	links: string[];
	special: string[];
}

type JsonVisit = (leaf: unknown, key: string) => unknown;

// Every entry but a folder, with the links and the special entries set apart. Git keeps a link as
// the path it points at, never the bytes behind it, and a checkout without link support writes that
// path as a text file, so a link is named and never read: the check judges only bytes a commit can
// hold. A named pipe, socket or device is no file git can hold either, and opening a pipe with no
// writer blocks for good, so it is named and never opened. Walked by hand, because a recursive
// readdirSync descends a junction and lists the files behind it. The capture test's detectors list
// a folder through this too, so the two never disagree on its files.
export function listCaptureEntries(dir: string): {
	files: string[];
	links: string[];
	special: string[];
} {
	const files: string[] = [];
	const links: string[] = [];
	const special: string[] = [];
	const walk = (folder: string) => {
		for (const name of readdirSync(folder)) {
			const path = join(folder, name);
			const entry = lstatSync(path);
			if (entry.isSymbolicLink()) links.push(path);
			else if (entry.isDirectory()) walk(path);
			else if (entry.isFile()) files.push(path);
			else special.push(path);
		}
	};
	walk(dir);
	return { files: files.sort(), links: links.sort(), special: special.sort() };
}

// A leaf is judged by the nearest contact key above it, however deep, because scrubJsonValue
// replaces everything under such a key; TED sends multilingual fields as objects keyed by language.
export function walkJson(value: unknown, visit: JsonVisit, key = ''): unknown {
	if (Array.isArray(value)) return value.map((item) => walkJson(item, visit, key));
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([inner, child]) => [
				inner,
				walkJson(child, visit, isContactKey(key) ? key : inner)
			])
		);
	}
	return visit(value, key);
}

const unscrubbedKinds = (text: string, spans: ScrubSpan[]): string[] =>
	spans
		.filter((span) => text.slice(span.start, span.end) !== SCRUB_PLACEHOLDER)
		.map((span) => span.kind);

// What a copy with its character references decoded still shows, named as encoded.
function encodedKinds(text: string): string[] {
	const decoded = decodeCharacterReferences(text);
	return decoded === text
		? []
		: unscrubbedKinds(decoded, findTextSpans(decoded)).map((kind) => `encoded ${kind}`);
}

function jsonLeftovers(value: unknown): string[] {
	const kinds: string[] = [];
	walkJson(value, (leaf, key) => {
		if (
			isContactKey(key) &&
			leaf !== null &&
			typeof leaf !== 'boolean' &&
			leaf !== SCRUB_PLACEHOLDER
		) {
			kinds.push('json-contact-key');
		} else if (typeof leaf === 'string') {
			kinds.push(...findTextSpans(leaf).map((span) => span.kind));
			kinds.push(...encodedKinds(leaf));
		}
		return leaf;
	});
	return kinds;
}

// JSON.parse decodes a JSON escape itself. XML and HTML write characters as references (&#64; is an
// at sign), which the scrub does not decode, so an address written that way is found in a decoded
// copy and named as encoded: the scrub itself would leave it in place.
function leftovers(path: string, text: string): string[] {
	if (path.endsWith('.json')) return jsonLeftovers(JSON.parse(text));
	const kinds = unscrubbedKinds(
		text,
		path.endsWith('.xml') ? findNoticeSpans(text) : findTextSpans(text)
	);
	return [...kinds, ...encodedKinds(text)];
}

// Puts the file's name on an error that would otherwise not say which file broke.
export function naming<T>(file: string, work: () => T): T {
	try {
		return work();
	} catch (error) {
		throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`, {
			cause: error
		});
	}
}

export function checkCaptureFolder(dir: string): CaptureCheck {
	const { files, links, special } = listCaptureEntries(dir);
	const dirty: string[] = [];
	// A PDF or an archive read as text shows no pattern anything, so it is named, never passed.
	const notText: string[] = [];
	for (const path of files) {
		const file = relative(dir, path);
		const bytes = naming(file, () => readFileSync(path));
		if (isUnreadableCaptureFile(path, bytes)) {
			notText.push(file);
			continue;
		}
		const kinds = naming(file, () => leftovers(path, bytes.toString('utf8')));
		if (kinds.length > 0) dirty.push(`${file}: ${[...new Set(kinds)].join(', ')}`);
	}
	return {
		files: files.length,
		dirty,
		notText,
		links: links.map((path) => relative(dir, path)),
		special: special.map((path) => relative(dir, path))
	};
}
