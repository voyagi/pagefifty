// Whether a criterion's own text sends the reader to the procurement documents. A notice-only lot
// can reach GO only when none of its criteria does, so a doubtful phrase counts as a pointer: more
// reading can only make a verdict worse, never better.
// Imported by src/lib/ingest/record.ts at build time under Node type stripping: erasable syntax only.

type PointerLanguage = 'de' | 'nl' | 'fr' | 'en';

const anyOf = (...codePoints: number[]) =>
	new RegExp(`[${String.fromCodePoint(...codePoints)}]`, 'gu');

// Left and right single quotes and the modifier apostrophe; low-9, left and right double quotes, the
// low-9 single quote German opens a nested title with, and double and single guillemets. Notices
// quote a document's title with any of them, so all read as one quote mark.
const APOSTROPHES = anyOf(0x2018, 0x2019, 0x02bc);
const QUOTES = anyOf(0x201c, 0x201d, 0x201e, 0x00ab, 0x00bb, 0x201a, 0x2039, 0x203a);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);

// A soft hyphen marks where a word may break, so it reads as the hyphen it prints as; the other
// invisible format characters (zero-width spaces and joiners, direction marks) are dropped, since
// NFC keeps them and one inside a word would hide a phrase. Dropped first, so the NFC below can
// compose what they stood between. NFC so a decomposed umlaut and its composed form become one
// string; sharp s folded so Swiss spelling and upper-cased text match; every space kind (U+00A0
// and U+202F included, which \s matches) collapsed, so a phrase split by a line break or a
// non-breaking space still matches.
export function normalizeCriterionText(text: string): string {
	return text
		.replaceAll(SOFT_HYPHEN, '-')
		.replace(/\p{Cf}/gu, '')
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

// Phrases taken from the criterion texts of the 2026-09-15 capture, plus each language's usual names
// for the procurement documents and for a buyer's questionnaire (most French and English ones match
// no criterion of that capture; go-rule.test.ts pins what the list decides there). Matched as
// substrings of the normalised text so German compounds and plurals match their stem; a plural whose
// umlaut breaks the stem ("Anhänge", "Formblätter") is listed beside it. A form, one the tenderer fills
// in ("ausgefüllt", "ingevuld", "dûment complété") and a file named by its title ('Datei "A 08 ..."')
// are the buyer's, so in every language they point there as a questionnaire does. A bare "Anlage", "bijlage" or "Unterlagen" is
// left out: it names what the tenderer attaches, not the buyer's documents, so an annex counts only
// when it is quoted, bracketed, numbered, cited "gemäß Anlage" or said to be enclosed.
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
		'formblätter',
		'formular',
		'vordruck',
		'fragebogen',
		'ausgefüllt',
		'auszufüllen',
		'ausfüllen',
		'befüllt',
		'gemäss anlage',
		'anlage "',
		'(anlage',
		'anhang',
		'anhänge',
		'dokument "',
		'(dokument',
		'datei "',
		'dateien "',
		'(datei',
		'siehe dokument',
		'siehe geforderte nachweise',
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
		'vragenlijst',
		'formulier',
		'ingevuld',
		'in te vullen',
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
		'formulaire',
		'dûment complété',
		'dûment rempli',
		'questionnaire',
		...ADDRESSES
	],
	en: [
		'procurement document',
		'tender document',
		'tendering document',
		'contract document',
		'invitation to tender',
		'terms of reference',
		'questionnaire',
		...ADDRESSES
	]
};

export const DOCUMENT_POINTERS: Readonly<Record<PointerLanguage, readonly string[]>> = {
	de: PHRASES.de.map(normalizeCriterionText),
	nl: PHRASES.nl.map(normalizeCriterionText),
	fr: PHRASES.fr.map(normalizeCriterionText),
	en: PHRASES.en.map(normalizeCriterionText)
};

// An annex with a number, a letter, or both ("Anlage 6a", "Anlage B-09", "Anlage A", "Anlage
// 02_Erklärung", "bijlage 3", "Annex C") is named by the buyer's documents, so it points there
// unquoted; an English annex, appendix or attachment counts only so, since a bare one may be what
// the tenderer attaches, as a bare "Anlage" is. A number may follow the word directly or after a
// hyphen or underscore ("Anlage6", "Anlage-6"); a letter alone needs a space or hyphen first
// ("Annex-C"), since "Anlagen" itself ends in a letter. Matched on normalised text, so letters are
// lower case and every space is one space; no letter may stand before the word, so
// "Elektroanlagen" stays plain.
const ANNEX_ID = String.raw`(?:[ _-]?(?:(?:nr|no)\. ?)?[a-z]?[-.]?\d|[ -](?:(?:nr|no)\. ?)?[a-z](?!\p{L}))`;
const annex = (words: string) => new RegExp(String.raw`(?<!\p{L})(?:${words})${ANNEX_ID}`, 'u');

// "im Dokument" names a document by its title, as a quoted title after "Dokument" does.
const PATTERNS: Readonly<Record<PointerLanguage, readonly RegExp[]>> = {
	de: [annex('anlagen?'), /(?<!\p{L})im dokument(?!\p{L})/u],
	nl: [annex('bijlagen?')],
	fr: [],
	en: [annex('annex(?:es)?|appendix|appendices|attachments?')]
};

// Every language's list is checked, whatever language a text is tagged with: a buyer can write
// English in the German field, and a pointer in any language can only make a verdict more careful.
// On the 2026-09-15 capture this finds exactly what each text's own list finds (ritual p6).
const EVERY_PHRASE: readonly string[] = [...new Set(Object.values(DOCUMENT_POINTERS).flat())];
const EVERY_PATTERN: readonly RegExp[] = Object.values(PATTERNS).flat();

// A compound written with a hyphen ("Vergabe-Unterlagen", "aanbestedings-documenten"), or split by
// one at a line end ("Leistungs- beschreibung" once spaces are collapsed), names the same document
// as the joined word. Both readings are checked, so a hyphen can add a match but never hide one.
const HYPHEN_IN_WORD = /(?<=\p{L})[-\u2010\u2011] ?(?=\p{L})/gu;

export function pointsToDocuments(text: string): boolean {
	const normalized = normalizeCriterionText(text);
	return [normalized, normalized.replace(HYPHEN_IN_WORD, '')].some(
		(reading) =>
			EVERY_PHRASE.some((phrase) => reading.includes(phrase)) ||
			EVERY_PATTERN.some((pattern) => pattern.test(reading))
	);
}
