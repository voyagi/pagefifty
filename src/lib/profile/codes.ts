// Fixed pick lists for the profile. Stored as codes (ISO 3166-1 alpha-2 and ISO 639-1) and shown
// by their English names, so an entry can never be a spelling variant of another.

export interface CodeName {
	code: string;
	name: string;
}

// The EU member states plus Iceland, Liechtenstein and Norway, by English name. Greece is GR here,
// its ISO code, not the EL the EU institutions use.
export const EU_EEA_COUNTRIES: readonly CodeName[] = [
	{ code: 'AT', name: 'Austria' },
	{ code: 'BE', name: 'Belgium' },
	{ code: 'BG', name: 'Bulgaria' },
	{ code: 'HR', name: 'Croatia' },
	{ code: 'CY', name: 'Cyprus' },
	{ code: 'CZ', name: 'Czechia' },
	{ code: 'DK', name: 'Denmark' },
	{ code: 'EE', name: 'Estonia' },
	{ code: 'FI', name: 'Finland' },
	{ code: 'FR', name: 'France' },
	{ code: 'DE', name: 'Germany' },
	{ code: 'GR', name: 'Greece' },
	{ code: 'HU', name: 'Hungary' },
	{ code: 'IS', name: 'Iceland' },
	{ code: 'IE', name: 'Ireland' },
	{ code: 'IT', name: 'Italy' },
	{ code: 'LV', name: 'Latvia' },
	{ code: 'LI', name: 'Liechtenstein' },
	{ code: 'LT', name: 'Lithuania' },
	{ code: 'LU', name: 'Luxembourg' },
	{ code: 'MT', name: 'Malta' },
	{ code: 'NL', name: 'Netherlands' },
	{ code: 'NO', name: 'Norway' },
	{ code: 'PL', name: 'Poland' },
	{ code: 'PT', name: 'Portugal' },
	{ code: 'RO', name: 'Romania' },
	{ code: 'SK', name: 'Slovakia' },
	{ code: 'SI', name: 'Slovenia' },
	{ code: 'ES', name: 'Spain' },
	{ code: 'SE', name: 'Sweden' }
];

// The 24 official languages of the EU, by English name.
export const EU_LANGUAGES: readonly CodeName[] = [
	{ code: 'bg', name: 'Bulgarian' },
	{ code: 'hr', name: 'Croatian' },
	{ code: 'cs', name: 'Czech' },
	{ code: 'da', name: 'Danish' },
	{ code: 'nl', name: 'Dutch' },
	{ code: 'en', name: 'English' },
	{ code: 'et', name: 'Estonian' },
	{ code: 'fi', name: 'Finnish' },
	{ code: 'fr', name: 'French' },
	{ code: 'de', name: 'German' },
	{ code: 'el', name: 'Greek' },
	{ code: 'hu', name: 'Hungarian' },
	{ code: 'ga', name: 'Irish' },
	{ code: 'it', name: 'Italian' },
	{ code: 'lv', name: 'Latvian' },
	{ code: 'lt', name: 'Lithuanian' },
	{ code: 'mt', name: 'Maltese' },
	{ code: 'pl', name: 'Polish' },
	{ code: 'pt', name: 'Portuguese' },
	{ code: 'ro', name: 'Romanian' },
	{ code: 'sk', name: 'Slovak' },
	{ code: 'sl', name: 'Slovenian' },
	{ code: 'es', name: 'Spanish' },
	{ code: 'sv', name: 'Swedish' }
];
