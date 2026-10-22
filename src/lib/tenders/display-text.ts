// How a buyer's published words are drawn for reading. Clauses are often pasted from a PDF, so they
// keep its hard line breaks: a word split at a line end with a hyphen ("Zertifizie-" then "rung"),
// and lines that stop wherever the page ran out. Nothing here changes a character. Every character
// of the text lands in exactly one run, in order, so the page's text stays the published text byte
// for byte; a run only says how its characters are drawn.
//
// text      drawn as written; a single line break inside it reads as a space
// hidden    kept in the page's text but not drawn: the hyphen and break of a word split at a line
//           end, or the break after a hyphen that belongs to the word ("27001-" then "Zertifizierung")
// line      a line break kept as one, before a list item ("a)", "-", "1.")
// paragraph a blank line, kept as a paragraph break

export type RunKind = 'text' | 'hidden' | 'line' | 'paragraph';

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

function breakKind(text: string, end: number, breaks: number): RunKind {
	if (breaks > 1) return 'paragraph';
	return LIST_ITEM.test(text.slice(end)) ? 'line' : 'text';
}

export function displayRuns(text: string): TextRun[] {
	const runs: TextRun[] = [];
	let at = 0;
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
			push(runs, breakKind(text, end, breaks), match[0].slice(rest), start + rest);
		}
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

// A verified quote to set apart inside its clause: n numbers it against its reading shown beside the
// clause, and decides marks the words the verdict rests on.
export interface QuoteMark {
	quote: string;
	n?: number;
	decides?: boolean;
}

const escaped = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Code checked each quote against the clause with whitespace collapsed and a line-end hyphen's break
// dropped (core/quote.ts), so a quote is looked for here the same way: across any run of spaces or
// line breaks, and across the break after a hyphen. A quote not found is left unmarked, and a found
// quote overlapping an earlier one is dropped, so the text itself is never cut or repeated.
export function findQuotes(
	text: string,
	quotes: readonly string[]
): { start: number; end: number; index: number }[] {
	const found = quotes.flatMap((quote, index) => {
		const pattern = quote
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.map((word) => escaped(word).replaceAll('-', '-(?:[^\\S\\n]*\\n\\s*)?'))
			.join('\\s+');
		if (pattern === '') return [];
		const match = new RegExp(pattern, 'u').exec(text);
		return match === null
			? []
			: [{ start: match.index, end: match.index + match[0].length, index }];
	});
	found.sort((a, b) => a.start - b.start || a.index - b.index);
	const kept: typeof found = [];
	for (const each of found) {
		if (each.start >= (kept.at(-1)?.end ?? 0)) kept.push(each);
	}
	return kept;
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

// The whole sentence or sentences around [start, end): from the end of the sentence before it to
// the end of the last sentence it touches. A slice of the text, never a rewrite of it.
export function sentencesAround(text: string, start: number, end: number): string {
	const ends = boundaries(text);
	const from = ends.filter((at) => at <= start).at(-1) ?? 0;
	const to = ends.find((at) => at >= end) ?? text.length;
	return text.slice(from, to).trim();
}
