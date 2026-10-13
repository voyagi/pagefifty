// The capture test's own contact detectors, shared with the capture command's tests so a folder the
// command writes goes through exactly the checks the tracked captures pass.
import { readdirSync, readFileSync } from 'node:fs';
import {
	decodeCharacterReferences,
	isCaptureText,
	isUnreadableCaptureFile
} from '../lib/snapshot/capture-files.ts';
import { listCaptureEntries, naming } from '../lib/snapshot/scrub-check.ts';
import { EMAIL_PATTERN, SCRUB_PLACEHOLDER } from '../lib/snapshot/scrub.ts';

export { isCaptureText };

// Every folder under examples is a dated capture and is scanned whole, whatever it holds, so a
// later capture cannot be committed unchecked.
export function captureFolders(root: string): string[] {
	return readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => `${root}/${entry.name}`)
		.sort();
}

// Every regular file, listed by the capture check's own walk. Git keeps a link as the path it
// points at, never the bytes behind it, and holds no pipe, socket or device at all, so neither is
// ever read: captureLinks and captureSpecial list them and folderProblems names them.
export function captureFiles(capture: string): string[] {
	return listCaptureEntries(capture).files;
}

export function captureLinks(capture: string): string[] {
	return listCaptureEntries(capture).links;
}

export function captureSpecial(capture: string): string[] {
	return listCaptureEntries(capture).special;
}

const CONTACT_ELEMENTS = ['cbc:ElectronicMail', 'cbc:Telephone', 'cbc:Telefax'] as const;

// Written apart from scrub.ts on purpose: a check built from the scrub's own patterns would share
// its blind spots. Elements are found by their opening tag and read up to the next tag, so a
// comment or any other markup between tags cannot hide one.
function openTags(text: string, tag: string, from = 0, to = text.length): number[] {
	const found: number[] = [];
	for (
		let at = text.indexOf(`<${tag}`, from);
		at >= 0 && at < to;
		at = text.indexOf(`<${tag}`, at + 1)
	) {
		const next = text[at + tag.length + 1];
		if (next === '>' || next === ' ' || next === '\t' || next === '\r' || next === '\n')
			found.push(at);
	}
	return found;
}

// A block that never closes runs to the end of the text, so what it holds is still read.
function closeOf(text: string, tag: string, from: number): number {
	const end = text.indexOf(tag, from);
	return end < 0 ? text.length : end;
}

function elementText(text: string, at: number): string {
	const open = text.indexOf('>', at);
	return text.slice(open + 1, text.indexOf('<', open));
}

interface ElementCensus {
	checked: Record<string, number>;
	unscrubbed: string[];
}

export function censusElements(text: string): ElementCensus {
	const checked: Record<string, number> = {};
	const unscrubbed: string[] = [];
	const visit = (tag: string, at: number) => {
		checked[tag] = (checked[tag] ?? 0) + 1;
		if (elementText(text, at) !== SCRUB_PLACEHOLDER) unscrubbed.push(`${tag} at ${at}`);
	};
	for (const tag of CONTACT_ELEMENTS) for (const at of openTags(text, tag)) visit(tag, at);
	for (const block of openTags(text, 'cac:Contact')) {
		const end = closeOf(text, '</cac:Contact>', block);
		for (const at of openTags(text, 'cbc:Name', block, end)) visit('contact cbc:Name', at);
	}
	for (const block of openTags(text, 'efac:TouchPoint')) {
		const end = closeOf(text, '</efac:TouchPoint>', block);
		for (const at of openTags(text, 'cbc:Name', block, end)) visit('touchpoint cbc:Name', at);
	}
	return { checked, unscrubbed };
}

