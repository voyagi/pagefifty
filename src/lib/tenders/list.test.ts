import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cldrLabel } from '../../test/cldr';
import { capturePath } from '../../test/fixtures/node';
import { readNotice } from '../ingest/read-notice';
import { toIndexRow, type IndexRow } from '../snapshot/index-row';
import type { FilterState } from '../core/filters';
import { EU_EEA_COUNTRIES } from '../profile/codes';
import {
	buildTenderList,
	captureFacts,
	countryName,
	countsLine,
	filterSummary,
	formatValue,
	type ListRow
} from './list';

const CAPTURE_NOW = new Date('2026-09-15T19:50:49Z');
const NO_FILTER: FilterState = { countries: [], cpv: [] };

function realRow(notice: string): IndexRow {
	const bytes = new TextEncoder().encode(readFileSync(capturePath(notice), 'utf8'));
	const result = readNotice(bytes, { noticeNumber: notice });
	if (!result.ok) throw new Error(`${notice} did not read: ${result.detail}`);
	return toIndexRow(result.record);
}

// One lot due at the given instant, or with no deadline field at all.
function rowDue(noticeNumber: string, tender?: string): IndexRow {
	return {
		noticeNumber,
		title: { text: noticeNumber },
		buyers: [],
		country: ['DEU'],
		cpvCodes: ['72000000'],
		lots: [
			{
				id: 'LOT-0001',
				deadlines: tender ? { tender } : {},
				coverage: { criteriaCount: 1, sources: ['epo-notice'], pointsToDocuments: false }
			}
		]
	};
}

const numbers = (rows: ListRow[]) => rows.map((row) => row.noticeNumber);
const text = (line: (string | number)[]) => line.join('');

// 615890-2026: requests by 24 Sep 2026, value "0". 609955-2026: tenders by 6 Oct 2026, value
// "834550.06", a criterion pointing to the documents. 612090-2026: tenders by 15 Oct 2026, value "1".
const REAL = ['612090-2026', '615890-2026', '609955-2026'].map(realRow);

describe('buildTenderList order and groups', () => {
	it('lists open notices by their shown deadline, soonest first', () => {
		const list = buildTenderList({ rows: REAL }, NO_FILTER, CAPTURE_NOW);
		expect(numbers(list.open)).toEqual(['615890-2026', '609955-2026', '612090-2026']);
		expect(list.closed).toEqual([]);
	});

	it('moves a notice whose every lot has closed into the closed group on the clock it is given', () => {
		const list = buildTenderList({ rows: REAL }, NO_FILTER, new Date('2026-10-01T00:00:00Z'));
		expect(numbers(list.open)).toEqual(['609955-2026', '612090-2026']);
		expect(numbers(list.closed)).toEqual(['615890-2026']);
		expect(list.closed[0].deadline).toMatchObject({
			open: false,
			shown: { kind: 'request', instant: '2026-09-24T09:00:00+02:00' }
		});
	});

	it('breaks a tie by notice number as a number, year first, never as text', () => {
		const at = '2026-10-20T10:00:00+02:00';
		const rows = ['5-2027', '700001-2026', '99999-2026'].map((notice) => rowDue(notice, at));
		const list = buildTenderList({ rows }, NO_FILTER, CAPTURE_NOW);
		expect(numbers(list.open)).toEqual(['99999-2026', '700001-2026', '5-2027']);
	});

	it('sorts a notice with no deadline field last and never counts it as closed', () => {
		const rows = [rowDue('600001-2026'), ...REAL, rowDue('600000-2026')];
		const later = buildTenderList({ rows }, NO_FILTER, new Date('2030-01-01T00:00:00Z'));
		expect(numbers(later.open)).toEqual(['600000-2026', '600001-2026']);
		expect(numbers(later.closed)).toEqual(['615890-2026', '609955-2026', '612090-2026']);
		const now = buildTenderList({ rows }, NO_FILTER, CAPTURE_NOW);
		expect(numbers(now.open).slice(-2)).toEqual(['600000-2026', '600001-2026']);
	});

	it('counts the whole index, the rows the filters keep and each group', () => {
		const state: FilterState = { countries: ['DE'], cpv: [] };
		const list = buildTenderList({ rows: REAL }, state, new Date('2026-10-01T00:00:00Z'));
		expect(list.counts.total).toBe(3);
		expect(list.counts.shown).toBe(list.open.length + list.closed.length);
		expect(list.filtered).toBe(true);
		expect(list.inverted).toBe(false);
	});

	it('flags an inverted range and keeps no row', () => {
		const state: FilterState = { countries: [], cpv: [], from: '2026-11-01', to: '2026-10-01' };
		const list = buildTenderList({ rows: REAL }, state, CAPTURE_NOW);
		expect(list.inverted).toBe(true);
		expect(list.counts.shown).toBe(0);
	});

	it("gives each row its reading-status tag from the notice alone and the card's value", () => {
		const list = buildTenderList({ rows: REAL }, NO_FILTER, CAPTURE_NOW);
		const row = list.open.find((each) => each.noticeNumber === '609955-2026');
		expect(row?.reading.text).toBe('Criteria in the documents');
		expect(row?.value).toBe('EUR 834,550.06');
		expect(row?.countries).toEqual(['Germany']);
	});
});

