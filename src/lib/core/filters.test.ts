import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '../ingest/read-notice';
import { toIndexRow, type IndexRow } from '../snapshot/index-row';
import { cetDayEnd, cetDayStart } from './deadline';
import {
	COUNTRIES,
	CPV_GROUPS,
	applyFilters,
	isActive,
	parseFilters,
	rangeInverted,
	toSearch,
	type FilterState
} from './filters';

const CAPTURE_NOW = new Date('2026-09-15T12:00:00Z');
const NO_FILTER: FilterState = { countries: [], cpv: [] };

function rowOf(role: RoleName, which = 0): IndexRow {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	return toIndexRow(result.record);
}

const parse = (query: string) => parseFilters(new URLSearchParams(query));
const numbers = (rows: IndexRow[]) => rows.map((row) => row.noticeNumber);

// A row with one lot whose tender deadline is the given instant, for exact boundary checks.
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
				coverage: { criteriaCount: 0, sources: ['epo-notice'], pointsToDocuments: false }
			}
		]
	};
}

const DAY_MS = 86_400_000;
const FIRST_DAY = Date.UTC(1970, 0, 1) / DAY_MS;
const LAST_DAY = Date.UTC(9999, 11, 31) / DAY_MS;
const dayArb = fc
	.integer({ min: FIRST_DAY, max: LAST_DAY })
	.map((day) => new Date(day * DAY_MS).toISOString().slice(0, 10));
const stateArb = fc.record({
	countries: fc.subarray([...COUNTRIES]),
	cpv: fc.subarray([...CPV_GROUPS]),
	from: fc.option(dayArb, { nil: undefined }),
	to: fc.option(dayArb, { nil: undefined })
});

describe('parseFilters and toSearch', () => {
	test.prop([stateArb])('round-trips every valid state through the URL', (state) => {
		const parsed = parseFilters(new URLSearchParams(toSearch(state)));
		expect(parsed.dropped).toBe(false);
		expect(parsed.state).toEqual(state);
	});

	it('reads repeated keys into the canonical state', () => {
		expect(parse('country=NL&country=DE&cpv=72&from=2026-10-01&to=2026-10-31')).toEqual({
			state: { countries: ['NL', 'DE'], cpv: ['72'], from: '2026-10-01', to: '2026-10-31' },
			dropped: false
		});
	});

	it('writes repeated keys in canonical order, whatever order they were picked in', () => {
		const state = parse('country=DE&cpv=48&country=NL&cpv=72').state;
		expect(toSearch(state)).toBe('country=NL&country=DE&cpv=72&cpv=48');
	});

	it.each([
		['country=FR', { countries: [], cpv: [] }],
		['country=nl&country=BE', { countries: ['BE'], cpv: [] }],
		['cpv=99&cpv=48', { countries: [], cpv: ['48'] }],
		['from=2026-13-40', { countries: [], cpv: [] }],
		['from=2026-02-30', { countries: [], cpv: [] }],
		['to=2026-10-1', { countries: [], cpv: [] }],
		['to=1969-12-31', { countries: [], cpv: [] }],
		['from=2026-10-01&from=2026-10-02', { countries: [], cpv: [], from: '2026-10-01' }]
	])('drops what %s cannot mean and flags it', (query, state) => {
		expect(parse(query)).toEqual({ state, dropped: true });
	});

	it('keeps a country picked twice once, without a flag', () => {
		expect(parse('country=NL&country=NL')).toEqual({
			state: { countries: ['NL'], cpv: [] },
			dropped: false
		});
	});

	it('ignores keys that are not filters, such as theme, without a flag', () => {
		expect(parse('theme=dark&utm_source=x')).toEqual({ state: NO_FILTER, dropped: false });
	});

	it('reads the empty date fields a plain form submits as no bound, not as junk', () => {
		expect(parse('country=BE&from=&to=')).toEqual({
			state: { countries: ['BE'], cpv: [] },
			dropped: false
		});
	});
});

describe('isActive and rangeInverted', () => {
	it('is inactive with nothing picked and active with any one filter', () => {
		expect(isActive(NO_FILTER)).toBe(false);
		expect(isActive({ ...NO_FILTER, countries: ['NL'] })).toBe(true);
		expect(isActive({ ...NO_FILTER, cpv: ['48'] })).toBe(true);
		expect(isActive({ ...NO_FILTER, from: '2026-10-01' })).toBe(true);
		expect(isActive({ ...NO_FILTER, to: '2026-10-01' })).toBe(true);
	});

	it('flags a from day after the to day, and keeps no row then', () => {
		const state = { ...NO_FILTER, from: '2026-10-31', to: '2026-10-01' };
		expect(rangeInverted(state)).toBe(true);
		expect(
			applyFilters([rowDue('1-2026', '2026-10-15T10:00:00+02:00')], state, CAPTURE_NOW)
		).toEqual([]);
	});

	it('does not flag one day, an ordered range or a single bound', () => {
		expect(rangeInverted({ ...NO_FILTER, from: '2026-10-01', to: '2026-10-01' })).toBe(false);
		expect(rangeInverted({ ...NO_FILTER, from: '2026-10-01', to: '2026-10-31' })).toBe(false);
		expect(rangeInverted({ ...NO_FILTER, from: '2026-10-31' })).toBe(false);
		expect(rangeInverted({ ...NO_FILTER, to: '2026-10-01' })).toBe(false);
	});
});

