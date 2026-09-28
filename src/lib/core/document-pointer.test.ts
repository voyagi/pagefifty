import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '../ingest/read-notice';
import { DOCUMENT_POINTERS, normalizeCriterionText, pointsToDocuments } from './document-pointer';

const NBSP = String.fromCodePoint(0x00a0);
const NARROW_NBSP = String.fromCodePoint(0x202f);
const RIGHT_QUOTE = String.fromCodePoint(0x2019);

const CAPTURE_CLASSIFIERS = {
	de: 'german-classifier',
	nl: 'dutch-classifier',
	fr: 'french-classifier'
} as const;

function required<T>(value: T | undefined, what: string): T {
	if (value === undefined) throw new Error(`the fixture role gives no ${what}`);
	return value;
}

function criterionTexts(role: RoleName, which: number, criterion: number, lang: string): string[] {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	const descriptions = result.record.lots[0].criteria[criterion]?.descriptions ?? [];
	const texts = descriptions.filter((each) => each.lang === lang).map((each) => each.text);
	if (texts.length === 0) throw new Error(`${role} has no ${lang} text for criterion ${criterion}`);
	return texts;
}

describe('the classifier on the capture, one pointing and one plain criterion per language', () => {
	for (const [lang, role] of Object.entries(CAPTURE_CLASSIFIERS)) {
		const refs = FIXTURE_ROLES[role].notices;

		it(`${lang}: the ${role} role holds one pointing and one plain criterion`, () => {
			expect(refs.map((ref) => ref.pointsToDocuments).sort()).toEqual([false, true]);
		});

		refs.forEach((ref, which) => {
			it(`${lang}: ${ref.notice} criterion ${ref.criterion} is labelled ${ref.pointsToDocuments}`, () => {
				const criterion = required(ref.criterion, 'criterion index');
				const texts = criterionTexts(role, which, criterion, lang);
				expect(texts.join(' ')).toContain(required(ref.evidence, 'evidence'));
				for (const text of texts) {
					expect(pointsToDocuments(text, lang)).toBe(required(ref.pointsToDocuments, 'label'));
				}
			});
		});
	}

	it('en: the synthetic pointing criterion is labelled true and the turnover one false', () => {
		const [pointing] = criterionTexts('english-classifier', 0, 0, 'en');
		const [plain] = criterionTexts('english-classifier', 0, 1, 'en');
		expect(pointing).toContain('procurement documents');
		expect(pointsToDocuments(pointing, 'en')).toBe(true);
		expect(plain).toContain('turnover');
		expect(pointsToDocuments(plain, 'en')).toBe(false);
	});
});

describe('normalizeCriterionText', () => {
	it('lower-cases and collapses every space kind, line breaks included, to one space', () => {
		const text = `  Abschliessende\tLISTE\n\nin${NBSP}den${NARROW_NBSP}Vergabeunterlagen  `;
		expect(normalizeCriterionText(text)).toBe('abschliessende liste in den vergabeunterlagen');
	});

	it('composes a decomposed letter', () => {
		const decomposed = 'Prüfung'.normalize('NFD');
		expect(decomposed).not.toBe('Prüfung'.normalize('NFC'));
		expect(normalizeCriterionText(decomposed)).toBe('prüfung'.normalize('NFC'));
	});

	it('reads a typographic apostrophe as the plain one', () => {
		expect(normalizeCriterionText(`formulaire d${RIGHT_QUOTE}offre`)).toBe("formulaire d'offre");
	});

	test.prop([fc.string({ unit: 'grapheme' })])('is idempotent', (text) => {
		const once = normalizeCriterionText(text);
		expect(normalizeCriterionText(once)).toBe(once);
	});
});

