import { describe, expect, it } from 'vitest';
import { wholeEuros } from './euros';

describe('wholeEuros', () => {
	it('groups the thousands with commas after the currency code', () => {
		expect(wholeEuros(1240000)).toBe('EUR 1,240,000');
		expect(wholeEuros(950)).toBe('EUR 950');
	});

	it('rounds to the whole euro, never shows cents', () => {
		expect(wholeEuros(1179999.5)).toBe('EUR 1,180,000');
		expect(wholeEuros(1180000.49)).toBe('EUR 1,180,000');
	});
});
