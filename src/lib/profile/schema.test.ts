import { describe, expect, it } from 'vitest';
import { cldrLabel } from '../../test/cldr';
import { canonicalStoredJson } from './canonical';
import { EU_EEA_COUNTRIES, EU_LANGUAGES } from './codes';
import { parseCount, parseWholeEuros } from './fields';
import {
	PROFILE_SCHEMA_VERSION,
	ProfileSchema,
	StoredProfileSchema,
	emptyProfile,
	type Profile
} from './schema';

// Every field of the locked PROF-01 list, filled.
const FULL: Profile = {
	registration: { country: 'NL', register: 'KvK 12345678' },
	authorisations: [{ name: 'Security screening', register: 'Justis' }],
	reservedOperator: false,
	securityClearances: [{ country: 'DE', level: 'VS-NfD' }],
	completedFinancialYears: 3,
	turnover: [
		{
			year: 2025,
			generalNet: 1240000,
			specific: [{ businessLine: 'IT operations support', net: 400000 }]
		}
	],
	staff: {
		total: 19,
		byRole: [{ role: 'Developer', domain: 'Java', count: 8 }],
		yearlyAverages: [{ year: 2025, average: 17.5 }]
	},
	insurance: [{ kind: 'Professional liability', coverEuros: 2000000, validUntil: '2027-03-31' }],
	certificates: [
		{ standard: 'ISO 27001', scope: 'Hosting', validUntil: '2027-03-31' },
		{ standard: 'ISO 9001' }
	],
	references: [
		{
			client: 'Gemeente Utrecht',
			clientType: 'public',
			start: '2023-01-01',
			completion: '2024-06-30',
			valueNet: 350000,
			categories: ['operations'],
			performedByFirm: true
		}
	],
	countries: ['NL', 'DE'],
	languages: ['nl', 'en']
};

