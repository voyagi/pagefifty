import { describe, expect, it } from 'vitest';
import { replyRequirements } from '../../test/fixtures/replies';
import { parseMoney, sameNumber } from './figures';

describe('parseMoney on a recorded reply', () => {
	it('the German turnover floor parses to 10000000 cents net, at least', () => {
		const turnover = replyRequirements('de-610242-thinking-off')[2];
		expect(turnover.criterion).toBe(3);
		const reading = parseMoney(turnover.quote, 'de');
		expect(reading).toEqual({
			kind: 'one',
			cents: 10_000_000,
			basis: 'net',
			comparator: 'at-least'
		});
		expect(sameNumber('100.000,00 Euro netto', reading, 'de')).toBe(true);
	});
});
