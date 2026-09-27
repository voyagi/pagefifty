// The demo firm for trying the pages without a profile of one's own. Shown read-only and labelled
// as a demo wherever it appears; it lives only in this constant and is never written to storage.
import type { Profile } from './schema';

export const DEMO_FIRM_NAME = 'Brink Data B.V.';
export const DEMO_FIRM_SHORT = 'Brink Data';

function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null) {
		for (const inner of Object.values(value)) deepFreeze(inner);
		Object.freeze(value);
	}
	return value;
}

const DATA_MANAGEMENT = 'Data management software';

// From the note under design/profile.html: turnover 2023 EUR 1,090,000, 2024 EUR 1,210,000 and
// 2025 EUR 1,240,000, all of it from data management software (EUR 1,180,000 a year on average),
// 19 staff, ISO 27001 and ISO 9001, one database-centred reference and one for complex process
// chains. The roles are the mockup's People leaf, which counts 16 of the 19.
// The three turnover years are fixed, and turnoverYears(today) asks for the same three only while
// the device's year is 2026: a read-only view of the demo shows the years the demo holds, never
// the years the form would ask for, or from 2027 it shows an empty year and no average.
// Invented here, because the design gives none of them: the registration country and register,
// the six completed financial years, both certificate valid-until dates, every reference's client,
// client type, dates and value, the countries (NL, BE, DE) and the languages (nl, en, de).
export const DEMO_PROFILE: Profile = deepFreeze({
	registration: { country: 'NL', register: 'Kamer van Koophandel' },
	authorisations: [],
	securityClearances: [],
	completedFinancialYears: 6,
	turnover: [
		{
			year: 2023,
			generalNet: 1090000,
			specific: [{ businessLine: DATA_MANAGEMENT, net: 1090000 }]
		},
		{
			year: 2024,
			generalNet: 1210000,
			specific: [{ businessLine: DATA_MANAGEMENT, net: 1210000 }]
		},
		{ year: 2025, generalNet: 1240000, specific: [{ businessLine: DATA_MANAGEMENT, net: 1240000 }] }
	],
	staff: {
		total: 19,
		byRole: [
			{ role: 'Developers', count: 9 },
			{ role: 'Support and operations', count: 5 },
			{ role: 'Project leads', count: 2 }
		],
		yearlyAverages: []
	},
	insurance: [],
	certificates: [
		{ standard: 'ISO 27001', validUntil: '2027-05-31' },
		{ standard: 'ISO 9001', validUntil: '2027-11-30' }
	],
	references: [
		{
			client: 'A regional water authority',
			clientType: 'public',
			start: '2023-02-01',
			completion: '2024-06-30',
			valueNet: 420000,
			categories: ['Database'],
			performedByFirm: true
		},
		{
			client: 'A logistics company',
			clientType: 'private',
			start: '2024-03-01',
			completion: '2025-04-30',
			valueNet: 310000,
			categories: ['Complex process chains'],
			performedByFirm: true
		}
	],
	countries: ['NL', 'BE', 'DE'],
	languages: ['nl', 'en', 'de']
});
