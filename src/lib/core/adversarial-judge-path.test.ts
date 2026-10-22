// Hostile and unusual clause texts driven through the shipped judge path: the figure readers, the
// quote check and the comparison, read end to end as the browser verdict reads them. Each case is
// one way a floor a firm does not meet could read as met.
import { describe, expect, it } from 'vitest';
import { decideReadLot, type FirmFacts, type LotContext } from './compare';
import { parseCount, parseMoney, parsePeriod } from './figures';
import { readLot, type ModelItem } from './lot-reading';
import { findQuote } from './quote';

const CONTEXT: LotContext = {
	legalBasis: '32014L0024',
	deadline: '2026-10-30T17:00:00Z',
	now: '2026-10-17T12:00:00Z',
	coverage: { criteriaCount: 1, sources: ['epo-notice'], pointsToDocuments: false },
	cancelIntent: false,
	reserved: 'none'
};

const firmWithTurnover = (byYear: Readonly<Record<number, number>>): FirmFacts => ({
	completedFinancialYears: 5,
	turnover: Object.entries(byYear).map(([year, net]) => ({
		year: Number(year),
		generalNet: net,
		specific: []
	})),
	staff: { yearlyAverages: [] },
	certificates: []
});

// A model that agrees with the code on everything: the quote is the whole clause and the number
// text is the amount exactly as written.
function item(text: string, numberText: string, period = ''): ModelItem {
	return {
		criterion: 1,
		kind: 'turnover-general',
		quote: text,
		reading: 'The bidder must show a minimum yearly turnover.',
		numberText,
		period,
		mandatory: true
	};
}

function verdictFor(
	text: string,
	numberText: string,
	firm: FirmFacts,
	lang = 'de',
	code = 'slc-stand-to-gen'
) {
	const reading = readLot({
		criteria: [{ code, descriptions: [{ text, lang }] }],
		items: [item(text, numberText)]
	});
	return decideReadLot(reading, firm, CONTEXT);
}

// 50,000 euros a year: far below every floor below, which all name a million or more.
const SMALL_FIRM = firmWithTurnover({ 2023: 50_000, 2024: 50_000, 2025: 50_000 });

describe('a multiplier written after a currency that comes first', () => {
	// Each names a million or more; read without its multiplier it would be a few euros.
	it.each([
		[
			'de',
			'Mindestjahresumsatz in jedem der letzten drei Geschäftsjahre: EUR 1 Mill.',
			'EUR 1 Mill.'
		],
		['de', 'Mindestjahresumsatz jährlich von mindestens EUR 2,5 Mill. netto', 'EUR 2,5 Mill.'],
		['en', 'A minimum yearly turnover of €1m in each of the last three years', '€1m'],
		['en', 'A minimum yearly turnover of EUR 2.5M in each of the last three years', 'EUR 2.5M'],
		['en', 'A minimum yearly turnover of EUR 3 mn in each of the last three years', 'EUR 3 mn'],
		['en', 'A minimum yearly turnover of EUR 1MM in each of the last three years', 'EUR 1MM'],
		['en', 'A minimum yearly turnover of €1B in each of the last three years', '€1B'],
		['fr', "Un chiffre d'affaires annuel minimum de EUR 2 Md par an", 'EUR 2 Md'],
		['nl', 'Een minimale jaaromzet van EUR 2 mld per jaar', 'EUR 2 mld']
	])('%s "%s" is never read as a few euros', (lang, text, numberText) => {
		const money = parseMoney(text, lang);
		expect(money.kind === 'one' && money.cents < 100_000_000).toBe(false);
		const decided = verdictFor(text, numberText, SMALL_FIRM, lang);
		expect(decided.decision.verdict).not.toBe('GO');
		expect(decided.criteria[0].state).not.toBe('MET');
	});

	it.each([
		['de', 'Mindestjahresumsatz von EUR 2 Mio. jährlich', 200_000_000],
		['de', 'Mindestjahresumsatz von EUR 500.000 netto jährlich', 50_000_000],
		['en', 'A minimum yearly turnover of EUR 1 million', 100_000_000],
		['fr', "Un chiffre d'affaires annuel minimum de EUR 750 000 HT par an", 75_000_000]
	])('%s "%s" still reads its amount', (lang, text, cents) => {
		const money = parseMoney(text, lang);
		expect(money).toMatchObject({ kind: 'one', cents });
	});
});

// Built from its code point so the source shows which space it is.
const FIGURE_SPACE = String.fromCodePoint(0x2007);

