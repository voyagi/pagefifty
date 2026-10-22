// Hostile and unusual clause texts driven through the shipped judge path: the figure readers, the
// quote check and the comparison, read end to end as the browser verdict reads them. Each case is
// one way a floor a firm does not meet could read as met.
import { describe, expect, it } from 'vitest';
import { decideReadLot, type FirmFacts, type LotContext } from './compare';
import { parseMoney } from './figures';
import { readLot, type ModelItem } from './lot-reading';

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