describe('applyFilters', () => {
	it('keeps every row when nothing is picked', () => {
		const rows = [rowOf('one-lot'), rowOf('neither-deadline'), rowOf('joint-buyers')];
		expect(applyFilters(rows, NO_FILTER, CAPTURE_NOW)).toEqual(rows);
	});

	it('matches a country through any of the buyers', () => {
		const joint = rowOf('joint-buyers');
		expect(joint.country).toContain('DEU');
		const mixed = { ...rowDue('2-2026', '2026-10-15T10:00:00+02:00'), country: ['BEL', 'NLD'] };
		const rows = [joint, mixed];
		expect(numbers(applyFilters(rows, { ...NO_FILTER, countries: ['DE'] }, CAPTURE_NOW))).toEqual([
			'611918-2026'
		]);
		expect(numbers(applyFilters(rows, { ...NO_FILTER, countries: ['NL'] }, CAPTURE_NOW))).toEqual([
			'2-2026'
		]);
		expect(numbers(applyFilters(rows, { ...NO_FILTER, countries: ['BE'] }, CAPTURE_NOW))).toEqual([
			'2-2026'
		]);
	});

	it('puts a notice in group 48 through an additional code when its main code is outside', () => {
		const row = rowOf('one-lot');
		expect(row.cpvCodes).toEqual(['45315700', '48921000']);
		expect(applyFilters([row], { ...NO_FILTER, cpv: ['48'] }, CAPTURE_NOW)).toEqual([row]);
		expect(applyFilters([row], { ...NO_FILTER, cpv: ['72'] }, CAPTURE_NOW)).toEqual([]);
	});

	it('keeps an in-notice row with no date bound and drops it once a bound is set', () => {
		const row = rowOf('neither-deadline');
		expect(applyFilters([row], NO_FILTER, CAPTURE_NOW)).toEqual([row]);
		expect(applyFilters([row], { ...NO_FILTER, from: '2026-01-01' }, CAPTURE_NOW)).toEqual([]);
		expect(applyFilters([row], { ...NO_FILTER, to: '2099-12-31' }, CAPTURE_NOW)).toEqual([]);
	});

	it('bounds dates by whole Central European days', () => {
		expect(cetDayStart('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
		expect(cetDayEnd('2026-10-25').toISOString()).toBe('2026-10-25T22:59:59.999Z');
		const rows = [
			rowDue('1-2026', '2026-10-24T21:59:59.999Z'),
			rowDue('2-2026', '2026-10-24T22:00:00.000Z'),
			rowDue('3-2026', '2026-10-25T22:59:59.999Z'),
			rowDue('4-2026', '2026-10-25T23:00:00.000Z')
		];
		const day = { ...NO_FILTER, from: '2026-10-25', to: '2026-10-25' };
		expect(numbers(applyFilters(rows, day, CAPTURE_NOW))).toEqual(['2-2026', '3-2026']);
		expect(numbers(applyFilters(rows, { ...NO_FILTER, from: '2026-10-25' }, CAPTURE_NOW))).toEqual([
			'2-2026',
			'3-2026',
			'4-2026'
		]);
		expect(numbers(applyFilters(rows, { ...NO_FILTER, to: '2026-10-25' }, CAPTURE_NOW))).toEqual([
			'1-2026',
			'2-2026',
			'3-2026'
		]);
	});

	it('reads each notice deadline with the now it is given', () => {
		const row = rowOf('lots-differ');
		const firstDay = { ...NO_FILTER, from: '2026-10-05', to: '2026-10-05' };
		expect(applyFilters([row], firstDay, CAPTURE_NOW)).toEqual([row]);
		expect(applyFilters([row], firstDay, new Date('2026-10-05T12:00:00Z'))).toEqual([]);
		const secondDay = { ...NO_FILTER, from: '2026-10-06', to: '2026-10-06' };
		expect(applyFilters([row], secondDay, new Date('2026-10-05T12:00:00Z'))).toEqual([row]);
	});

	it('needs every picked filter to match', () => {
		const row = rowOf('one-lot');
		const state: FilterState = {
			countries: ['DE'],
			cpv: ['48'],
			from: '2026-10-06',
			to: '2026-10-06'
		};
		expect(applyFilters([row], state, CAPTURE_NOW)).toEqual([row]);
		expect(applyFilters([row], { ...state, countries: ['NL'] }, CAPTURE_NOW)).toEqual([]);
		expect(applyFilters([row], { ...state, cpv: ['72'] }, CAPTURE_NOW)).toEqual([]);
		expect(
			applyFilters([row], { ...state, from: '2026-10-07', to: undefined }, CAPTURE_NOW)
		).toEqual([]);
	});
});
