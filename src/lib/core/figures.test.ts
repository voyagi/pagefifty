import { describe, expect, it } from 'vitest';
import { replyRequirements } from '../../test/fixtures/replies';
import {
	amountsIn,
	parseCount,
	parseMoney,
	parsePeriod,
	parseStandards,
	sameNumber,
	type CountReading,
	type MoneyReading,
	type PeriodReading,
	type StandardsReading
} from './figures';

const char = (codePoint: number) => String.fromCodePoint(codePoint);
const NBSP = char(0x00a0);
const NARROW_NBSP = char(0x202f);
const THIN = char(0x2009);

const one = (
	cents: number,
	basis: 'net' | 'gross' | 'unstated' = 'unstated',
	comparator: 'at-least' | 'more-than' | 'unstated' = 'unstated'
): MoneyReading => ({ kind: 'one', cents, basis, comparator });
const NONE: MoneyReading = { kind: 'none' };
const SEVERAL: MoneyReading = { kind: 'several' };

describe('parseMoney on a recorded reply', () => {
	it('the German turnover floor parses to 10000000 cents net, at least', () => {
		const turnover = replyRequirements('de-610242-thinking-off')[2];
		expect(turnover.criterion).toBe(3);
		const reading = parseMoney(turnover.quote, 'de');
		expect(reading).toEqual({
			kind: 'one',
			cents: 10_000_000,
			basis: 'net',
			comparator: 'at-least'
		});
		expect(sameNumber('100.000,00 Euro netto', reading, 'de')).toBe(true);
	});

	it('the French and Dutch turnover floors of spike 004 parse to cents with their basis', () => {
		const [general, specific] = replyRequirements('fr-629755-default-tab');
		expect(parseMoney(general.quote, 'fr')).toEqual(one(50_000_000, 'gross', 'at-least'));
		expect(parseMoney(specific.quote, 'fr')).toEqual(one(25_000_000, 'gross', 'at-least'));
		const [dutch] = replyRequirements('nl-634398-super');
		expect(parseMoney(dutch.quote, 'nl')).toEqual(one(62_500_000, 'net', 'at-least'));
		expect(sameNumber(dutch.numberText, parseMoney(dutch.quote, 'nl'), 'nl')).toBe(true);
	});
});

describe('parseMoney forms', () => {
	it.each([
		['1.500.000,00 €', 'de', one(150_000_000)],
		['1 500 000 EUR', 'fr', one(150_000_000)],
		[`1${NBSP}500${NBSP}000 EUR`, 'fr', one(150_000_000)],
		[`1${NARROW_NBSP}500${NARROW_NBSP}000 EUR`, 'fr', one(150_000_000)],
		[`1${THIN}500${THIN}000,00 €`, 'fr', one(150_000_000)],
		['2,5 Mio. EUR', 'de', one(250_000_000)],
		['500 TEUR', 'de', one(50_000_000)],
		['500 T€', 'de', one(50_000_000)],
		['5 M€', 'fr', one(500_000_000)],
		['100.000,00 € TVAC', 'fr', one(10_000_000, 'gross')],
		['€ 625.000 excl. btw', 'nl', one(62_500_000, 'net')],
		['100.000,00 Euro netto', 'de', one(10_000_000, 'net')],
		['5 Mio. EUR', 'de', one(500_000_000)],
		['3 Millionen Euro', 'de', one(300_000_000)],
		['1,2 mln euro', 'nl', one(120_000_000)],
		['2 miljoen euro', 'nl', one(200_000_000)],
		['4 millions d’euros', 'fr', one(400_000_000)],
		['4 millions euros', 'fr', one(400_000_000)],
		['EUR 1,500,000', 'en', one(150_000_000)],
		['EUR 1,500,000.50', 'en', one(150_000_050)],
		['1.5 million EUR', 'en', one(150_000_000)],
		['EUR 2 million', 'en', one(200_000_000)],
		['100.000€', 'de', one(10_000_000)],
		['€100.000', 'nl', one(10_000_000)],
		['1.500 EUR', 'de', one(150_000)],
		['1,500 EUR', 'fr', one(150_000)],
		['1,500 EUR', 'en', one(150_000)],
		['1.500,5 €', 'de', one(150_050)],
		['250000 EUR', 'de', one(25_000_000)],
		['0,29 Mio. EUR', 'de', one(29_000_000)],
		['45.035.996.273.704,95 €', 'de', one(4_503_599_627_370_495)]
	] as const)('parseMoney reads %s (%s)', (text, lang, expected) => {
		expect(parseMoney(text, lang)).toEqual(expected);
	});
});

