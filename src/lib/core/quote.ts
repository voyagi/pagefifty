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

export function normalizeQuote(text: string): string {
	return text
		.normalize('NFKC')
		.replace(SINGLE_QUOTES, "'")
		.replace(DOUBLE_QUOTES, '"')
		.replace(LINE_END_HYPHEN, '-')
		.replace(WHITESPACE, ' ')
		.trim();
}

// A hyphen with a digit on each side, past any spaces and other hyphens, is a range ("1-2",
// "1 - 2"), and dropping it would read two numbers as one. The second pass keeps those and drops
// the rest: bullets, and line-end hyphens the model left out of a word.
const DROPPABLE_HYPHEN = /-(?![\s-]*\d)|(?<!\d[\s-]*)-/gu;

export function withoutHyphens(text: string): string {
	return text.replace(DROPPABLE_HYPHEN, '').replace(WHITESPACE, ' ').trim();
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
