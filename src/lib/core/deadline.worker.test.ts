import { describe, expect, it } from 'vitest';
import { cetDayEnd, cetDayStart, formatDeadline } from './deadline.ts';

// The server renders every label in workerd, so its ICU data must name the zones as Node's does,
// or the labels the tests pin in Node would differ from what a visitor is served.
describe('deadline labels in workerd', () => {
	it.each([
		['2026-10-06T10:00:00+02:00', 'Europe/Amsterdam', '6 Oct 2026, 10:00 CEST'],
		['2026-10-06T10:00:00+02:00', 'America/New_York', '6 Oct 2026, 04:00 EDT'],
		['2026-10-25T00:59:59Z', 'Europe/Amsterdam', '25 Oct 2026, 02:59 CEST'],
		['2026-10-25T01:00:00Z', 'Europe/Amsterdam', '25 Oct 2026, 02:00 CET'],
		['2026-09-29T12:00:00+02:00', 'Europe/Amsterdam', '29 Sep 2026, 12:00 CEST']
	])('formats %s in %s as %s', (instant, timeZone, label) => {
		expect(formatDeadline(instant, timeZone)).toBe(label);
	});

	it('bounds the day the clocks go back by its own offsets', () => {
		expect(cetDayStart('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
		expect(cetDayEnd('2026-10-25').toISOString()).toBe('2026-10-25T22:59:59.999Z');
	});
});
