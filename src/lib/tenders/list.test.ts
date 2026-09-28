import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capturePath } from '../../test/fixtures/node';
import { readNotice } from '../ingest/read-notice';
import { toIndexRow, type IndexRow } from '../snapshot/index-row';
import type { FilterState } from '../core/filters';
import {
	COUNTRY_NAMES,
	buildTenderList,
	captureFacts,
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
		expect(COUNTRY_NAMES).toEqual({ NLD: 'Netherlands', BEL: 'Belgium', DEU: 'Germany' });
	});

	// A joint procurement can list buyers from outside the scope; their codes stay as published.
	it('writes every buyer country of a row, and a code outside the scope as it is', () => {
		const joint = {
			...rowDue('700010-2026', '2026-11-02T10:00:00+01:00'),
			country: ['DEU', 'FRA']
		};
		const list = buildTenderList({ rows: [joint] }, NO_FILTER, CAPTURE_NOW);
		expect(list.open[0].countries).toEqual([COUNTRY_NAMES.DEU, 'FRA']);
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
		['0001500', 'EUR 1,500']
	])('writes %s as %s', (amount, written) => {
		expect(formatValue({ amount, currency: 'EUR' })).toBe(written);
	});

	it.each(['999.99', '999', '0.5', '-5000', '1,500', '1.5e6', ''])(
		'publishes no value for %j',
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

	it.each([
		[counts(0, 0, 0, 0), '0 open and 0 closed since the capture, of 0 notices.'],
		[counts(1, 1, 1, 0), '1 open and 0 closed since the capture, of 1 notice.'],
		[counts(363, 363, 271, 92), '271 open and 92 closed since the capture, of 363 notices.']
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