describe('buyer countries', () => {
	it('names the three countries in scope in English', () => {
		expect(['NLD', 'BEL', 'DEU'].map(countryName)).toEqual(['Netherlands', 'Belgium', 'Germany']);
	});

	// ISO 3166-1 alpha-3 to alpha-2 for the EU and EEA. ICU names only the alpha-2 codes, so each name
	// is checked against ICU's English name, and the codes against the profile's own country list. A
	// failure names the CLDR release when it differs from the one the list was checked against
	// (src/test/cldr.ts).
	const ALPHA2_OF: Record<string, string> = {
		AUT: 'AT',
		BEL: 'BE',
		BGR: 'BG',
		HRV: 'HR',
		CYP: 'CY',
		CZE: 'CZ',
		DNK: 'DK',
		EST: 'EE',
		FIN: 'FI',
		FRA: 'FR',
		DEU: 'DE',
		GRC: 'GR',
		HUN: 'HU',
		ISL: 'IS',
		IRL: 'IE',
		ITA: 'IT',
		LVA: 'LV',
		LIE: 'LI',
		LTU: 'LT',
		LUX: 'LU',
		MLT: 'MT',
		NLD: 'NL',
		NOR: 'NO',
		POL: 'PL',
		PRT: 'PT',
		ROU: 'RO',
		SVK: 'SK',
		SVN: 'SI',
		ESP: 'ES',
		SWE: 'SE'
	};

	it('names every EU and EEA buyer country as ICU names it in English', () => {
		const regions = new Intl.DisplayNames('en', { type: 'region' });
		expect(Object.values(ALPHA2_OF).sort()).toEqual(
			EU_EEA_COUNTRIES.map(({ code }) => code).sort()
		);
		for (const [alpha3, alpha2] of Object.entries(ALPHA2_OF)) {
			expect(countryName(alpha3), cldrLabel(alpha3)).toBe(regions.of(alpha2));
		}
	});

	// A joint procurement can list buyers from across the EU beside one in scope; every country is
	// named in English, and only a code outside the EU and the EEA stays as published.
	it('writes every buyer country of a row in English, and an unknown code as it is', () => {
		const joint = {
			...rowDue('700010-2026', '2026-11-02T10:00:00+01:00'),
			country: ['DEU', 'FRA', 'XKX']
		};
		const list = buildTenderList({ rows: [joint] }, NO_FILTER, CAPTURE_NOW);
		expect(list.open[0].countries).toEqual(['Germany', 'France', 'XKX']);
	});

	// The code comes from the notice, so it may name a key every plain object inherits.
	it.each(['constructor', '__proto__', 'toString'])(
		'shows a buyer country code %s as published, never a built-in property',
		(code) => {
			const row = { ...rowDue('700011-2026', '2026-11-02T10:00:00+01:00'), country: [code] };
			const list = buildTenderList({ rows: [row] }, NO_FILTER, CAPTURE_NOW);
			expect(list.open[0].countries).toEqual([code]);
		}
	);

	// 612350-2026, the capture's one joint procurement across borders, lists buyers in 19 countries.
	it('names all 19 buyer countries of 612350-2026, none left as a code', () => {
		const list = buildTenderList({ rows: [realRow('612350-2026')] }, NO_FILTER, CAPTURE_NOW);
		const [row] = [...list.open, ...list.closed];
		expect(row.countries).toHaveLength(19);
		expect(row.countries.filter((name) => /^[A-Z]{3}$/.test(name))).toEqual([]);
		expect(row.countries.slice(0, 4)).toEqual(['Belgium', 'Latvia', 'Germany', 'France']);
	});
});