describe('DOCUMENT_POINTERS', () => {
	it('holds a phrase list for German, Dutch, French and English', () => {
		expect(Object.keys(DOCUMENT_POINTERS).sort()).toEqual(['de', 'en', 'fr', 'nl']);
		for (const phrases of Object.values(DOCUMENT_POINTERS)) {
			expect(phrases.length).toBeGreaterThan(0);
		}
	});

	it('holds every phrase in the normalised form it is matched in', () => {
		for (const phrases of Object.values(DOCUMENT_POINTERS)) {
			for (const phrase of phrases) expect(normalizeCriterionText(phrase)).toBe(phrase);
		}
	});

	it('names the documents words the capture uses in each language', () => {
		expect(DOCUMENT_POINTERS.de).toContain('vergabeunterlage');
		expect(DOCUMENT_POINTERS.nl).toContain('leidraad');
		expect(DOCUMENT_POINTERS.fr).toContain('cahier des charges');
		expect(DOCUMENT_POINTERS.en).toContain('procurement document');
	});
});

describe('pointsToDocuments', () => {
	const pointing = 'Allgemeine Hinweise: abschließende Liste in den Vergabeunterlagen';

	it('gives NFC and NFD forms of one text the same label', () => {
		expect(pointsToDocuments(pointing.normalize('NFD'), 'de')).toBe(true);
		expect(pointsToDocuments(pointing.normalize('NFC'), 'de')).toBe(true);
		const plain = 'Auszug aus dem Handelsregister, höchstens drei Monate alt';
		expect(pointsToDocuments(plain.normalize('NFD'), 'de')).toBe(false);
		expect(pointsToDocuments(plain.normalize('NFC'), 'de')).toBe(false);
	});

	it('gives a text with non-breaking spaces the label of the text with plain spaces', () => {
		const french = 'Conformément au cahier des charges, voir ci-dessous';
		for (const space of [NBSP, NARROW_NBSP]) {
			const spaced = french.replaceAll(' ', space);
			expect(pointsToDocuments(spaced, 'fr')).toBe(true);
			expect(pointsToDocuments(spaced, 'fr')).toBe(pointsToDocuments(french, 'fr'));
		}
		const english = 'as set out in the procurement documents';
		expect(pointsToDocuments(english.replaceAll(' ', NBSP), 'en')).toBe(true);
	});

	it('checks only the list of a known language', () => {
		expect(pointsToDocuments('Voir le cahier des charges', 'fr')).toBe(true);
		expect(pointsToDocuments('Voir le cahier des charges', 'de')).toBe(false);
	});

	it('checks every list when the language is unknown or has no list', () => {
		expect(pointsToDocuments('Voir le cahier des charges', undefined)).toBe(true);
		expect(pointsToDocuments('Vedi il cahier des charges', 'it')).toBe(true);
		expect(pointsToDocuments('Nessun documento citato', 'it')).toBe(false);
	});

	it('reads an annex the documents number as a pointer, in each spelling the capture uses', () => {
		for (const text of [
			'Zur Nachweisführung soll die Anlage 6a verwendet werden.',
			'durch zwei Referenzprojekte in der Anlage B-09 nachgewiesen',
			'muss die "Anlage 06 - Bieterauskunft mit Eigenerklärung" ausgefüllt beigefügt sein',
			'Nachweis: Eigenerklärung, Anlage 02_Erklärung zur Eignung',
			'Zur Angabe der Referenzen wird auf die Anlage 2f5 verwiesen.',
			'Die Anlagen 1 bis 3 sind auszufüllen.',
			'Anlage Nr. 4 ist beizulegen.'
		]) {
			expect(pointsToDocuments(text, 'de'), text).toBe(true);
		}
		expect(pointsToDocuments('volgens bijlage 3 aan te leveren', 'nl')).toBe(true);
	});

	it('leaves a bare annex and words that only hold the letters of one plain', () => {
		for (const text of [
			'Dem Angebot ist als Anlage der Auszug aus dem Handelsregister beizulegen.',
			'Abschluss als Elektroanlagenmonteur oder Elektroniker',
			'Betrieb von Erzeugungsanlagen 3 Jahre lang',
			'Referenz im dokumentierten Anwendungsbereich'
		]) {
			expect(pointsToDocuments(text, 'de'), text).toBe(false);
		}
		expect(pointsToDocuments('een planning als bijlage (maximaal een A3)', 'nl')).toBe(false);
	});

	it('reads a form named by its title and the umlaut plurals of listed words as pointers', () => {
		expect(
			pointsToDocuments(
				'Die Angaben sind im Dokument Eigenerklärungen für die Eignung zu tätigen.',
				'de'
			)
		).toBe(true);
		expect(
			pointsToDocuments(
				'die im Erstellungsvertrag, inkl. seiner Anhänge, genannten Leistungen',
				'de'
			)
		).toBe(true);
		expect(pointsToDocuments('Die ausgefüllten Formblätter sind einzureichen.', 'de')).toBe(true);
	});

	// One sentence per phrase, each holding no other listed phrase, so dropping any one turns it red.
	it('reads a questionnaire, a form to fill in and a file named by its title as pointers', () => {
		for (const [lang, text] of [
			['de', 's.Fragebogen zur Eignung'],
			['de', 'Eigenerklärung Russland, ausgefüllt und unterschrieben'],
			['de', 'Die Referenztabellen sind für jede Referenz lückenlos auszufüllen.'],
			['de', 'Die Bieter müssen die Referenztabelle vollständig ausfüllen.'],
			['de', 'Vorlage der befüllten Referenzliste mit Angabe der Ansprechpartner'],
			['de', 'Umsatzzahlen laut Datei "A 08 Umsatzzahlen Lose 1-2"'],
			['de', 'Referenzen in den Dateien "A 08 Referenzen Los 1" und "A 08 Referenzen Los 2"'],
			['de', 'Umsatzzahlen der letzten drei Jahre (Datei A 08 Umsatzzahlen)'],
			['de', 'siehe geforderte Nachweise (Bietereigenerklärung, Sanktionen Russland)'],
			['nl', 'Vul de vragenlijst voor de selectie in.'],
			['fr', 'Répondre au questionnaire de sélection.'],
			['en', 'Complete the selection questionnaire.']
		]) {
			expect(pointsToDocuments(text, lang), text).toBe(true);
		}
		expect(
			pointsToDocuments(
				'Die Darstellung sollte zwei DIN A4-Seiten als digitales Dokument nicht überschreiten.',
				'de'
			)
		).toBe(false);
	});

	it('checks every pattern when the language is unknown', () => {
		expect(pointsToDocuments('Zur Nachweisführung soll die Anlage 6a verwendet werden.')).toBe(
			true
		);
		expect(pointsToDocuments('volgens bijlage 3', 'it')).toBe(true);
	});

	it('reads a regional language tag by its primary subtag', () => {
		expect(pointsToDocuments('Siehe Leistungsbeschreibung', 'de-AT')).toBe(true);
		expect(pointsToDocuments('Siehe Leistungsbeschreibung', 'DE')).toBe(true);
	});

	test.prop([
		fc.constantFrom(...(['de', 'nl', 'fr', 'en'] as const)),
		fc.nat(),
		fc.string(),
		fc.string()
	])('labels any text holding a listed phrase as pointing', (lang, pick, before, after) => {
		const phrases = DOCUMENT_POINTERS[lang];
		const phrase = phrases[pick % phrases.length];
		expect(pointsToDocuments(`${before} ${phrase.toUpperCase()} ${after}`, lang)).toBe(true);
	});

	test.prop([fc.string({ unit: 'grapheme' }), fc.constantFrom('de', 'nl', 'fr', 'en', undefined)])(
		'gives the NFC and NFD forms of any text the same label',
		(text, lang) => {
			expect(pointsToDocuments(text.normalize('NFD'), lang)).toBe(
				pointsToDocuments(text.normalize('NFC'), lang)
			);
		}
	);
});