describe('digit groups joined by a mark the reader does not know', () => {
	// A trailing group read alone ("000 EUR") would be a floor of nothing, met by every firm.
	it.each([
		["Mindestjahresumsatz jährlich: 1'000'000 EUR", "1'000'000 EUR"],
		["Mindestjahresumsatz jährlich: 1'250'500 EUR", "1'250'500 EUR"],
		[
			`Mindestjahresumsatz jährlich: 1${FIGURE_SPACE}000${FIGURE_SPACE}000 EUR`,
			`1${FIGURE_SPACE}000${FIGURE_SPACE}000 EUR`
		],
		['Mindestjahresumsatz jährlich: 1  000  000 EUR', '1  000  000 EUR'],
		["Mindestjahresumsatz jährlich: EUR 1'000'000", "EUR 1'000'000"]
	])('"%s" is never read below a million', (text, numberText) => {
		const money = parseMoney(text, 'de');
		expect(money.kind === 'one' && money.cents < 100_000_000).toBe(false);
		const decided = verdictFor(text, numberText, SMALL_FIRM);
		expect(decided.decision.verdict).not.toBe('GO');
		expect(decided.criteria[0].state).not.toBe('MET');
	});

	it.each([
		["mindestens 1'000 Mitarbeiter", 'de'],
		[`mindestens 1${FIGURE_SPACE}000 Mitarbeiter`, 'de']
	])('"%s" is never read as a smaller headcount', (text, lang) => {
		const count = parseCount(text, lang);
		expect(count.kind === 'one' && count.count < 1000).toBe(false);
	});

	it.each([
		['Mindestjahresumsatz jährlich: 1 000 000 EUR', 'de', { kind: 'one', cents: 100_000_000 }],
		['Umsatz 2024 3 Mio. EUR', 'de', { kind: 'one', cents: 300_000_000 }],
		['Mindestumsatz: 3.000.000,- €', 'de', { kind: 'one', cents: 300_000_000 }],
		['Mindestumsatz 1.000.000 EUR (2023)', 'de', { kind: 'one', cents: 100_000_000 }]
	])('"%s" still reads its amount', (text, lang, reading) => {
		expect(parseMoney(text, lang)).toMatchObject(reading);
	});

	it.each([
		['mindestens 1 000 Mitarbeiter', 'de', 1000],
		['2024: 25 Mitarbeiter', 'de', 25]
	])('"%s" still reads its headcount', (text, lang, count) => {
		expect(parseCount(text, lang)).toEqual({ kind: 'one', count });
	});
});

describe('a choice of one year read only from a period phrase', () => {
	// The firm meets the floor in its newest year only.
	const ONE_GOOD_YEAR = firmWithTurnover({ 2023: 100_000, 2024: 100_000, 2025: 5_000_000 });

	it.each([
		[
			'de',
			'Mindestumsatz von 1 Mio. EUR in den letzten drei Geschäftsjahren, nachzuweisen in einem der folgenden Dokumente'
		],
		[
			'en',
			'A minimum turnover of EUR 1 million in the last three financial years, shown in any one of the following documents'
		],
		[
			'nl',
			'Een minimale omzet van 1 mln EUR in de laatste drie boekjaren, aan te tonen in één van de volgende documenten'
		]
	])('%s: a "one of the following documents" clause is no any-one period', (lang, text) => {
		expect(parsePeriod(text, lang).mode).not.toBe('any-one');
		const decided = verdictFor(text, '1 Mio. EUR', ONE_GOOD_YEAR, lang);
		expect(decided.criteria[0].state).not.toBe('MET');
	});

	it.each([
		['de', 'Mindestumsatz von 1 Mio. EUR in einem der letzten drei Geschäftsjahre'],
		['de', 'Mindestumsatz von 1 Mio. EUR in einem der vergangenen drei Geschäftsjahre'],
		['en', 'A minimum turnover of EUR 1 million in any one of the last three financial years'],
		['nl', 'Een minimale omzet van 1 mln EUR in één van de laatste drie boekjaren'],
		[
			'fr',
			"Un chiffre d'affaires minimum de 1 million EUR au cours d'un des trois derniers exercices"
		]
	])('%s: a choice of one year still reads as any-one', (lang, text) => {
		expect(parsePeriod(text, lang).mode).toBe('any-one');
	});
});

// Folds to a full stop under NFKC, built from its code point so the source shows which mark it is.
const DOT_LEADER = String.fromCodePoint(0x2024);