describe('parseMoney refusals', () => {
	it.each([
		['1.240', 'de', NONE],
		['a) 5 Mio. EUR b) 3 Mio. EUR', 'de', SEVERAL],
		['zwischen 100.000 EUR und 200.000 EUR', 'de', SEVERAL],
		['2 Mrd. EUR', 'de', NONE],
		['500 k€', 'fr', NONE],
		['3 MEUR', 'fr', NONE],
		['EUR 2 Mrd.', 'de', NONE],
		['1.234,567 €', 'de', NONE],
		['1.500 EUR', 'en', NONE],
		['1.500 EUR', undefined, NONE],
		['1,500 EUR', undefined, NONE],
		['1.50.000 EUR', 'de', NONE],
		['12345.678.000 EUR', 'de', NONE],
		['1,5.000 EUR', 'de', NONE],
		['2023 100 EUR', 'de', NONE],
		['99.999.999.999.999.999 EUR', 'de', NONE],
		['1.123456789 Mio. EUR', 'en', NONE],
		['kein Betrag genannt', 'de', NONE]
	] as const)('parseMoney refuses %s (%s)', (text, lang, expected) => {
		expect(parseMoney(text, lang)).toEqual(expected);
	});
});

describe('parseMoney basis words', () => {
	it.each([
		['netto', 'de', 'net'],
		['ohne MwSt.', 'de', 'net'],
		['excl. btw', 'nl', 'net'],
		['exclusief btw', 'nl', 'net'],
		['hors TVA', 'fr', 'net'],
		['HTVA', 'fr', 'net'],
		['HT', 'fr', 'net'],
		['excl. VAT', 'en', 'net'],
		['net', 'en', 'net'],
		['brutto', 'de', 'gross'],
		['inkl. MwSt.', 'de', 'gross'],
		['incl. btw', 'nl', 'gross'],
		['inclusief btw', 'nl', 'gross'],
		['TVAC', 'fr', 'gross'],
		['TTC', 'fr', 'gross'],
		['TVA comprise', 'fr', 'gross'],
		['incl. VAT', 'en', 'gross'],
		['gross', 'en', 'gross'],
		['netto oder brutto', 'de', 'unstated'],
		['net als vorig jaar', 'nl', 'unstated'],
		['', 'de', 'unstated'],
		['Nettoumsatz', 'de', 'unstated']
	] as const)('the basis word "%s" (%s) reads %s', (word, lang, basis) => {
		const amount = lang === 'en' ? 'EUR 100,000.00' : '100.000,00 EUR';
		expect(parseMoney(`Umsatz ${amount} ${word}`.trim(), lang)).toEqual(one(10_000_000, basis));
	});
});

