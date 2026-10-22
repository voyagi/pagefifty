// How a buyer's published words are drawn for reading. Clauses are often pasted from a PDF, so they
// keep its hard line breaks: a word split at a line end with a hyphen ("Zertifizie-" then "rung"),
// and lines that stop wherever the page ran out. Nothing here changes a character. Every character
// of the text lands in exactly one run, in order, so the page's text stays the published text byte
// for byte; a run only says how its characters are drawn.
//
// text      drawn as written; a single line break inside it reads as a space
// hidden    kept in the page's text but not drawn: the hyphen and break of a word split at a line
//           end, or the break after a hyphen that belongs to the word ("27001-" then "Zertifizierung")
// line      a line break kept as one: before a list item ("a)", "-", "1."), or after a block's
//           heading line ("Mindestanforderung" over the sentence it heads)
// paragraph a blank line, kept as a paragraph break

import { quoteLocator } from '../core/quote';

type RunKind = 'text' | 'hidden' | 'line' | 'paragraph';

export interface TextRun {
	kind: RunKind;
	text: string;
	start: number;
	end: number;
}

// A hyphen right at a line end, the break, any blank lines after it and the next line's indent.
const BREAK = /(-)?\r?\n(?:[^\S\n]*\n)*[^\S\n]*/gu;
const LETTER = /\p{L}/u;
const LOWER = /\p{Ll}/u;
const WORD = /[\p{L}\p{N}]/u;
// A list item: a hyphen, an en dash or a bullet, "1." or "1)", or "a)", then a space. The dash and
// bullets are written as code points so the source holds no look-alike of a hyphen.
const BULLETS = [0x2013, 0x2022, 0x25aa, 0x25e6]
	.map((point) => String.fromCodePoint(point))
	.join('');
const MARKER = String.raw`(?:[-${BULLETS}*]|\d{1,2}[.)]|\p{Ll}\))\s`;
const LIST_ITEM = new RegExp(`^${MARKER}`, 'u');

// A buyer often heads a block with a short line of its own ("Mindestanforderung", then the
// sentence). A block is the text between blank lines, or the whole text. Its first line reads as a
// heading when it is at most HEADING_MAX characters long, does not end in punctuation that closes or
// carries on a sentence, and the next line does not go on in lower case, as a wrapped sentence does
// ("Auszug" over "aus dem Handelsregister").
//
// 25, from the example capture of 2026-09-15: of the block first lines a single break ends there,
// every one of 25 characters or fewer is a heading or a one-line entry ("Referenzzeitraum", "Keine
// schwere Verfehlung", "Preis: 30 %"), and the shortest first line of a wrapped sentence is 26 ("Der
// Umsatz muss mindestens" over "2.500.000,00 EUR pro Jahr"). Past 25 the two overlap, so a longer
// heading ("Funktionstest der Neugeräte") still reads on into its sentence.
const HEADING_MAX = 25;
// The en dash, the em dash and the ellipsis, written as code points like BULLETS above.
const CLOSERS = [0x2013, 0x2014, 0x2026].map((point) => String.fromCodePoint(point)).join('');
const CARRIES_ON = new RegExp(`[-.,;:!?${CLOSERS}]$`, 'u');

function isHeading(line: string, next: string): boolean {
	return (
		line !== '' && [...line].length <= HEADING_MAX && !CARRIES_ON.test(line) && !LOWER.test(next)
	);
}

function push(runs: TextRun[], kind: RunKind, text: string, start: number) {
	if (text === '') return;
	const last = runs.at(-1);
	if (kind === 'text' && last?.kind === 'text') {
		last.text += text;
		last.end += text.length;
		return;
	}
	runs.push({ kind, text, start, end: start + text.length });
}

function breakKind(text: string, end: number, breaks: number, heading: boolean): RunKind {
	if (breaks > 1) return 'paragraph';
	return heading || LIST_ITEM.test(text.slice(end)) ? 'line' : 'text';
}

