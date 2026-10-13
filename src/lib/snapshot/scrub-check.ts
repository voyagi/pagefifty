// The contact check over a capture folder. scripts/scrub-capture.mjs --check runs it, and the capture
// command runs it on its staged folder before the rename into examples/, so the two never judge a
// folder differently. Imported by the script under Node type stripping: erasable syntax only.

import { readdirSync, readFileSync } from 'node:fs';
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
}

type JsonVisit = (leaf: unknown, key: string) => unknown;

// Every entry but a folder. The records build reads a notice through a link, so a link is read
// through here too; one that points at nothing or at a folder fails its read and is named.
function listFiles(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => !entry.isDirectory())
		.map((entry) => join(entry.parentPath, entry.name))
		.sort();
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
	const files = listFiles(dir);
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
	return { files: files.length, dirty, notText };
}
