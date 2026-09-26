import { describe, expect, it } from 'vitest';
import { averageTurnover, certificateStatus, turnoverYears } from './derive';
import { emptyProfile, type Profile } from './schema';

const withTurnover = (rows: Profile['turnover']): Profile => ({
	...emptyProfile(),
	turnover: rows
});
const row = (year: number, generalNet?: number) => ({ year, generalNet, specific: [] });

describe('turnoverYears', () => {
	it.each([
		['the first day of 2026', new Date(2026, 0, 1, 0, 0)],
		['the last minute of 2026', new Date(2026, 11, 31, 23, 59)]
	])('offers the three years before the current one on %s', (_when, today) => {
		expect(turnoverYears(today)).toEqual([2023, 2024, 2025]);
	});
});

describe('averageTurnover', () => {
	const years = [2023, 2024, 2025];

	it('is the mean when all three years hold numbers', () => {
		const profile = withTurnover([row(2025, 1240000), row(2023, 1090000), row(2024, 1210000)]);
		expect(averageTurnover(profile, years)).toBe(1180000);
	});

	it('counts a turnover of 0 as a number', () => {
		const profile = withTurnover([row(2023, 0), row(2024, 300), row(2025, 600)]);
		expect(averageTurnover(profile, years)).toBe(300);
	});

	it('is undefined when a year has no row', () => {
		expect(averageTurnover(withTurnover([row(2023, 1), row(2024, 2)]), years)).toBeUndefined();
	});

	it('is undefined when a year has a row without a figure', () => {
		const profile = withTurnover([row(2023, 1), row(2024), row(2025, 3)]);
		expect(averageTurnover(profile, years)).toBeUndefined();
	});

	it('ignores rows for years outside the ones asked for', () => {
		const profile = withTurnover([row(2022, 9), row(2023, 3), row(2024, 3), row(2025, 3)]);
		expect(averageTurnover(profile, years)).toBe(3);
	});

	it('is undefined for no years at all', () => {
		expect(averageTurnover(withTurnover([row(2023, 1)]), [])).toBeUndefined();
	});
});

describe('certificateStatus', () => {
	const today = new Date(2026, 8, 26, 9, 30);

	it('marks a certificate whose valid-until is before today expired on that date, and keeps it', () => {
		const certificate = { standard: 'ISO 27001', validUntil: '2026-09-25' };
		expect(certificateStatus(certificate, today)).toEqual({ state: 'expired', on: '2026-09-25' });
		expect(certificate).toEqual({ standard: 'ISO 27001', validUntil: '2026-09-25' });
	});

	it('counts a certificate valid until today as valid', () => {
		expect(certificateStatus({ standard: 'ISO 9001', validUntil: '2026-09-26' }, today)).toEqual({
			state: 'valid',
			until: '2026-09-26'
		});
	});

	it('uses the local day, not the UTC one', () => {
		const justAfterLocalMidnight = new Date(2026, 8, 27, 0, 5);
		expect(
			certificateStatus({ standard: 'ISO 9001', validUntil: '2026-09-26' }, justAfterLocalMidnight)
		).toEqual({ state: 'expired', on: '2026-09-26' });
	});

	it('reads a certificate without a valid-until date as undated', () => {
		expect(certificateStatus({ standard: 'BSI C5' }, today)).toEqual({ state: 'undated' });
	});
});
