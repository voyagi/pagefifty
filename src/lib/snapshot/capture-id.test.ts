import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { firstPublishedDay, namesRealFirstDay, newestCapture } from './capture-id';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The oracle knows nothing of Date: Gregorian month lengths and the leap rule. V8 reads 2026-02-30
// as 2 March rather than refusing it, so a guard that only asked whether formatting throws would
// let that day through as the wrong one.
function daysIn(year: number, month: number): number {
	if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
	return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const pad = (value: number, width: number) => String(value).padStart(width, '0');
const dayId = (year: number, month: number, day: number) =>
	`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;

describe('the first publication day of a capture query', () => {
	test.prop([
		fc.integer({ min: 2000, max: 2099 }),
		fc.integer({ min: 0, max: 19 }),
		fc.integer({ min: 0, max: 39 })
	])(
		'is accepted exactly when its digits name a real day, and is written as that day',
		(year, month, day) => {
			const query = `cpv AND publication-date>=${pad(year, 4)}${pad(month, 2)}${pad(day, 2)} AND x`;
			const real = month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month);
			expect(namesRealFirstDay(query)).toBe(real);
			if (real) expect(firstPublishedDay(query)).toBe(`${day} ${MONTHS[month - 1]} ${year}`);
		}
	);

	// Digits that are not exactly YYYYMMDD name no day, so the clause is refused, and a longer run is
	// never read as the day its first eight digits spell.
	test.prop([fc.stringMatching(/^\d{1,12}$/).filter((digits) => digits.length !== 8)])(
		'is refused for any other number of digits, and no day is written for it',
		(digits) => {
			const query = `cpv AND publication-date>=${digits} AND x`;
			expect(namesRealFirstDay(query)).toBe(false);
			expect(firstPublishedDay(query)).toBeUndefined();
		}
	);
});

describe('newestCapture', () => {
	const realDay = fc
		.tuple(fc.integer({ min: 2000, max: 2099 }), fc.integer({ min: 1, max: 12 }))
		.chain(([year, month]) =>
			fc.integer({ min: 1, max: daysIn(year, month) }).map((day) => dayId(year, month, day))
		);
	const junk = fc.constantFrom(
		'notes',
		'.tmp-2099-12-31-4',
		'2026-02-30',
		'2026-1-5',
		'2099-13-01'
	);

	test.prop([fc.array(realDay, { minLength: 1, maxLength: 8 }), fc.array(junk, { maxLength: 4 })])(
		'picks the latest real day in any order, never a name that is not one',
		(days, others) => {
			const latest = [...days].sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
			expect(newestCapture([...days, ...others])).toBe(latest);
			expect(newestCapture([...others, ...days].reverse())).toBe(latest);
		}
	);
});