describe('parseMoney comparator words', () => {
	it.each([
		['mindestens', 'de', 'at-least'],
		['min.', 'de', 'at-least'],
		['Mindestanforderung', 'de', 'at-least'],
		['Mindestumsatz', 'de', 'at-least'],
		['Mindestjahresumsatz', 'de', 'at-least'],
		['minimaal', 'nl', 'at-least'],
		['minimale', 'nl', 'at-least'],
		['minstens', 'nl', 'at-least'],
		['ten minste', 'nl', 'at-least'],
		['au minimum', 'fr', 'at-least'],
		['minimum', 'fr', 'at-least'],
		['minimal', 'fr', 'at-least'],
		['au moins', 'fr', 'at-least'],
		['at least', 'en', 'at-least'],
		['not less than', 'en', 'at-least'],
		['mehr als', 'de', 'more-than'],
		['über', 'de', 'more-than'],
		['meer dan', 'nl', 'more-than'],
		['plus de', 'fr', 'more-than'],
		['supérieur à', 'fr', 'more-than'],
		['more than', 'en', 'more-than'],
		['exceeding', 'en', 'more-than'],
		['mindestens mehr als', 'de', 'unstated'],
		['Umsatz von', 'de', 'unstated'],
		['minimalistisch', 'de', 'unstated']
	] as const)('the comparator word "%s" (%s) reads %s', (word, lang, comparator) => {
		const amount = lang === 'en' ? 'EUR 100,000.00' : '100.000,00 EUR';
		expect(parseMoney(`${word} ${amount}`, lang)).toEqual(one(10_000_000, 'unstated', comparator));
	});
});

describe('parseCount', () => {
	const count = (value: number): CountReading => ({ kind: 'one', count: value });

	it.each([
		['3 Mitarbeiter', 'de', 3],
		['12 Mitarbeitende', 'de', 12],
		['25 Beschäftigte', 'de', 25],
		['4 VZÄ', 'de', 4],
		['10 medewerkers', 'nl', 10],
		['8 werknemers', 'nl', 8],
		['5 fte', 'nl', 5],
		['20 personnes', 'fr', 20],
		['15 salariés', 'fr', 15],
		['9 employés', 'fr', 9],
		['30 employees', 'en', 30],
		['7 staff', 'en', 7],
		['6 FTE', 'en', 6],
		['1.200 Mitarbeiter', 'de', 1200]
	] as const)('parseCount reads %s (%s)', (text, lang, value) => {
		expect(parseCount(`mindestens ${text} im Jahresdurchschnitt`, lang)).toEqual(count(value));
	});

	it.each([
		['de', 'eins', 1],
		['de', 'ein', 1],
		['de', 'eine', 1],
		['de', 'einen', 1],
		['de', 'zwei', 2],
		['de', 'drei', 3],
		['de', 'vier', 4],
		['de', 'fünf', 5],
		['de', 'sechs', 6],
		['de', 'sieben', 7],
		['de', 'acht', 8],
		['de', 'neun', 9],
		['de', 'zehn', 10],
		['de', 'elf', 11],
		['de', 'zwölf', 12],
		['nl', 'een', 1],
		['nl', 'één', 1],
		['nl', 'twee', 2],
		['nl', 'drie', 3],
		['nl', 'vier', 4],
		['nl', 'vijf', 5],
		['nl', 'zes', 6],
		['nl', 'zeven', 7],
		['nl', 'acht', 8],
		['nl', 'negen', 9],
		['nl', 'tien', 10],
		['nl', 'elf', 11],
		['nl', 'twaalf', 12],
		['fr', 'un', 1],
		['fr', 'une', 1],
		['fr', 'deux', 2],
		['fr', 'trois', 3],
		['fr', 'quatre', 4],
		['fr', 'cinq', 5],
		['fr', 'six', 6],
		['fr', 'sept', 7],
		['fr', 'huit', 8],
		['fr', 'neuf', 9],
		['fr', 'dix', 10],
		['fr', 'onze', 11],
		['fr', 'douze', 12],
		['en', 'one', 1],
		['en', 'two', 2],
		['en', 'three', 3],
		['en', 'four', 4],
		['en', 'five', 5],
		['en', 'six', 6],
		['en', 'seven', 7],
		['en', 'eight', 8],
		['en', 'nine', 9],
		['en', 'ten', 10],
		['en', 'eleven', 11],
		['en', 'twelve', 12]
	] as const)('parseCount reads the %s number word %s as %i', (lang, word, value) => {
		const noun = { de: 'Mitarbeiter', nl: 'medewerkers', fr: 'personnes', en: 'employees' }[lang];
		expect(parseCount(`${word} ${noun}`, lang)).toEqual(count(value));
	});

	it.each([
		['3 Mitarbeiter und 2 Beschäftigte', 'de', { kind: 'several' }],
		['mindestens 3 erfahrene Mitarbeiter', 'de', { kind: 'none' }],
		['2,5 FTE', 'nl', { kind: 'none' }],
		['dreizehn Mitarbeiter', 'de', { kind: 'none' }],
		['3 Mitarbeiterinnen', 'de', { kind: 'one', count: 3 }],
		['drie medewerkers', 'de', { kind: 'none' }],
		['drei Mitarbeiter', 'it', { kind: 'one', count: 3 }],
		['5 staffing agencies', 'en', { kind: 'none' }],
		['keine Angabe', 'de', { kind: 'none' }]
	] as const)('parseCount reads %s (%s) as given', (text, lang, expected) => {
		expect(parseCount(text, lang)).toEqual(expected);
	});
});