describe('buyers', () => {
	// A joint procurement names several buyers. The row keeps the first by name and counts the rest,
	// so it never reads as that one buyer's tender alone (8 capture notices name 2 to 39 buyers).
	it.each([
		['612350-2026', 'European Commission, DG BUDG - Budget', 38],
		['611918-2026', 'Zweites Deutsches Fernsehen', 8],
		['629580-2026', 'Thomas More Mechelen-Antwerpen', 1],
		['609955-2026', 'Burgenlandkreis', 0]
	])('names the first buyer of %s, %s, and counts %i others', (notice, first, others) => {
		const list = buildTenderList({ rows: [realRow(notice)] }, NO_FILTER, CAPTURE_NOW);
		const [row] = [...list.open, ...list.closed];
		expect([row.buyer?.text, row.otherBuyers]).toEqual([first, others]);
	});
});

describe('formatValue', () => {
	it('reads the published values of the three capture notices by the EUR 1,000 floor', () => {
		const [low, zero, cents] = REAL.map((row) => row.estimatedValue);
		expect(zero).toEqual({ amount: '0', currency: 'EUR' });
		expect(low).toEqual({ amount: '1', currency: 'EUR' });
		expect(formatValue(zero)).toBeNull();
		expect(formatValue(low)).toBeNull();
		expect(formatValue(cents)).toBe('EUR 834,550.06');
	});

	it.each([
		['1240000', 'EUR 1,240,000'],
		['1000', 'EUR 1,000'],
		['1000.00', 'EUR 1,000'],
		['3000000.0', 'EUR 3,000,000'],
		['672268.90', 'EUR 672,268.90'],
		['8732295076.00', 'EUR 8,732,295,076'],
		['0001500', 'EUR 1,500'],
		// xs:decimal, the type of a UBL amount, allows a leading sign: the XML Schema spec's own
		// example is "+100000.00". A point with no digits after it is no fraction.
		['+100000.00', 'EUR 100,000'],
		['+1500', 'EUR 1,500'],
		['1500.', 'EUR 1,500']
	])('writes %s as %s', (amount, written) => {
		expect(formatValue({ amount, currency: 'EUR' })).toBe(written);
	});

	it.each(['999.99', '999', '0.5', '-5000', '-1500000', '+999.99', '1,500', '1.5e6', '', '+', '.'])(
		'publishes no value for %j',
		(amount) => {
			expect(formatValue({ amount, currency: 'EUR' })).toBeNull();
		}
	);

	// Only the whole text is an xs:decimal: a number with other text around it is no amount, and a
	// placeholder stays below the floor however many zeros lead it.
	it.each(['EUR 2000', '2000 EUR', '2000.00 EUR', '000999.00', '0000999'])(
		'publishes no value for %j either',
		(amount) => {
			expect(formatValue({ amount, currency: 'EUR' })).toBeNull();
		}
	);

	it('publishes no value when there is none', () => {
		expect(formatValue(undefined)).toBeNull();
	});
});

