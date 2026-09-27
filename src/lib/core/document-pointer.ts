// Whether a criterion's own text sends the reader to the procurement documents. A notice-only lot
// can reach GO only when none of its criteria does, so a doubtful phrase counts as a pointer: more
// reading can only make a verdict worse, never better.
// Imported by src/lib/ingest/record.ts at build time under Node type stripping: erasable syntax only.

type PointerLanguage = 'de' | 'nl' | 'fr' | 'en';

const anyOf = (...codePoints: number[]) =>
	new RegExp(`[${String.fromCodePoint(...codePoints)}]`, 'gu');

// Left and right single quotes and the modifier apostrophe; low-9, left and right double quotes and
// both guillemets. Notices quote a document's title with any of them.
const APOSTROPHES = anyOf(0x2018, 0x2019, 0x02bc);
const QUOTES = anyOf(0x201c, 0x201d, 0x201e, 0x00ab, 0x00bb);

// NFC so a decomposed umlaut and its composed form become one string; sharp s folded so Swiss
// spelling and upper-cased text match; every space kind (U+00A0 and U+202F included, which \s
// matches) collapsed, so a phrase split by a line break or a non-breaking space still matches.
export function normalizeCriterionText(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFC')
		.replaceAll('ß', 'ss')
		.replace(APOSTROPHES, "'")
		.replace(QUOTES, '"')
		.replace(/\s+/gu, ' ')
		.trim();
}

// A web address in a criterion sends the reader outside the notice, whatever the language.
const ADDRESSES = ['https://', 'http://', 'www.'];

// Phrases taken from the criterion texts of the 2026-09-15 capture, matched as substrings of the
// normalised text so German compounds and plurals match their stem. A bare "Anlage", "bijlage" or
// "Unterlagen" is left out: it names what the tenderer attaches, not the buyer's documents, so an
// annex counts only when it is quoted, bracketed, cited "gemäß Anlage" or said to be enclosed.
const PHRASES: Readonly<Record<PointerLanguage, readonly string[]>> = {
	de: [
		'vergabeunterlage',
		'ausschreibungsunterlage',
		'auftragsunterlage',
		'vertragsunterlage',
		'leistungsbeschreibung',
		'leistungsverzeichnis',
		'bewerbungsbedingungen',
		'teilnahmebedingungen',
		'verfahrensbedingungen',
		'vergabeplattform',
		'hinterlegt',
		'formblatt',
		'formular',
		'vordruck',
		'gemäss anlage',
		'anlage "',
		'(anlage',
		'anhang',
		'dokument "',
		'(dokument',
		'siehe dokument',
		'den beigefügten',
		'die beigefügten',
		'beiliegend',
		'folgendem link',
		'direktlink',
		'eignungskriterien finden',
		...ADDRESSES
	],
	nl: [
		'leidraad',
		'aanbestedingsdocument',
		'aanbestedingsstuk',
		'opdrachtdocument',
		'bestek',
		'in bijlage',
		'(bijlage',
		...ADDRESSES
	],
	fr: [
		'annexe',
		'cahier des charges',
		'cahier spécial des charges',
		'documents du marché',
		'documents de marché',
		'dossier de consultation',
		'règlement de consultation',
		'formulaire de soumission',
		"formulaire d'offre",
		...ADDRESSES
	],
	en: [
		'procurement document',
		'tender document',
		'tendering document',
		'contract document',
		'invitation to tender',
		'terms of reference',
		...ADDRESSES
	]
};

export const DOCUMENT_POINTERS: Readonly<Record<PointerLanguage, readonly string[]>> = {
	de: PHRASES.de.map(normalizeCriterionText),
	nl: PHRASES.nl.map(normalizeCriterionText),
	fr: PHRASES.fr.map(normalizeCriterionText),
	en: PHRASES.en.map(normalizeCriterionText)
};

const EVERY_PHRASE: readonly string[] = [...new Set(Object.values(DOCUMENT_POINTERS).flat())];

function phrasesFor(lang: string | undefined): readonly string[] {
	const primary = lang?.split('-')[0].toLowerCase();
	return primary !== undefined && Object.hasOwn(DOCUMENT_POINTERS, primary)
		? DOCUMENT_POINTERS[primary as PointerLanguage]
		: EVERY_PHRASE;
}

export function pointsToDocuments(text: string, lang?: string): boolean {
	const normalized = normalizeCriterionText(text);
	return phrasesFor(lang).some((phrase) => normalized.includes(phrase));
}