describe('parsePeriod', () => {
	const period = (
		mode: PeriodReading['mode'],
		years: number | null = null,
		named: number[] = []
	): PeriodReading => ({ mode, years, yearsUnread: false, named });

	it.each([
		['durchschnittlichen Jahresumsatz', 'de', 'average'],
		['im Durchschnitt', 'de', 'average'],
		['gemiddeld', 'nl', 'average'],
		['de gemiddelde omzet', 'nl', 'average'],
		['chiffre d’affaires moyen', 'fr', 'average'],
		['la moyenne', 'fr', 'average'],
		['average turnover', 'en', 'average'],
		['jährlich', 'de', 'each'],
		['pro Jahr', 'de', 'each'],
		['je Geschäftsjahr', 'de', 'each'],
		['per jaar', 'nl', 'each'],
		['jaarlijks', 'nl', 'each'],
		['par an', 'fr', 'each'],
		['par année', 'fr', 'each'],
		['per year', 'en', 'each'],
		['each year', 'en', 'each'],
		['yearly', 'en', 'each'],
		['insgesamt', 'de', 'sum'],
		['kumuliert', 'de', 'sum'],
		['samen', 'nl', 'sum'],
		['cumulé', 'fr', 'sum'],
		['in total', 'en', 'sum'],
		['combined', 'en', 'sum'],
		['in einem der', 'de', 'any-one'],
		['in één van', 'nl', 'any-one'],
		['au cours d’un des', 'fr', 'any-one'],
		["au cours d'un des", 'fr', 'any-one'],
		['in any one of', 'en', 'any-one'],
		['durchschnittlich und insgesamt', 'de', 'unstated'],
		['Umsatz', 'de', 'unstated'],
		['jährlichen', 'de', 'unstated']
	] as const)('parsePeriod reads the mode in "%s" (%s) as %s', (text, lang, mode) => {
		expect(parsePeriod(text, lang)).toEqual(period(mode));
	});

	it.each([
		['der letzten drei abgeschlosse-nen Geschäftsjahre', 'de', 3],
		['in den letzten drei Geschäftsjahren', 'de', 3],
		['der letzten 3 Jahre', 'de', 3],
		['in den letzten fünf Jahren', 'de', 5],
		['over de laatste drie beschikbare boekjaren', 'nl', 3],
		['gedurende de laatste vijf jaar', 'nl', 5],
		['les trois derniers exercices', 'fr', 3],
		['au cours des trois dernières années', 'fr', 3],
		['the last three financial years', 'en', 3],
		['in the last 2 years', 'en', 2],
		['in each of the last two completed financial years', 'en', 2],
		['the three most recent financial years', 'en', 3],
		['the last three (3) completed financial years', 'en', 3],
		['der letzten drei vollständig abgeschlossenen Geschäftsjahre', 'de', 3],
		['der 3 letzten abgeschlossenen Geschäftsjahre', 'de', 3],
		['der letzten zwei abgeschlossenen Kalenderjahre', 'de', 2],
		['der letzten zwei abgeschlossenen und bilanzierten Geschäftsjahre', 'de', 2],
		['de laatste twee volledige en afgesloten boekjaren', 'nl', 2],
		['Geschäftsjahre', 'de', null]
	] as const)('parsePeriod reads the years in "%s" (%s) as %s', (text, lang, years) => {
		expect(parsePeriod(text, lang)).toMatchObject({ years, yearsUnread: false });
	});

	// The window's default of three would silently stand in for a count the text states, so a count
	// code cannot settle is marked, never left as unstated.
	it.each([
		['der letzten zwei abgeschlossenen und testierten Geschäftsjahre', 'de'],
		['at least 5 employees in recent years', 'en'],
		['drei Jahre und fünf Jahre', 'de'],
		['in den letzten fünf Jahren wenigstens drei Jahre', 'de'],
		['in the last three years', 'de']
	] as const)('parsePeriod reads "%s" (%s) as years it cannot settle', (text, lang) => {
		expect(parsePeriod(text, lang)).toMatchObject({ years: null, yearsUnread: true });
	});

	// "jaar" is also the Dutch singular, and a count never stands in front of a "per".
	it.each([
		['minimaal € 1,5 mln per jaar', 'nl'],
		['minimaal 2 FTE per jaar', 'nl'],
		['mindestens 1 Mio. EUR pro Jahr', 'de']
	] as const)(
		'parsePeriod reads no count of years in the amount per year "%s" (%s)',
		(text, lang) => {
			expect(parsePeriod(text, lang)).toMatchObject({ years: null, yearsUnread: false });
		}
	);

	it('parsePeriod names every year from 2000 to 2099 in text order', () => {
		expect(parsePeriod('Jahre 2025, 2023 und 2024 sowie 1999, 2100 und 12023', 'de').named).toEqual(
			[2025, 2023, 2024]
		);
	});

	it('the German period reads average only together with the durchschnittlichen before it', () => {
		const tail = 'der letzten drei abgeschlosse-nen Geschäftsjahre (2023,2024,2025)';
		expect(parsePeriod(tail, 'de')).toEqual(period('unstated', 3, [2023, 2024, 2025]));
		expect(
			parsePeriod(`Die Mindestanforderung für den durchschnittlichen Jahresumsatz ${tail}`, 'de')
		).toEqual(period('average', 3, [2023, 2024, 2025]));
	});
});

