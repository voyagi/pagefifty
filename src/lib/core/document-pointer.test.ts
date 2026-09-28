import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '../ingest/read-notice';
import { DOCUMENT_POINTERS, normalizeCriterionText, pointsToDocuments } from './document-pointer';

const NBSP = String.fromCodePoint(0x00a0);
const NARROW_NBSP = String.fromCodePoint(0x202f);
const RIGHT_QUOTE = String.fromCodePoint(0x2019);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const WORD_JOINER = String.fromCodePoint(0x2060);
const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e);
const NON_BREAKING_HYPHEN = String.fromCodePoint(0x2011);

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
					expect(pointsToDocuments(text)).toBe(required(ref.pointsToDocuments, 'label'));
				}
			});
		});
	}

	it('en: the synthetic pointing criterion is labelled true and the turnover one false', () => {
		const [pointing] = criterionTexts('english-classifier', 0, 0, 'en');
		const [plain] = criterionTexts('english-classifier', 0, 1, 'en');
		expect(pointing).toContain('procurement documents');
		expect(pointsToDocuments(pointing)).toBe(true);
		expect(plain).toContain('turnover');
		expect(pointsToDocuments(plain)).toBe(false);
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

	it('reads a soft hyphen as a hyphen and drops zero-width and direction characters', () => {
		expect(normalizeCriterionText(`Vergabe${SOFT_HYPHEN}unterlagen`)).toBe('vergabe-unterlagen');
		expect(normalizeCriterionText(`Ver${ZERO_WIDTH_SPACE}gabe${WORD_JOINER}unterlagen`)).toBe(
			'vergabeunterlagen'
		);
		expect(normalizeCriterionText(`a${LEFT_TO_RIGHT_MARK}b`)).toBe('ab');
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
		expect(pointsToDocuments(pointing.normalize('NFD'))).toBe(true);
		expect(pointsToDocuments(pointing.normalize('NFC'))).toBe(true);
		const plain = 'Auszug aus dem Handelsregister, höchstens drei Monate alt';
		expect(pointsToDocuments(plain.normalize('NFD'))).toBe(false);
		expect(pointsToDocuments(plain.normalize('NFC'))).toBe(false);
	});

	it('gives a text with non-breaking spaces the label of the text with plain spaces', () => {
		const french = 'Conformément au cahier des charges, voir ci-dessous';
		for (const space of [NBSP, NARROW_NBSP]) {
			const spaced = french.replaceAll(' ', space);
			expect(pointsToDocuments(spaced)).toBe(true);
			expect(pointsToDocuments(spaced)).toBe(pointsToDocuments(french));
		}
		const english = 'as set out in the procurement documents';
		expect(pointsToDocuments(english.replaceAll(' ', NBSP))).toBe(true);
	});

	// Every list is read whatever language a text is tagged with, so a pointer written in another
	// language than its field (English in the German field) still counts.
	it('reads a pointer in any of the four languages, whatever language the text is in', () => {
		for (const text of [
			'Voir le cahier des charges',
			'See the procurement documents for the minimum turnover',
			'Zie de leidraad',
			'Siehe Leistungsbeschreibung',
			'Vedi il cahier des charges'
		]) {
			expect(pointsToDocuments(text), text).toBe(true);
		}
		expect(pointsToDocuments('Nessun documento citato')).toBe(false);
	});

	// Only the sharp s is folded, never the umlaut, so the listed "gemäss anlage" matches it.
	it('reads "gemäß Anlage" written with a sharp s as the listed phrase', () => {
		expect(pointsToDocuments('Die Referenzen sind gemäß Anlage einzureichen.')).toBe(true);
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
			expect(pointsToDocuments(text), text).toBe(true);
		}
		expect(pointsToDocuments('volgens bijlage 3 aan te leveren')).toBe(true);
	});

	// A letter names the buyer's annex as a number does; each of these read as plain before.
	it('reads an annex named by a letter alone as a pointer, and an English one named at all', () => {
		for (const text of [
			'Siehe Anlage A für die Mindestanforderungen.',
			'Die Anlagen B und C sind beizulegen.',
			'Zie bijlage A voor de minimumeisen.',
			'See Annex A for the minimum turnover requirement.',
			'The references listed in Appendix 2 are required.',
			'Complete Attachment C.'
		]) {
			expect(pointsToDocuments(text), text).toBe(true);
		}
		for (const text of [
			'Dem Angebot ist als Anlage der Auszug aus dem Handelsregister beizulegen.',
			'Attach an annex with your company profile.'
		]) {
			expect(pointsToDocuments(text), text).toBe(false);
		}
	});

	// A number may follow the word directly or after a hyphen or underscore, a letter after a
	// hyphen; each of these read as plain before.
	it('reads an annex numbered or lettered without a space as a pointer', () => {
		for (const text of [
			'Siehe Anlage6.',
			'Siehe Anlage-6.',
			'Nachweis nach Anlage_4',
			'zie bijlage3',
			'See Annex-C.',
			'Appendix-2 lists the references.'
		]) {
			expect(pointsToDocuments(text), text).toBe(true);
		}
		for (const text of [
			'Siehe das Anlagen-Verzeichnis.',
			'Die Anlagenbau-Referenz ist beizulegen.'
		]) {
			expect(pointsToDocuments(text), text).toBe(false);
		}
	});

	it('leaves a bare annex and words that only hold the letters of one plain', () => {
		for (const text of [
			'Dem Angebot ist als Anlage der Auszug aus dem Handelsregister beizulegen.',
			'Abschluss als Elektroanlagenmonteur oder Elektroniker',
			'Betrieb von Erzeugungsanlagen 3 Jahre lang',
			'Referenz im dokumentierten Anwendungsbereich'
		]) {
			expect(pointsToDocuments(text), text).toBe(false);
		}
		expect(pointsToDocuments('een planning als bijlage (maximaal een A3)')).toBe(false);
	});

	it('reads a form named by its title and the umlaut plurals of listed words as pointers', () => {
		expect(
			pointsToDocuments('Die Angaben sind im Dokument Eigenerklärungen für die Eignung zu tätigen.')
		).toBe(true);
		expect(
			pointsToDocuments('die im Erstellungsvertrag, inkl. seiner Anhänge, genannten Leistungen')
		).toBe(true);
		expect(pointsToDocuments('Die ausgefüllten Formblätter sind einzureichen.')).toBe(true);
	});

	// One sentence per phrase, each holding no other listed phrase, so dropping any one turns it red;
	// the exceptions are a word two languages share ("questionnaire") and the German "formular"
	// inside the French "formulaire", which keep each other covered.
	it('reads a questionnaire, a form to fill in and a file named by its title as pointers', () => {
		for (const text of [
			's.Fragebogen zur Eignung',
			'Eigenerklärung Russland, ausgefüllt und unterschrieben',
			'Die Referenztabellen sind für jede Referenz lückenlos auszufüllen.',
			'Die Bieter müssen die Referenztabelle vollständig ausfüllen.',
			'Vorlage der befüllten Referenzliste mit Angabe der Ansprechpartner',
			'Umsatzzahlen laut Datei "A 08 Umsatzzahlen Lose 1-2"',
			'Referenzen in den Dateien "A 08 Referenzen Los 1" und "A 08 Referenzen Los 2"',
			'Umsatzzahlen der letzten drei Jahre (Datei A 08 Umsatzzahlen)',
			'siehe geforderte Nachweise (Bietereigenerklärung, Sanktionen Russland)',
			'Vul de vragenlijst voor de selectie in.',
			'Het referentieformulier gebruiken.',
			'Een volledig ingevulde verklaring van de kandidaat.',
			'De kandidaat dient de tabel in te vullen.',
			'Répondre au questionnaire de sélection.',
			'Le formulaire de candidature signé.',
			"L'attestation dûment complétée par le client.",
			"L'attestation dûment remplie par le client.",
			'Complete the selection questionnaire.'
		]) {
			expect(pointsToDocuments(text), text).toBe(true);
		}
		expect(
			pointsToDocuments(
				'Die Darstellung sollte zwei DIN A4-Seiten als digitales Dokument nicht überschreiten.'
			)
		).toBe(false);
	});

	// French names the consultation's documents with the article ("de la consultation"), and France's
	// usual specifications are the "cahier des clauses" (administrative and technical). One phrase each.
	it('reads the French consultation documents named with their article, and the clause books', () => {
		for (const text of [
			'Voir le règlement de la consultation.',
			'Les pièces du dossier de la consultation.',
			'Conformément au cahier des clauses administratives particulières.'
		]) {
			expect(pointsToDocuments(text), text).toBe(true);
		}
		expect(pointsToDocuments('La consultation porte sur trois lots.')).toBe(false);
	});

	it('reads a title in single quotes as one in double quotes', () => {
		const low = String.fromCodePoint(0x201a);
		const left = String.fromCodePoint(0x2018);
		const [open, close] = [String.fromCodePoint(0x2039), String.fromCodePoint(0x203a)];
		expect(pointsToDocuments(`Nachweis mit der Anlage ${low}Referenzen${left} erbringen`)).toBe(
			true
		);
		expect(pointsToDocuments(`Umsatzzahlen laut Datei ${open}A 08 Umsatz${close}`)).toBe(true);
	});

	// Found at ritual p8: NFC keeps hyphens and soft hyphens, so each of these read as plain before.
	it('reads a compound written with a hyphen or split by one at a line end as the joined word', () => {
		for (const text of [
			'Nachweise gemäß den Vergabe-Unterlagen',
			'siehe Leistungs-\nbeschreibung',
			`siehe Vergabe${SOFT_HYPHEN}\nunterlagen`,
			`siehe Leistungs${NON_BREAKING_HYPHEN}verzeichnis`,
			`Zur Nachweisführung soll die Anla${SOFT_HYPHEN}ge 6a verwendet werden.`,
			'zie de aanbestedings-documenten',
			'selon le cahier des char-\nges'
		]) {
			expect(pointsToDocuments(text), text).toBe(true);
		}
		expect(pointsToDocuments('Handelsregister-Auszug, höchstens drei Monate alt')).toBe(false);
	});

	it('keeps every listed phrase a pointer when a hyphen, a line-end split or an invisible character breaks it', () => {
		const breaks = ['-', '-\n', SOFT_HYPHEN, `${SOFT_HYPHEN}\n`, ZERO_WIDTH_SPACE];
		let checked = 0;
		for (const phrases of Object.values(DOCUMENT_POINTERS)) {
			for (const phrase of phrases) {
				for (let at = 1; at < phrase.length; at += 1) {
					if (!/\p{L}/u.test(phrase[at - 1]) || !/\p{L}/u.test(phrase[at])) continue;
					for (const mark of breaks) {
						const broken = `${phrase.slice(0, at)}${mark}${phrase.slice(at)}`;
						expect(pointsToDocuments(`Siehe ${broken} unten`), broken).toBe(true);
						checked += 1;
					}
				}
			}
		}
		expect(checked).toBeGreaterThan(1000);
	});

	it('reads the annex patterns of every language in any text', () => {
		expect(pointsToDocuments('Zur Nachweisführung soll die Anlage 6a verwendet werden.')).toBe(
			true
		);
		expect(pointsToDocuments('volgens bijlage 3')).toBe(true);
		expect(pointsToDocuments('Voir Annex 3')).toBe(true);
	});

	test.prop([
		fc.constantFrom(...(['de', 'nl', 'fr', 'en'] as const)),
		fc.nat(),
		fc.string(),
		fc.string()
	])('labels any text holding a listed phrase as pointing', (lang, pick, before, after) => {
		const phrases = DOCUMENT_POINTERS[lang];
		const phrase = phrases[pick % phrases.length];
		expect(pointsToDocuments(`${before} ${phrase.toUpperCase()} ${after}`)).toBe(true);
	});

	test.prop([fc.string({ unit: 'grapheme' })])(
		'gives the NFC and NFD forms of any text the same label',
		(text) => {
			expect(pointsToDocuments(text.normalize('NFD'))).toBe(
				pointsToDocuments(text.normalize('NFC'))
			);
		}
	);
});
