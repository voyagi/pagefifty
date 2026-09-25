// Field text to profile numbers. Empty means unknown and stays distinct from 0.

export type FieldProblem = 'not-a-number' | 'below-zero' | 'too-long';
export type FieldResult =
	{ ok: true; value: number | undefined } | { ok: false; reason: FieldProblem };

// 15 digits stay exact as a JavaScript number; a 16th could round (Number.MAX_SAFE_INTEGER has
// 16 digits but not every 16-digit value is safe), so the length is checked before converting.
const MAX_DIGITS = 15;

function parseWholeNumber(input: string): FieldResult {
	const compact = input.replace(/\s/g, '');
	if (compact === '') return { ok: true, value: undefined };
	if (/^-[0-9]+$/.test(compact)) return { ok: false, reason: 'below-zero' };
	if (!/^[0-9]+$/.test(compact)) return { ok: false, reason: 'not-a-number' };
	if (compact.replace(/^0+(?=[0-9])/, '').length > MAX_DIGITS) {
		return { ok: false, reason: 'too-long' };
	}
	return { ok: true, value: Number(compact) };
}

// Whole euros, digits and spaces only. "1.240" is 1240 in German and Dutch and 1.24 in English, so
// a dot, a comma, "mln" or "k" is refused rather than guessed.
export function parseWholeEuros(input: string): FieldResult {
	return parseWholeNumber(input);
}

export function parseCount(input: string): FieldResult {
	return parseWholeNumber(input);
}