describe('parseStandards', () => {
	const standards = (join: 'any' | 'all', ...found: string[]): StandardsReading => ({
		standards: found,
		join
	});

	it.each([
		['Zertifizierung nach ISO/IEC 27001:2022', standards('all', 'ISO/IEC 27001:2022')],
		['ISO/IEC-27001- oder BSI-Grundschutz', standards('all', 'ISO/IEC-27001')],
		['ISO 9001 und ISO 14001', standards('all', 'ISO 9001', 'ISO 14001')],
		['ISO 9001 oder ISO 27001', standards('any', 'ISO 9001', 'ISO 27001')],
		['ISO 9001 of ISO 27001', standards('any', 'ISO 9001', 'ISO 27001')],
		['ISO 9001 ou ISO 27001', standards('any', 'ISO 9001', 'ISO 27001')],
		['ISO 9001 or ISO 27001', standards('any', 'ISO 9001', 'ISO 27001')],
		['ISO 9001 bzw. ISO 27001', standards('any', 'ISO 9001', 'ISO 27001')],
		['ISO 9001 beziehungsweise ISO 27001', standards('any', 'ISO 9001', 'ISO 27001')],
		['EN 50600-2-2 und DIN 276', standards('all', 'EN 50600-2-2', 'DIN 276')],
		['NEN 7510 en BS 7799', standards('all', 'NEN 7510', 'BS 7799')],
		['IEC 62443-3-3', standards('all', 'IEC 62443-3-3')],
		['ISO 270011', standards('all', 'ISO 270011')],
		['DIN EN ISO 9001:2015', standards('all', 'ISO 9001:2015')],
		['en 2025 le candidat', standards('all')],
		['kein Zertifikat', standards('all')]
	] as const)('parseStandards reads %s', (text, expected) => {
		expect(parseStandards(text)).toEqual(expected);
	});

	it('the English word "of" between two standards is not an alternative', () => {
		expect(parseStandards('ISO 9001 of the firm and ISO 27001', 'en')).toEqual(
			standards('all', 'ISO 9001', 'ISO 27001')
		);
	});

	// "Or equivalent" is the wording Article 62 of Directive 2014/24/EU makes buyers accept, so an
	// alternative word next to other words is common and never read as a choice between standards.
	it.each([
		['ISO 9001 and either ISO 14001 or ISO 27001', 'en'],
		['ISO 9001 und entweder ISO 14001 oder ISO 27001', 'de'],
		['ISO 9001, ISO 14001 oder ISO 27001', 'de'],
		['ISO 9001 oder gleichwertig und ISO 27001 oder gleichwertig', 'de'],
		['ISO 9001 or equivalent, ISO 27001 or equivalent', 'en']
	] as const)('reads %s as a mixed join, never as any one of them', (text, lang) => {
		expect(parseStandards(text, lang).join).toBe('mixed');
	});

	it('reads three standards each joined by an alternative alone as any one of them', () => {
		expect(parseStandards('ISO 9001, oder ISO 14001 bzw. ISO 27001', 'de')).toEqual(
			standards('any', 'ISO 9001', 'ISO 14001', 'ISO 27001')
		);
	});
});

