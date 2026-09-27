// The firm profile, schema version 1: the whole field list locked at phase 1 planning (PROF-01),
// although the phase 1 form edits only part of it, so phase 2's comparisons read the same shape.
// Strict objects everywhere: an unknown key in an imported file is named, never silently dropped.
import { z } from 'zod';
import { EU_EEA_COUNTRIES, EU_LANGUAGES } from './codes';

export const PROFILE_SCHEMA_VERSION = 1;

const countryCodes = EU_EEA_COUNTRIES.map((country) => country.code);
const languageCodes = EU_LANGUAGES.map((language) => language.code);

const Country = z.enum(countryCodes as [string, ...string[]]);
const Language = z.enum(languageCodes as [string, ...string[]]);
const Text = z.string().trim().min(1).max(200);
const Day = z.iso.date();
const Year = z.number().int().min(1900).max(2100);

// Every money and count figure is optional: absent means unknown, never 0. When present it is a
// whole, finite number of at least 0 that a JavaScript number holds exactly: zod 4's int() refuses
// anything past Number.MAX_SAFE_INTEGER (schema.test.ts pins that).
const Whole = z.number().int().nonnegative();

// The index of every row whose year an earlier row already holds.
function repeatedYearRows(rows: readonly { year: number }[]): number[] {
	const seen = new Set<number>();
	return rows.flatMap((row, index) => {
		const repeated = seen.has(row.year);
		seen.add(row.year);
		return repeated ? [index] : [];
	});
}

export const ProfileSchema = z
	.strictObject({
		registration: z.strictObject({ country: Country.optional(), register: Text.optional() }),
		authorisations: z.array(z.strictObject({ name: Text, register: Text.optional() })),
		reservedOperator: z.boolean().optional(),
		securityClearances: z.array(z.strictObject({ country: Country, level: Text })),
		completedFinancialYears: Whole.optional(),
		// Keyed by the year a financial year ends.
		turnover: z.array(
			z.strictObject({
				year: Year,
				generalNet: Whole.optional(),
				specific: z.array(z.strictObject({ businessLine: Text, net: Whole.optional() }))
			})
		),
		staff: z.strictObject({
			total: Whole.optional(),
			byRole: z.array(
				z.strictObject({ role: Text, domain: Text.optional(), count: Whole.optional() })
			),
			// A yearly average headcount is often a fraction (17.5 people), unlike a count.
			yearlyAverages: z.array(
				z.strictObject({ year: Year, average: z.number().nonnegative().optional() })
			)
		}),
		insurance: z.array(
			z.strictObject({ kind: Text, coverEuros: Whole.optional(), validUntil: Day.optional() })
		),
		certificates: z.array(
			z.strictObject({ standard: Text, scope: Text.optional(), validUntil: Day.optional() })
		),
		references: z.array(
			z.strictObject({
				client: Text,
				clientType: z.enum(['public', 'private']).optional(),
				start: Day.optional(),
				completion: Day.optional(),
				valueNet: Whole.optional(),
				categories: z.array(Text),
				performedByFirm: z.boolean().optional()
			})
		),
		countries: z.array(Country),
		languages: z.array(Language)
	})
	.superRefine((profile, ctx) => {
		// One figure per year: with two rows for a year every later reading (the form's average,
		// phase 2's comparisons) would pick one by position, so the repeated year is refused by name.
		const lists = [
			{ path: ['turnover'], rows: profile.turnover },
			{ path: ['staff', 'yearlyAverages'], rows: profile.staff.yearlyAverages }
		];
		for (const { path, rows } of lists) {
			for (const index of repeatedYearRows(rows)) {
				const { year } = rows[index];
				ctx.addIssue({
					code: 'custom',
					message: `year ${year} is listed twice`,
					path: [...path, index, 'year'],
					input: year
				});
			}
		}
	});

export type Profile = z.infer<typeof ProfileSchema>;

export const StoredProfileSchema = z.strictObject({
	schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
	savedAt: z.iso.datetime(),
	lastExportedAt: z.iso.datetime().nullable(),
	profile: ProfileSchema
});

export type StoredProfile = z.infer<typeof StoredProfileSchema>;

export function emptyProfile(): Profile {
	return {
		registration: {},
		authorisations: [],
		securityClearances: [],
		turnover: [],
		staff: { byRole: [], yearlyAverages: [] },
		insurance: [],
		certificates: [],
		references: [],
		countries: [],
		languages: []
	};
}
