import { describe, expect, it } from 'vitest';
import list from './selection-criterion.json';
import { criterionLabel, parameterLabel } from './labels';

describe('criterionLabel', () => {
	it('gives the English label of a code from the tracked EU code list', () => {
		expect(criterionLabel('slc-abil-facil-res')).toBe('Study, technical and research facilities');
	});

	it('gives every code of the tracked list its own label', () => {
		for (const { code, label } of list.codes) {
			expect(criterionLabel(code), code).toBe(label);
		}
	});

	// The code comes from the notice, so it may name a key every plain object inherits.
	it.each(['no-such-code', '', 'constructor', '__proto__'])('has no label for %j', (code) => {
		expect(criterionLabel(code)).toBeUndefined();
	});
});

describe('parameterLabel', () => {
	// The English names in the eForms SDK codelists, read 2026-10-08 from OP-TED/eForms-SDK
	// (develop): number-weight.gc version 20240612-0 and number-threshold.gc version 20250924-0.
	it.each([
		['number-weight', 'dec-exa', 'Weight (decimal, exact)'],
		['number-weight', 'dec-mid', 'Weight (decimal, middle of a range)'],
		['number-weight', 'ord-imp', 'Order of importance'],
		['number-weight', 'per-exa', 'Weight (percentage, exact)'],
		['number-weight', 'per-mid', 'Weight (percentage, middle of a range)'],
		['number-weight', 'poi-exa', 'Weight (points, exact)'],
		['number-weight', 'poi-mid', 'Weight (points, middle of a range)'],
		['number-threshold', 'max-pass', 'Maximum number of tenders passing'],
		['number-threshold', 'min-score', 'Minimum score']
	])('names %s %s as the EU code list does: %s', (listName, code, name) => {
		expect(parameterLabel(listName, code)).toBe(name);
	});

	// A weight is never read as a threshold or the other way round: the list decides the name.
	it.each([
		['number-threshold', 'poi-exa'],
		['number-weight', 'min-score'],
		[undefined, 'min-score'],
		['number-weight', 'no-such-code']
	])('has no name for %s %s', (listName, code) => {
		expect(parameterLabel(listName, code)).toBeUndefined();
	});
});