export function displayRuns(text: string): TextRun[] {
	const runs: TextRun[] = [];
	let at = 0;
	// Where the current block began, while its first line has not yet ended; -1 after that.
	let block = 0;
	for (const match of text.matchAll(BREAK)) {
		const start = match.index;
		const end = start + match[0].length;
		push(runs, 'text', text.slice(at, start), at);
		const before = text.charAt(start - 1);
		const after = text.charAt(end);
		const breaks = match[0].split('\n').length - 1;
		const hyphen = match[1] !== undefined;
		if (hyphen && breaks === 1 && LETTER.test(before) && LOWER.test(after)) {
			// A word split across two lines: drawn whole, and the browser hyphenates it where it must.
			push(runs, 'hidden', match[0], start);
		} else if (hyphen && breaks === 1 && WORD.test(before) && WORD.test(after)) {
			// The hyphen is part of the word ("ISO/IEC-27001-Zertifizierungen"), the break is not.
			push(runs, 'text', '-', start);
			push(runs, 'hidden', match[0].slice(1), start + 1);
		} else {
			const rest = hyphen ? 1 : 0;
			if (hyphen) push(runs, 'text', '-', start);
			const heading = block >= 0 && isHeading(text.slice(block, start + rest).trim(), after);
			push(runs, breakKind(text, end, breaks, heading), match[0].slice(rest), start + rest);
		}
		block = breaks > 1 ? end : -1;
		at = end;
	}
	push(runs, 'text', text.slice(at), at);
	return runs;
}

// The runs that fall inside [start, end), cut at its edges. A cut break keeps its line or paragraph
// only where the cut piece still holds the break's last character.
export function runsBetween(runs: readonly TextRun[], start: number, end: number): TextRun[] {
	return runs.flatMap((run) => {
		const from = Math.max(run.start, start);
		const to = Math.min(run.end, end);
		if (from >= to) return [];
		const whole = to === run.end;
		const kind = !whole && (run.kind === 'line' || run.kind === 'paragraph') ? 'text' : run.kind;
		return [{ kind, text: run.text.slice(from - run.start, to - run.start), start: from, end: to }];
	});
}

// Word pastes its Symbol-font bullets as private-use code points U+F0A7 and U+F0D8, which no font
// draws, so the reader would see empty boxes. Display only: the record keeps the published text.
const SYMBOL_BULLETS = /[\u{F0A7}\u{F0D8}]/gu;
const BULLET = String.fromCodePoint(0x2022);

// A description as its quote block draws it. Each bullet is one UTF-16 unit, as is its stand-in, so
// a place in the drawn text is the published place less the trimmed indent.
export function shownText(text: string): string {
	return text.trim().replace(SYMBOL_BULLETS, BULLET);
}

// A verified quote to set apart inside its clause: n numbers it against its reading shown beside the
// clause, and decides marks the words the verdict rests on. at is where in the drawn text the mark
// sits, given for a piece of a quote that runs on into the next description (criterionMarks).
export interface QuoteMark {
	quote: string;
	n?: number;
	decides?: boolean;
	at?: { start: number; end: number };
}

// Each quote is looked for exactly as code checked it against the clause (core/quote.ts), so a quote
// that verified is found. Quotes on the same words, or on overlapping words, share one span that
// lists each of their indexes, so every reading keeps the place its quote sits and the text itself
// is never cut or repeated.
export function findQuotes(
	text: string,
	quotes: readonly string[]
): { start: number; end: number; indexes: number[] }[] {
	return placeMarks(
		text,
		quotes.map((quote) => ({ quote }))
	);
}

// The marks of one text at their places, sharing spans as findQuotes does: a mark that carries its
// place keeps it, and every other one is looked for by its quote.
export function placeMarks(
	text: string,
	marks: readonly QuoteMark[]
): { start: number; end: number; indexes: number[] }[] {
	const locate = quoteLocator(text);
	const found = marks.flatMap((mark, index) => {
		const span = mark.at ?? locate(mark.quote);
		return span === undefined ? [] : [{ ...span, index }];
	});
	found.sort((a, b) => a.start - b.start || a.index - b.index);
	const kept: { start: number; end: number; indexes: number[] }[] = [];
	for (const { start, end, index } of found) {
		const last = kept.at(-1);
		if (last !== undefined && start < last.end) {
			last.end = Math.max(last.end, end);
			last.indexes.push(index);
		} else {
			kept.push({ start, end, indexes: [index] });
		}
	}
	return kept;
}