describe('countsLine', () => {
	const counts = (total: number, shown: number, open: number, closed: number) => ({
		total,
		shown,
		open,
		closed
	});

	// The live line says "closed", never "closed since the capture": 13 capture notices had closed
	// before it was taken (tenders.dom.test.ts pins that against the built index).
	it.each([
		[counts(0, 0, 0, 0), '0 open and 0 closed, of 0 notices.'],
		[counts(1, 1, 1, 0), '1 open and 0 closed, of 1 notice.'],
		[counts(363, 363, 271, 92), '271 open and 92 closed, of 363 notices.']
	])('writes the unfiltered line with the right noun', (given, line) => {
		expect(text(countsLine(given, false))).toBe(line);
	});

	it.each([
		[counts(363, 0, 0, 0), '0 of 363 notices match these filters: 0 open, 0 closed.'],
		[counts(363, 1, 1, 0), '1 of 363 notices matches these filters: 1 open, 0 closed.'],
		[counts(1, 1, 0, 1), '1 of 1 notice matches these filters: 0 open, 1 closed.'],
		[counts(363, 40, 30, 10), '40 of 363 notices match these filters: 30 open, 10 closed.']
	])('writes the filtered line with the right noun and verb', (given, line) => {
		expect(text(countsLine(given, true))).toBe(line);
	});

	it('keeps every figure a number so the page can set it in Mono', () => {
		const line = countsLine(counts(363, 40, 30, 10), true);
		expect(line.filter((part) => typeof part === 'number')).toEqual([40, 363, 30, 10]);
	});

	it('takes the closed wording of the example variant', () => {
		expect(text(countsLine(counts(2, 2, 1, 1), false, 'closed at the capture time'))).toBe(
			'1 open and 1 closed at the capture time, of 2 notices.'
		);
		// The filtered line takes it too, so the example never says "closed" alone on one line and
		// "closed at the capture time" on the other.
		expect(text(countsLine(counts(2, 2, 1, 1), true, 'closed at the capture time'))).toBe(
			'2 of 2 notices match these filters: 1 open, 1 closed at the capture time.'
		);
	});
});

describe('captureFacts and filterSummary', () => {
	it("names the capture day and the query's first publication day", () => {
		expect(
			captureFacts({
				id: '2026-09-15',
				fetchedAt: '2026-09-15T19:50:49.157Z',
				total: 363,
				query: 'classification-cpv IN (72000000) AND publication-date>=20260901 AND x'
			})
		).toEqual({
			capturedOn: '15 Sep 2026',
			fetchedAt: '2026-09-15T19:50:49.157Z',
			firstPublished: '1 Sep 2026'
		});
	});

	it('leaves the first day out when the query names none', () => {
		const facts = captureFacts({
			id: '2026-09-15',
			fetchedAt: '2026-09-15T19:50:49.157Z',
			total: 1,
			query: 'buyer-country IN (NLD)'
		});
		expect(facts.firstPublished).toBeUndefined();
	});

	it('writes the filters in words, in the order the form lists them', () => {
		expect(
			filterSummary({ countries: ['BE'], cpv: ['48'], from: '2026-11-01', to: '2026-12-24' })
		).toBe(
			'Belgium, software packages, deadline on or after 1 Nov 2026, deadline on or before 24 Dec 2026'
		);
		expect(filterSummary({ countries: ['NL', 'DE'], cpv: ['72'] })).toBe(
			'Netherlands, Germany, IT services'
		);
	});
});

// The open test, the date filter and the rendered date must read one deadline rule. Both modules
// import it, and every instant either one parses is the rule's own shown deadline.
describe('one deadline rule', () => {
	const sources = ['src/lib/tenders/list.ts', 'src/lib/core/filters.ts'].map((path) => ({
		path,
		text: readFileSync(join(...path.split('/')), 'utf8')
	}));

	it.each(sources)(
		'$path imports noticeDeadline from the core deadline module',
		({ text: src }) => {
			expect(src).toMatch(
				/import\s*\{[^}]*\bnoticeDeadline\b[^}]*\}\s*from\s*'(?:\.\.\/core|\.)\/deadline(?:\.ts)?'/
			);
		}
	);

	it.each(sources)('$path parses no deadline but the shown one', ({ text: src }) => {
		const parsed = [...src.matchAll(/Date\.parse\(([^)]*)\)/g)].map((match) => match[1]);
		expect(parsed.length).toBeGreaterThan(0);
		for (const argument of parsed) expect(argument).toMatch(/shown\.instant$/);
		expect(src).not.toMatch(/\.deadlines\b|\bdisplayedDeadline\b/);
	});
});