describe('quotes that point at less than the clause demands', () => {
	it('a quote whose digit groups use a look-alike dot never sets a lower floor', () => {
		const text = 'Mindestjahresumsatz jährlich von mindestens 1.000.000 EUR';
		const quote = `Mindestjahresumsatz jährlich von mindestens 1${DOT_LEADER}000${DOT_LEADER}000 EUR`;
		expect(findQuote(quote, text).found).toBe(true);
		const reading = readLot({
			criteria: [{ code: 'slc-stand-to-gen', descriptions: [{ text, lang: 'de' }] }],
			items: [item(quote, `1${DOT_LEADER}000${DOT_LEADER}000 EUR`)]
		});
		const decided = decideReadLot(reading, SMALL_FIRM, CONTEXT);
		expect(decided.criteria[0].state).toBe('NOT_READ');
		expect(decided.decision.verdict).not.toBe('GO');
	});

	it('a quote of the smaller amount in a clause never stands for its floor', () => {
		const text = 'Mindestumsatz 5 Mio. EUR jährlich. Referenzprojekte ab 100.000 EUR.';
		const quote = 'Referenzprojekte ab 100.000 EUR';
		const reading = readLot({
			criteria: [{ code: 'slc-stand-to-gen', descriptions: [{ text, lang: 'de' }] }],
			items: [item(quote, '100.000 EUR')]
		});
		// Above the quoted amount, far below the clause's floor.
		const firm = firmWithTurnover({ 2023: 200_000, 2024: 200_000, 2025: 200_000 });
		const decided = decideReadLot(reading, firm, CONTEXT);
		expect(decided.criteria[0].requirements[0].state).toBe('MET');
		expect(decided.criteria[0].state).toBe('NOT_READ');
		expect(decided.decision.verdict).toBe('ASK FIRST');
		expect(decided.criteria[0].requirements.map((each) => each.why)).toContain('amount-not-quoted');
	});

	it('a lower amount quoted from a second language never stands for the first', () => {
		const de = 'Mindestjahresumsatz jährlich von mindestens 5.000.000 EUR';
		const en = 'A minimum yearly turnover of at least EUR 50,000 per year';
		const reading = readLot({
			criteria: [
				{
					code: 'slc-stand-to-gen',
					descriptions: [
						{ text: de, lang: 'de' },
						{ text: en, lang: 'en' }
					]
				}
			],
			items: [item(en, 'EUR 50,000')]
		});
		const decided = decideReadLot(reading, SMALL_FIRM, CONTEXT);
		expect(decided.criteria[0].state).toBe('NOT_READ');
	});
});

describe('a general turnover floor confined to a field of business', () => {
	// General turnover clears each floor; turnover in the named field may not.
	const BIG_FIRM = firmWithTurnover({ 2023: 9_000_000, 2024: 9_000_000, 2025: 9_000_000 });

	it.each([
		[
			'de',
			'Der Bieter muss in den letzten drei abgeschlossenen Geschäftsjahren (2025, 2024, 2023) einen durchschnittlichen Gesamtjahresumsatz von mindestens 800.000 Euro brutto zu mit dem zu vergebenden Auftrag vergleichbaren Leistungen erzielt haben.',
			'800.000 Euro',
			'slc-stand-to-avg'
		],
		[
			'de',
			'Mindestjahresumsatz im Tätigkeitsbereich des Auftrags: 1 Mio. EUR jährlich',
			'1 Mio. EUR',
			'slc-stand-to-gen'
		],
		[
			'en',
			'A minimum yearly turnover of EUR 1 million in each year from similar services',
			'EUR 1 million',
			'slc-stand-to-gen'
		],
		[
			'nl',
			'Een minimale jaaromzet van 1 mln EUR per jaar met soortgelijke opdrachten',
			'1 mln EUR',
			'slc-stand-to-gen'
		],
		[
			'fr',
			"Un chiffre d'affaires annuel minimum de 1 million EUR par an pour des services similaires",
			'1 million EUR',
			'slc-stand-to-gen'
		]
	])(
		'%s: only the firm can judge a floor its quote confines to a field',
		(lang, text, number, code) => {
			const decided = verdictFor(text, number, BIG_FIRM, lang, code);
			const [requirement] = decided.criteria[0].requirements;
			expect(requirement.state).toBe('PROFILE_GAP');
			expect(requirement.why).toBe('firm-judges');
		}
	);

	it('a plain general turnover floor the firm clears is still MET', () => {
		const text = 'Mindestjahresumsatz von 1 Mio. EUR jährlich in den letzten drei Geschäftsjahren';
		expect(verdictFor(text, '1 Mio. EUR', BIG_FIRM).criteria[0].state).toBe('MET');
	});
});

describe('mutation detectors on the floor comparison', () => {
	const text = 'Mindestjahresumsatz jährlich von mindestens 1.000.000 EUR netto';
	const exact = firmWithTurnover({ 2023: 1_000_000, 2024: 1_000_000, 2025: 1_000_000 });

	it('a firm exactly at an "at least" floor every year is MET', () => {
		expect(verdictFor(text, '1.000.000 EUR', exact).criteria[0].state).toBe('MET');
	});

	it('a firm one euro short in one year is never MET', () => {
		const short = firmWithTurnover({ 2023: 1_000_000, 2024: 999_999, 2025: 1_000_000 });
		expect(verdictFor(text, '1.000.000 EUR', short).criteria[0].state).toBe('SHORT_BORROWABLE');
	});

	it('a firm exactly at a "more than" net floor is short', () => {
		const more = 'Jahresumsatz jährlich von mehr als 1.000.000 EUR netto';
		expect(verdictFor(more, '1.000.000 EUR', exact).criteria[0].state).toBe('SHORT_BORROWABLE');
	});

	it('a floor stating both "at least" and "more than" settles no equality', () => {
		const both = 'Mindestjahresumsatz jährlich von mehr als 1.000.000 EUR netto';
		expect(verdictFor(both, '1.000.000 EUR', exact).criteria[0].state).toBe('PROFILE_GAP');
	});
});