// The marks of one criterion's quote blocks, one list per description, each requirement numbered as
// its reading is. A requirement is marked in each description of its language, where the block
// looks for it. Code checks a quote against the descriptions joined (criterionText), so one may be
// found only across two of them (core/lot-reading.ts keeps it): that one is located in the joined
// drawn text and cut at each description's edges, every piece placed in its own block and the
// reading's number on the first.
export function criterionMarks(
	descriptions: readonly { text: string; lang?: string }[],
	requirements: readonly { quote: string; lang?: string }[],
	decides: readonly number[]
): QuoteMark[][] {
	const shown = descriptions.map((description) => shownText(description.text));
	const alone = shown.map((text) => quoteLocator(text));
	const joined = quoteLocator(shown.join('\n'));
	const marks: QuoteMark[][] = descriptions.map(() => []);
	requirements.forEach((requirement, index) => {
		const mark: QuoteMark = {
			quote: requirement.quote,
			n: index + 1,
			decides: decides.includes(index)
		};
		if (alone.some((locate) => locate(requirement.quote) !== undefined)) {
			descriptions.forEach((description, at) => {
				if (requirement.lang === undefined || requirement.lang === description.lang) {
					marks[at].push(mark);
				}
			});
			return;
		}
		const span = joined(requirement.quote);
		if (span === undefined) return;
		let offset = 0;
		let numbered = false;
		shown.forEach((text, at) => {
			const start = Math.max(span.start - offset, 0);
			const end = Math.min(span.end - offset, text.length);
			offset += text.length + 1;
			if (start >= end) return;
			marks[at].push({ ...mark, n: numbered ? undefined : mark.n, at: { start, end } });
			numbered = true;
		});
	});
	return marks;
}

// Where one requirement's quote sits in a criterion's drawn descriptions, as criterionMarks marks
// it: in the first description of its language that holds it whole, or each piece in turn where it
// was found only across two descriptions. at is the description, start and end the place in its
// drawn text.
export function quotePlaces(
	descriptions: readonly { text: string; lang?: string }[],
	requirement: { quote: string; lang?: string }
): { at: number; start: number; end: number }[] {
	const marks = criterionMarks(descriptions, [requirement], []);
	const places = marks.flatMap((list, at) =>
		placeMarks(shownText(descriptions[at].text), list).map(({ start, end }) => ({ at, start, end }))
	);
	const cut = marks.some((list) => list.some((mark) => mark.at !== undefined));
	return cut ? places : places.slice(0, 1);
}

// Words that end in a full stop without ending a sentence, as the German, Dutch and French
// clauses write them.
const ABBREVIATIONS = new Set([
	'bzw',
	'ca',
	'nr',
	'mio',
	'mrd',
	'inkl',
	'exkl',
	'ggf',
	'evtl',
	'gem',
	'vgl',
	'abs',
	'art',
	'max',
	'min',
	'usw',
	'etc',
	'zzgl',
	'bijv',
	'enz',
	'resp',
	'cf',
	'env'
]);

function endsSentence(text: string, dot: number): boolean {
	if (!/\s/u.test(text.charAt(dot + 1)) && dot + 1 < text.length) return false;
	const word = /[\p{L}\p{N}]+$/u.exec(text.slice(0, dot))?.[0] ?? '';
	if (word.length <= 1 || /^\p{N}+$/u.test(word)) return false;
	return !ABBREVIATIONS.has(word.toLowerCase());
}

// A paragraph break or a list item ends a sentence too.
const BLOCK_BREAK = new RegExp(String.raw`\n[^\S\n]*\n|\n(?=[^\S\n]*${MARKER})`, 'gu');

function boundaries(text: string): number[] {
	const ends: number[] = [];
	for (const match of text.matchAll(/[.!?]/gu)) {
		if (endsSentence(text, match.index)) ends.push(match.index + 1);
	}
	for (const match of text.matchAll(BLOCK_BREAK)) ends.push(match.index);
	return ends.sort((a, b) => a - b);
}

// Where the whole sentence or sentences around [start, end) sit: from the end of the sentence before
// it to the end of the last sentence it touches, less the spaces at either end. A place in the text,
// so the excerpt is a slice of it, never a rewrite, and a mark placed in the text keeps its place.
export function sentenceSpan(
	text: string,
	start: number,
	end: number
): { start: number; end: number } {
	const ends = boundaries(text);
	let from = ends.filter((at) => at <= start).at(-1) ?? 0;
	let to = ends.find((at) => at >= end) ?? text.length;
	while (from < to && /\s/u.test(text.charAt(from))) from += 1;
	while (to > from && /\s/u.test(text.charAt(to - 1))) to -= 1;
	return { start: from, end: to };
}
