// A model's requirement is only a pointer into the notice: its quote must be found, by code, in the
// text of the criterion it names, or nothing downstream may use it (SPEC R3). Loaded by the capture
// command under Node type stripping: erasable syntax only, no imports.

export const MIN_QUOTE_LENGTH = 12;

// Every caller that builds a clause's text (the model's user message, the record, the page) goes
// through here, so the text sent, the text checked and the text shown cannot differ.
export function criterionText(descriptions: readonly { text: string }[]): string {
	return descriptions.map((description) => description.text).join('\n');
}

const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B]/gu;
const DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F]/gu;
// Tender texts break words at line ends with a hyphen, and the model keeps the hyphen but drops the
// break ("abgeschlosse-nen"). Keeping the hyphen found 22 of spike 004's 27 quotes where joining it
// away found 19; the hyphen-free second pass in findQuote finds the rest (27 of 27).
const LINE_END_HYPHEN = /-[^\S\n]*\n\s*/gu;
const WHITESPACE = /\s+/gu;

// The replacements each pass makes, in order. normalizeQuote and withoutHyphens run them on a plain
// string, quoteLocator on a traced one, so the text checked and the text marked on the page are cut
// by the same steps.
type Step = readonly [RegExp, string];
const NORMALIZE_STEPS: readonly Step[] = [
	[SINGLE_QUOTES, "'"],
	[DOUBLE_QUOTES, '"'],
	[LINE_END_HYPHEN, '-'],
	[WHITESPACE, ' ']
];

export function normalizeQuote(text: string): string {
	return NORMALIZE_STEPS.reduce(
		(each, [pattern, by]) => each.replace(pattern, by),
		text.normalize('NFKC')
	).trim();
}

// A hyphen with a digit on each side, past any spaces and other hyphens, is a range ("1-2",
// "1 - 2"), and dropping it would read two numbers as one. The second pass keeps those and drops
// the rest: bullets, and line-end hyphens the model left out of a word.
const DROPPABLE_HYPHEN = /-(?![\s-]*\d)|(?<!\d[\s-]*)-/gu;
const BARE_STEPS: readonly Step[] = [
	[DROPPABLE_HYPHEN, ''],
	[WHITESPACE, ' ']
];

export function withoutHyphens(text: string): string {
	return BARE_STEPS.reduce((each, [pattern, by]) => each.replace(pattern, by), text).trim();
}

export type QuoteResult =
	| { found: true; start: number; pass: 'as-normalised' | 'hyphens-removed' }
	| { found: false; reason: 'too-short' | 'not-found' };

const codePoints = (text: string) => [...text].length;

export function findQuote(quote: string, source: string): QuoteResult {
	const wanted = normalizeQuote(quote);
	if (codePoints(wanted) < MIN_QUOTE_LENGTH) return { found: false, reason: 'too-short' };
	const text = normalizeQuote(source);
	const start = text.indexOf(wanted);
	if (start >= 0) return { found: true, start, pass: 'as-normalised' };
	const bare = withoutHyphens(wanted);
	const bareStart = codePoints(bare) >= MIN_QUOTE_LENGTH ? withoutHyphens(text).indexOf(bare) : -1;
	return bareStart >= 0
		? { found: true, start: bareStart, pass: 'hyphens-removed' }
		: { found: false, reason: 'not-found' };
}

// A compared text with, for each of its UTF-16 units, the span of the source it came from, so a
// quote found in the compared text can be cut from the source as published.
interface Traced {
	text: string;
	from: number[];
	to: number[];
}

function append(into: Traced, text: string, from: number, to: number) {
	into.text += text;
	for (let unit = 0; unit < text.length; unit++) {
		into.from.push(from);
		into.to.push(to);
	}
}

// NFKC on each base character with its combining marks, so each piece keeps its own source span.
// On the recorded clauses and generated ones it finds what findQuote finds (quote.test.ts).
function traceNfkc(source: string): Traced {
	const traced: Traced = { text: '', from: [], to: [] };
	for (const piece of source.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
		append(traced, piece[0].normalize('NFKC'), piece.index, piece.index + piece[0].length);
	}
	return traced;
}

// The .trim() that ends normalizeQuote and withoutHyphens, as a step.
const TRIM: Step = [/^\s+|\s+$/gu, ''];

function traceSteps(source: Traced, steps: readonly Step[]): Traced {
	return [...steps, TRIM].reduce((traced, [pattern, by]) => {
		const out: Traced = { text: '', from: [], to: [] };
		let at = 0;
		const keep = (end: number) => {
			for (let unit = at; unit < end; unit++) {
				append(out, traced.text[unit], traced.from[unit], traced.to[unit]);
			}
		};
		for (const match of traced.text.matchAll(pattern)) {
			keep(match.index);
			const end = match.index + match[0].length;
			append(out, by, traced.from[match.index], traced.to[end - 1]);
			at = end;
		}
		keep(traced.text.length);
		return out;
	}, source);
}

const spanOf = (traced: Traced, start: number, length: number) => ({
	start: traced.from[start],
	end: traced.to[start + length - 1]
});

// Where in a source findQuote finds each quote: its two passes, run over a traced copy of the
// source made once, give the span of the published characters a quote was found in, or undefined
// where findQuote would not find it.
export function quoteLocator(
	source: string
): (quote: string) => { start: number; end: number } | undefined {
	const text = traceSteps(traceNfkc(source), NORMALIZE_STEPS);
	let bareText: Traced | undefined;
	return (quote) => {
		const wanted = normalizeQuote(quote);
		if (codePoints(wanted) < MIN_QUOTE_LENGTH) return undefined;
		const start = text.text.indexOf(wanted);
		if (start >= 0) return spanOf(text, start, wanted.length);
		const bare = withoutHyphens(wanted);
		if (codePoints(bare) < MIN_QUOTE_LENGTH) return undefined;
		bareText ??= traceSteps(text, BARE_STEPS);
		const bareStart = bareText.text.indexOf(bare);
		return bareStart >= 0 ? spanOf(bareText, bareStart, bare.length) : undefined;
	};
}

export type RequirementCheck =
	| {
			status: 'verified';
			criterion: number;
			start: number;
			pass: 'as-normalised' | 'hyphens-removed';
	  }
	| {
			status: 'rejected';
			criterion: number;
			reason: 'no-such-criterion' | 'too-short' | 'not-found';
	  };

export function verifyRequirements(
	sources: readonly string[],
	items: readonly { criterion: number; quote: string }[]
): RequirementCheck[] {
	return items.map(({ criterion, quote }): RequirementCheck => {
		const source =
			Number.isInteger(criterion) && criterion >= 1 ? sources[criterion - 1] : undefined;
		if (source === undefined) return { status: 'rejected', criterion, reason: 'no-such-criterion' };
		const result = findQuote(quote, source);
		return result.found
			? { status: 'verified', criterion, start: result.start, pass: result.pass }
			: { status: 'rejected', criterion, reason: result.reason };
	});
}