// A number word may sit between the keyword and the number ("Tel.-Nr.", "Telefonnummer").
// Belgian notices in French write Tél.
const PHONE_AFTER_KEYWORD =
	/(?<!\p{L})(?:telefon|telefoon|telefax|t\p{L}l\p{L}phone|phone|fax|fon|rufnummer|t[eé]l|mobil|mobile|mobiel|handy|gsm|[tf]\s?:)(?:nummer|nr)?(?:[\s.-]{0,3}(?:nr|nummer|number|no)[.]?)?[\s.:]{0,4}[+(]?[0-9][0-9\s()/.-]{4,}/iu;
const PLUS_NUMBER = /\+\s?[1-9][0-9](?:[\s()/.-]{0,2}[0-9]){6,}/;
const ASCII_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}/;
const BRACKETED_AT_EMAIL = /[A-Za-z0-9._%+-]+ ?[([{]at[)\]}] ?[A-Za-z0-9.-]+[.][A-Za-z]{2,}/i;
// The scrub finds a name in free text only right before its own address. A form of address
// followed by a capitalised word or an initial is a name written anywhere else ("Frau Beispiel",
// "de heer J. Voorbeeld"). Measured 2026-09-25: 0 in the tracked 2026-09-15 capture, 4 in its
// unscrubbed source, all four gone after the scrub.
const NAME_AFTER_ADDRESS_FORM =
	/(?<![\p{L}\p{N}])(?:Frau|Herrn?|Hr\.|Fr\.|[Mm]evrouw|[Mm]evr\.|[Mm]w\.|[Mm]eneer|[Mm]ijnheer|[Dd]hr\.|[Dd]e heer|[Mm]adame|[Mm]onsieur|Mme\.?|Mlle\.?|Mrs?\.?|Ms\.?|Miss)(?:\s+(?:Dr\.|Prof\.|dr\.|ir\.|mr\.|drs\.|ing\.|Dipl\.-\p{L}+\.?)){0,3}\s+\p{Lu}(?:[\p{L}'’-]+|\.)/u;

// Criterion text is what the product quotes, so the scrub must never have touched it. Blocks are
// found by their opening tag, attributes or not, and read to their close as contact blocks are.
export function criterionCensus(text: string): { criteria: number; touched: number } {
	const blocks = openTags(text, 'efac:SelectionCriteria');
	const touched = blocks.filter((at) =>
		text.slice(at, closeOf(text, '</efac:SelectionCriteria>', at)).includes(SCRUB_PLACEHOLDER)
	);
	return { criteria: blocks.length, touched: touched.length };
}

export function contactStrings(text: string): string[] {
	return [
		EMAIL_PATTERN,
		ASCII_EMAIL,
		BRACKETED_AT_EMAIL,
		PHONE_AFTER_KEYWORD,
		PLUS_NUMBER,
		NAME_AFTER_ADDRESS_FORM
	].flatMap((pattern) => {
		const match = pattern.exec(text);
		return match ? [match[0]] : [];
	});
}

// Every contact check of a whole file goes through here. A character can hide behind an escape, an
// XML character reference (&#64; is an at sign) or a JSON unicode escape (@), so each file is
// read as written and again decoded: an escaped address or number is found as surely as a plain one.
export function contactStringsInFile(path: string, text: string): string[] {
	const unescaped = path.endsWith('.json')
		? naming(path, () => JSON.stringify(JSON.parse(text), null, 2))
		: text;
	const decoded = decodeCharacterReferences(unescaped);
	return [...new Set([...contactStrings(text), ...contactStrings(decoded)])];
}

export function unreadableFiles(capture: string): string[] {
	return captureFiles(capture)
		.filter((path) => isUnreadableCaptureFile(path, readFileSync(path)))
		.map((path) => `${path}: not text, so no pattern can read it`);
}

export function contactOffenders(capture: string): string[] {
	const offenders: string[] = [];
	for (const path of captureFiles(capture).filter(isCaptureText)) {
		const found = contactStringsInFile(path, readFileSync(path, 'utf8'));
		if (found.length > 0) offenders.push(`${path}: ${found.join(' | ')}`);
	}
	return offenders;
}

export function unscrubbedElements(capture: string): string[] {
	return captureFiles(capture)
		.filter((path) => path.endsWith('.xml'))
		.flatMap((path) =>
			censusElements(readFileSync(path, 'utf8')).unscrubbed.map((where) => `${path} ${where}`)
		);
}

export function touchedCriteria(capture: string): string[] {
	return captureFiles(capture)
		.filter((path) => path.endsWith('.xml'))
		.filter((path) => criterionCensus(readFileSync(path, 'utf8')).touched > 0)
		.map((path) => `${path}: a selection criterion holds the placeholder`);
}

// A folder with no file passes every check above, so it is named: scrub-capture.mjs --check exits 2
// on the same folder.
export function folderProblems(folder: string): string[] {
	const empty = captureFiles(folder).length === 0;
	return [
		...(empty ? [`${folder}: no files, so nothing was checked`] : []),
		...captureLinks(folder).map((path) => `${path}: a link, not a file`),
		...captureSpecial(folder).map((path) => `${path}: not a regular file`),
		...unreadableFiles(folder),
		...contactOffenders(folder),
		...unscrubbedElements(folder),
		...touchedCriteria(folder)
	];
}
