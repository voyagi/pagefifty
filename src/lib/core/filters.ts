// The list's filters live only in the query string (D-10), so anyone can type anything into it.
// Values outside the closed lists are dropped and flagged, and the list still renders.
import type { LotDeadlines } from '../ingest/record.ts';
import { cetDayEnd, cetDayStart, noticeDeadline } from './deadline.ts';

export const COUNTRIES = ['NL', 'BE', 'DE'] as const;
export const CPV_GROUPS = ['72', '48'] as const;

type Country = (typeof COUNTRIES)[number];
type CpvGroup = (typeof CPV_GROUPS)[number];

export interface FilterState {
	countries: Country[];
	cpv: CpvGroup[];
	from?: string;
	to?: string;
}

interface FilterableRow {
	country: readonly string[];
	cpvCodes: readonly string[];
	lots: readonly { deadlines: LotDeadlines }[];
}

// Buyers carry ISO 3166-1 alpha-3 codes; the filter speaks alpha-2.
const COUNTRY_OF_BUYER: ReadonlyMap<string, Country> = new Map([
	['NLD', 'NL'],
	['BEL', 'BE'],
	['DEU', 'DE']
]);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Central European offsets before 1970 include local mean time with seconds, which the day
// bounds do not model, and no notice in scope dates from then.
const FIRST_YEAR = 1970;

function isFilterDay(value: string): boolean {
	if (!DAY.test(value) || Number(value.slice(0, 4)) < FIRST_YEAR) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// Canonical order is the list's own order, so the same filters always make the same URL.
function pickListed<T extends string>(values: string[], allowed: readonly T[]) {
	const known: ReadonlySet<string> = new Set(allowed);
	const seen = new Set(values);
	return {
		picked: allowed.filter((value) => seen.has(value)),
		dropped: values.some((value) => !known.has(value))
	};
}

// The plain GET form submits an empty date field as "from=", which means no bound, not junk. A day
// given twice is kept once, as a country is; two different days are one too many.
function pickDay(values: string[]) {
	const given = [...new Set(values.filter((value) => value !== ''))];
	const [day] = given;
	const valid = day !== undefined && isFilterDay(day);
	return {
		day: valid ? day : undefined,
		dropped: given.length > 1 || (given.length > 0 && !valid)
	};
}

export function parseFilters(params: URLSearchParams): { state: FilterState; dropped: boolean } {
	const countries = pickListed(params.getAll('country'), COUNTRIES);
	const cpv = pickListed(params.getAll('cpv'), CPV_GROUPS);
	const from = pickDay(params.getAll('from'));
	const to = pickDay(params.getAll('to'));
	return {
		state: {
			countries: countries.picked,
			cpv: cpv.picked,
			...(from.day && { from: from.day }),
			...(to.day && { to: to.day })
		},
		dropped: countries.dropped || cpv.dropped || from.dropped || to.dropped
	};
}

export function toSearch(state: FilterState): string {
	const params = new URLSearchParams();
	for (const country of COUNTRIES.filter((each) => state.countries.includes(each))) {
		params.append('country', country);
	}
	for (const group of CPV_GROUPS.filter((each) => state.cpv.includes(each))) {
		params.append('cpv', group);
	}
	if (state.from) params.append('from', state.from);
	if (state.to) params.append('to', state.to);
	return params.toString();
}

export function isActive(state: FilterState): boolean {
	return state.countries.length > 0 || state.cpv.length > 0 || !!state.from || !!state.to;
}

// Filter days are YYYY-MM-DD, so text order is day order.
export function rangeInverted(state: FilterState): boolean {
	return !!state.from && !!state.to && state.from > state.to;
}

function inCountries(row: FilterableRow, countries: readonly Country[]): boolean {
	if (countries.length === 0) return true;
	return row.country.some((code) => countries.some((each) => COUNTRY_OF_BUYER.get(code) === each));
}

// Every main and additional code counts: a main code can sit outside the IT groups while an
// additional one is inside (research Pitfall 4).
function inGroups(row: FilterableRow, groups: readonly CpvGroup[]): boolean {
	if (groups.length === 0) return true;
	return row.cpvCodes.some((code) => groups.some((group) => code.startsWith(group)));
}

export function applyFilters<Row extends FilterableRow>(
	rows: readonly Row[],
	state: FilterState,
	now: Date
): Row[] {
	if (rangeInverted(state)) return [];
	const start = state.from ? cetDayStart(state.from).getTime() : -Infinity;
	const end = state.to ? cetDayEnd(state.to).getTime() : Infinity;
	const dated = !!state.from || !!state.to;
	return rows.filter((row) => {
		if (!inCountries(row, state.countries) || !inGroups(row, state.cpv)) return false;
		if (!dated) return true;
		// A notice is filtered by the one deadline the list shows for it (D-08), so a later lot's
		// own deadline does not match a day by itself.
		const { shown } = noticeDeadline(row.lots, now);
		if (shown.kind === 'in-notice') return false;
		const at = Date.parse(shown.instant);
		return at >= start && at <= end;
	});
}
