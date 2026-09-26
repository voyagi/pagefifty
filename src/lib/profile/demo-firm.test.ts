import { describe, expect, it } from 'vitest';
import { DEMO_FIRM_NAME, DEMO_FIRM_SHORT, DEMO_PROFILE } from './demo-firm';
import { averageTurnover, turnoverYears } from './derive';
import { ProfileSchema } from './schema';

describe('the demo firm', () => {
	it('is named as the design names it', () => {
		expect(DEMO_FIRM_NAME).toBe('Brink Data B.V.');
		expect(DEMO_FIRM_SHORT).toBe('Brink Data');
	});

	it('validates against the profile schema v1', () => {
		expect(ProfileSchema.safeParse(DEMO_PROFILE).success).toBe(true);
	});

	it("holds the design note's turnover by year", () => {
		const byYear = Object.fromEntries(
			DEMO_PROFILE.turnover.map((row) => [row.year, row.generalNet])
		);
		expect(byYear).toEqual({ 2023: 1090000, 2024: 1210000, 2025: 1240000 });
	});

	it("averages to the design note's EUR 1,180,000 over the years the form shows in 2026", () => {
		expect(averageTurnover(DEMO_PROFILE, turnoverYears(new Date(2026, 8, 26)))).toBe(1180000);
	});

	it('earns every euro from data management software, as the design note says', () => {
		for (const row of DEMO_PROFILE.turnover) {
			expect(row.specific, String(row.year)).toEqual([
				{ businessLine: 'Data management software', net: row.generalNet }
			]);
		}
	});

	it("holds the note's 16 roles, its two references and the invented registration and reach", () => {
		const counted = DEMO_PROFILE.staff.byRole.reduce((sum, role) => sum + (role.count ?? 0), 0);
		expect(counted).toBe(16);
		expect(
			DEMO_PROFILE.references.map(({ categories, performedByFirm }) => [
				categories,
				performedByFirm
			])
		).toEqual([
			[['Database'], true],
			[['Complex process chains'], true]
		]);
		expect(DEMO_PROFILE.registration).toEqual({ country: 'NL', register: 'Kamer van Koophandel' });
		expect([DEMO_PROFILE.countries, DEMO_PROFILE.languages]).toEqual([
			['NL', 'BE', 'DE'],
			['nl', 'en', 'de']
		]);
	});

	it('has 19 staff and holds ISO 27001 and ISO 9001', () => {
		expect(DEMO_PROFILE.staff.total).toBe(19);
		expect(DEMO_PROFILE.certificates.map((entry) => entry.standard)).toEqual([
			'ISO 27001',
			'ISO 9001'
		]);
	});

	it('is frozen at every depth', () => {
		expect(Object.isFrozen(DEMO_PROFILE)).toBe(true);
		expect(Object.isFrozen(DEMO_PROFILE.registration)).toBe(true);
		expect(Object.isFrozen(DEMO_PROFILE.turnover)).toBe(true);
		expect(Object.isFrozen(DEMO_PROFILE.turnover[0])).toBe(true);
		expect(Object.isFrozen(DEMO_PROFILE.turnover[0].specific[0])).toBe(true);
		expect(Object.isFrozen(DEMO_PROFILE.staff.byRole)).toBe(true);
		expect(Object.isFrozen(DEMO_PROFILE.certificates[0])).toBe(true);
		expect(Object.isFrozen(DEMO_PROFILE.references[0].categories)).toBe(true);
		expect(() => {
			(DEMO_PROFILE.staff as { total?: number }).total = 20;
		}).toThrow(TypeError);
		expect(DEMO_PROFILE.staff.total).toBe(19);
	});
});