describe('amountsIn', () => {
	it('lists every amount of money a text names, in cents', () => {
		const text = 'Mindestens 1.000.000 EUR netto, für Bietergemeinschaften 2 Mio. EUR.';
		expect(amountsIn(text, false, 'de')).toEqual([100_000_000, 200_000_000]);
		expect(amountsIn('Angabe des Umsatzes der letzten drei Jahre.', false, 'de')).toEqual([]);
	});

	it('lists every headcount a text names', () => {
		expect(amountsIn('mindestens 10 Mitarbeiter und zwei Beschäftigte', true, 'de')).toEqual([
			10, 2
		]);
	});

	it('is null when code cannot read one of the amounts', () => {
		expect(amountsIn('1.000.000 EUR oder 2 Mrd. EUR', false, 'de')).toBeNull();
		expect(amountsIn('10 Mitarbeiter, davon 1,5 Beschäftigte', true, 'de')).toBeNull();
	});
});

describe('sameNumber', () => {
	const floor = parseMoney('mindestens 100.000,00 EUR netto', 'de');
	const staff = parseCount('mindestens 3 Mitarbeiter', 'de');

	it.each([
		['100.000,00 Euro', floor, true],
		['100.000 EUR', floor, true],
		['100.001,00 Euro', floor, false],
		['100.000,01 Euro', floor, false],
		['10.000,00 Euro', floor, false],
		['100.000,00', floor, false],
		['', floor, false],
		['100.000 EUR oder 200.000 EUR', floor, false],
		['drei Mitarbeiter', staff, true],
		['3 Mitarbeiter', staff, true],
		['4 Mitarbeiter', staff, false],
		['3', staff, false],
		['100.000 EUR', NONE, false]
	] as const)('sameNumber compares "%s" with the reading', (text, reading, expected) => {
		expect(sameNumber(text, reading, 'de')).toBe(expected);
	});
});