const issuePaths = (value: unknown) => {
	const result = ProfileSchema.safeParse(value);
	return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('parseWholeEuros', () => {
	it('reads an empty input as unknown, never 0', () => {
		expect(parseWholeEuros('')).toEqual({ ok: true, value: undefined });
		expect(parseWholeEuros('   ')).toEqual({ ok: true, value: undefined });
	});

	it('keeps 0 as 0', () => {
		expect(parseWholeEuros('0')).toEqual({ ok: true, value: 0 });
	});

	it('removes spaces between digit groups', () => {
		expect(parseWholeEuros('1 240 000')).toEqual({ ok: true, value: 1240000 });
		expect(parseWholeEuros('1 240 000')).toEqual({ ok: true, value: 1240000 });
	});

	it.each(['1.240', '1,24 mln', '1240k', '1e6', 'EUR 5', '12a', '-', '+5', '٣'])(
		'refuses %j as not a number',
		(input) => {
			expect(parseWholeEuros(input)).toEqual({ ok: false, reason: 'not-a-number' });
		}
	);

	it('refuses a value below zero', () => {
		expect(parseWholeEuros('-5')).toEqual({ ok: false, reason: 'below-zero' });
	});

	it('accepts 15 digits and refuses 16 before any number conversion', () => {
		expect(parseWholeEuros('999999999999999')).toEqual({ ok: true, value: 999999999999999 });
		expect(parseWholeEuros('1234567890123456')).toEqual({ ok: false, reason: 'too-long' });
		expect(parseWholeEuros('9007199254740993')).toEqual({ ok: false, reason: 'too-long' });
	});
});

describe('parseCount', () => {
	it('reads 19 as 19 and empty as unknown', () => {
		expect(parseCount('19')).toEqual({ ok: true, value: 19 });
		expect(parseCount('')).toEqual({ ok: true, value: undefined });
	});

	it('refuses a fraction and a value below zero', () => {
		expect(parseCount('1.5')).toEqual({ ok: false, reason: 'not-a-number' });
		expect(parseCount('-1')).toEqual({ ok: false, reason: 'below-zero' });
	});
});

describe('ProfileSchema', () => {
	it('is version 1', () => {
		expect(PROFILE_SCHEMA_VERSION).toBe(1);
	});

	it('holds the whole locked field list', () => {
		expect(ProfileSchema.parse(FULL)).toEqual(FULL);
		expect(Object.keys(ProfileSchema.shape)).toEqual([
			'registration',
			'authorisations',
			'reservedOperator',
			'securityClearances',
			'completedFinancialYears',
			'turnover',
			'staff',
			'insurance',
			'certificates',
			'references',
			'countries',
			'languages'
		]);
	});

	it('accepts the empty profile, in which every figure is unknown', () => {
		const empty = ProfileSchema.parse(emptyProfile());
		expect(empty.staff.total).toBeUndefined();
		expect(empty.completedFinancialYears).toBeUndefined();
	});

	it('refuses a staff total below zero, naming the field', () => {
		expect(
			issuePaths({ ...emptyProfile(), staff: { ...emptyProfile().staff, total: -1 } })
		).toEqual(['staff.total']);
	});

	it('refuses a bare staff object with a negative total, naming staff and total', () => {
		const paths = issuePaths({ staff: { total: -1 } });
		expect(paths).toContain('staff.total');
	});

	it.each([Number.POSITIVE_INFINITY, Number.NaN, 1.5, 2 ** 53])(
		'refuses %s as a staff total',
		(total) => {
			expect(issuePaths({ ...emptyProfile(), staff: { ...emptyProfile().staff, total } })).toEqual([
				'staff.total'
			]);
		}
	);

	it('refuses a negative turnover, naming the year row and field', () => {
		const profile = { ...emptyProfile(), turnover: [{ year: 2025, generalNet: -1, specific: [] }] };
		expect(issuePaths(profile)).toEqual(['turnover.0.generalNet']);
	});

	it('keeps a turnover of exactly 0 as 0, distinct from an empty one', () => {
		const zero = ProfileSchema.parse({
			...emptyProfile(),
			turnover: [{ year: 2025, generalNet: 0, specific: [] }]
		});
		const empty = ProfileSchema.parse({
			...emptyProfile(),
			turnover: [{ year: 2025, specific: [] }]
		});
		expect(zero.turnover[0].generalNet).toBe(0);
		expect(empty.turnover[0].generalNet).toBeUndefined();
	});

	it('refuses a figure past Number.MAX_SAFE_INTEGER rather than storing it inexactly', () => {
		const profile = {
			...emptyProfile(),
			turnover: [{ year: 2025, generalNet: 2 ** 60, specific: [] }]
		};
		expect(issuePaths(profile)).toEqual(['turnover.0.generalNet']);
	});

	it('names an unknown key instead of dropping it', () => {
		const result = ProfileSchema.safeParse({ ...emptyProfile(), turnoverGuess: 5 });
		expect(result.success).toBe(false);
		expect(JSON.stringify(result.error?.issues)).toContain('turnoverGuess');
	});

	it('refuses a country or language outside the fixed lists', () => {
		expect(issuePaths({ ...emptyProfile(), countries: ['NL', 'US'] })).toEqual(['countries.1']);
		expect(issuePaths({ ...emptyProfile(), languages: ['xx'] })).toEqual(['languages.0']);
	});

	it('keeps certificates, countries and languages in entry order', () => {
		const parsed = ProfileSchema.parse({ ...FULL, countries: ['SE', 'AT', 'NL'] });
		expect(parsed.countries).toEqual(['SE', 'AT', 'NL']);
		expect(parsed.certificates.map((certificate) => certificate.standard)).toEqual([
			'ISO 27001',
			'ISO 9001'
		]);
	});

	// The profile page draws the certificate list keyed by name; a repeated name would stop it.
	it('refuses a certificate listed twice, as its name reads once trimmed, on the later row only', () => {
		const certificates = [
			{ standard: 'ISO 9001' },
			{ standard: 'ISO 27001' },
			{ standard: 'ISO 9001 ', validUntil: '2027-01-31' },
			{ standard: 'iso 9001' }
		];
		const result = ProfileSchema.safeParse({ ...emptyProfile(), certificates });
		expect(result.success).toBe(false);
		expect(result.error?.issues).toMatchObject([
			{
				code: 'custom',
				path: ['certificates', 2, 'standard'],
				message: 'certificate ISO 9001 is listed twice'
			}
		]);
		expect(issuePaths({ ...emptyProfile(), certificates: certificates.slice(0, 2) })).toEqual([]);
	});
});

describe('the fixed code lists', () => {
	it('lists the EU and EEA countries once each', () => {
		const codes = EU_EEA_COUNTRIES.map((country) => country.code);
		expect(codes).toHaveLength(30);
		expect(new Set(codes).size).toBe(30);
		expect(codes).toEqual(expect.arrayContaining(['NL', 'BE', 'DE', 'IS', 'LI', 'NO']));
	});

	it('lists the 24 EU official languages once each', () => {
		const codes = EU_LANGUAGES.map((language) => language.code);
		expect(codes).toHaveLength(24);
		expect(new Set(codes).size).toBe(24);
		expect(codes).toEqual(expect.arrayContaining(['nl', 'fr', 'de', 'en', 'ga', 'mt']));
	});

	// The pick lists are typed by hand; ICU's English names are an independent copy of the same facts,
	// so a swapped or misspelled name shows here. A failure names the CLDR release when it differs
	// from the one the lists were checked against (src/test/cldr.ts).
	it('names each country as ICU names its ISO 3166-1 code in English', () => {
		const regions = new Intl.DisplayNames('en', { type: 'region' });
		for (const { code, name } of EU_EEA_COUNTRIES) {
			expect(name, cldrLabel(code)).toBe(regions.of(code));
		}
	});

	it('names each language as ICU names its ISO 639-1 code in English', () => {
		const languages = new Intl.DisplayNames('en', { type: 'language' });
		for (const { code, name } of EU_LANGUAGES) {
			expect(name, cldrLabel(code)).toBe(languages.of(code));
		}
	});
});

describe('StoredProfileSchema and canonicalStoredJson', () => {
	const stored = {
		schemaVersion: 1 as const,
		savedAt: '2026-09-25T10:00:00.000Z',
		lastExportedAt: null,
		profile: FULL
	};

	it('parses the stored envelope', () => {
		expect(StoredProfileSchema.parse(stored)).toEqual(stored);
	});

	it('refuses an envelope of another schema version', () => {
		expect(StoredProfileSchema.safeParse({ ...stored, schemaVersion: 2 }).success).toBe(false);
	});

	it('writes keys in schema order whatever order they arrive in', () => {
		const reversed = JSON.parse(
			JSON.stringify(stored, (_key, value: unknown) =>
				value && typeof value === 'object' && !Array.isArray(value)
					? Object.fromEntries(Object.entries(value).reverse())
					: value
			)
		);
		expect(Object.keys(reversed)[0]).toBe('profile');
		expect(canonicalStoredJson(reversed)).toBe(canonicalStoredJson(stored));
		expect(canonicalStoredJson(stored).startsWith('{"schemaVersion":1,"savedAt":')).toBe(true);
	});

	it('leaves unknown figures out rather than writing them as 0 or null', () => {
		const json = canonicalStoredJson({ ...stored, profile: emptyProfile() });
		expect(json).not.toContain('"total"');
		expect(JSON.parse(json).profile.staff).toEqual({ byRole: [], yearlyAverages: [] });
	});
});
