// The list model /tenders and /example share. Pure: the index, the filter state and "now" all come
// in as arguments, so the order, the open and closed groups and the rendered dates of one page are
// judged against the one instant its loader was given (D-06).
import type { LangText, Amount } from '../ingest/record';
import type { IndexRow, SnapshotIndex } from '../snapshot/index-row';
import { captureDay, dayText, firstPublishedDay } from '../snapshot/capture-id';
import { noticeDeadline, type NoticeDeadline } from '../core/deadline';
import { applyFilters, isActive, rangeInverted, type FilterState } from '../core/filters';
import { readingStatus, type ReadingStatus } from '../core/reading';

// Buyers carry ISO 3166-1 alpha-3 codes. A joint procurement can list buyers from across the EU
// beside one in scope (612350-2026 lists 19 countries), so every EU and EEA country is named, and
// a code outside this table is shown as published. A Map, because the code comes from the notice
// and a plain object would answer "constructor" with a built-in function.
const COUNTRY_NAMES: ReadonlyMap<string, string> = new Map([
	['AUT', 'Austria'],
	['BEL', 'Belgium'],
	['BGR', 'Bulgaria'],
	['HRV', 'Croatia'],
	['CYP', 'Cyprus'],
	['CZE', 'Czechia'],
	['DNK', 'Denmark'],
	['EST', 'Estonia'],
	['FIN', 'Finland'],
	['FRA', 'France'],
	['DEU', 'Germany'],
	['GRC', 'Greece'],
	['HUN', 'Hungary'],
	['ISL', 'Iceland'],
	['IRL', 'Ireland'],
	['ITA', 'Italy'],
	['LVA', 'Latvia'],
	['LIE', 'Liechtenstein'],
	['LTU', 'Lithuania'],
	['LUX', 'Luxembourg'],
	['MLT', 'Malta'],
	['NLD', 'Netherlands'],
	['NOR', 'Norway'],
	['POL', 'Poland'],
	['PRT', 'Portugal'],
	['ROU', 'Romania'],
	['SVK', 'Slovakia'],
	['SVN', 'Slovenia'],
	['ESP', 'Spain'],
	['SWE', 'Sweden']
]);

export function countryName(code: string): string {
	return COUNTRY_NAMES.get(code) ?? code;
}

const COUNTRY_OF_FILTER: Readonly<Record<string, string>> = {
	NL: 'Netherlands',
	BE: 'Belgium',
	DE: 'Germany'
};

const WORK_OF_FILTER: Readonly<Record<string, string>> = {
	'72': 'IT services',
	'48': 'software packages'
};

export const CANCEL_INTENT_LINE =
	'The buyer has announced that it intends to cancel this procedure.';

export interface ListRow {
	noticeNumber: string;
	title: LangText;
	buyer?: LangText;
	// A joint procurement names several buyers; the row shows the first and counts the rest, so it
	// never reads as that one buyer's tender alone.
	otherBuyers: number;
	countries: string[];
	value: string | null;
	deadline: NoticeDeadline;
	reading: ReadingStatus;
	cancelIntent: boolean;
}

export interface ListCounts {
	total: number;
	shown: number;
	open: number;
	closed: number;
}

export interface TenderList {
	open: ListRow[];
	closed: ListRow[];
	counts: ListCounts;
	filtered: boolean;
	inverted: boolean;
}

export interface CaptureFacts {
	capturedOn: string;
	fetchedAt: string;
	firstPublished?: string;
}

// What the list loader hands the page. It lives here, not beside the loader, because components may
// not import from lib/server.
export interface TenderListData {
	list: TenderList;
	filters: FilterState;
	dropped: boolean;
	capture: CaptureFacts;
}

// A UBL amount is an xs:decimal, which allows a leading sign: the XML Schema spec's own example is
// "+100000.00". The ingest keeps the text as published, so "+" reads as the same value, a point
// with no digits after it as no fraction, and a negative amount is below the floor, a placeholder
// like "0".
const AMOUNT = /^([+-])?(\d+)(?:\.(\d*))?$/;
// EUR 1,000 in cents, as digits: amounts are compared as digit strings, so no published value is
// ever rounded through a float on its way to the floor test.
const FLOOR_CENTS = '100000';

function atLeast(digits: string, floor: string): boolean {
	const trimmed = digits.replace(/^0+/, '');
	if (trimmed.length !== floor.length) return trimmed.length > floor.length;
	return trimmed >= floor;
}

function grouped(whole: string): string {
	const digits = whole.replace(/^0+(?=\d)/, '');
	return digits.replace(/\B(?=(\d{3})+$)/g, ',');
}

// Below EUR 1,000 a published value is a placeholder ("0", "1"), not an estimate (D-09).
export function formatValue(value: Amount | undefined): string | null {
	if (!value) return null;
	const match = AMOUNT.exec(value.amount);
	if (!match) return null;
	const [, sign, whole, fraction = ''] = match;
	if (sign === '-') return null;
	const cents = whole + fraction.padEnd(2, '0').slice(0, 2);
	if (!atLeast(cents, FLOOR_CENTS)) return null;
	const kept = fraction.replace(/0+$/, '');
	const decimals = kept === '' ? '' : `.${kept.padEnd(2, '0')}`;
	return `${value.currency} ${grouped(whole)}${decimals}`;
}

function toListRow(row: IndexRow, now: Date): ListRow {
	const buyer = row.buyers[0]?.name;
	return {
		noticeNumber: row.noticeNumber,
		title: row.title,
		...(buyer && { buyer }),
		otherBuyers: Math.max(0, row.buyers.length - 1),
		countries: row.country.map(countryName),
		value: formatValue(row.estimatedValue),
		deadline: noticeDeadline(row.lots, now),
		reading: readingStatus(row.lots.map((lot) => lot.coverage)),
		cancelIntent: row.cancelIntent === true
	};
}

const shownAt = (row: ListRow) =>
	row.deadline.shown.kind === 'in-notice' ? Infinity : Date.parse(row.deadline.shown.instant);

// "609955-2026": the year, then the running number of that year.
function noticeKey(notice: string): [number, number] {
	const [running, year] = notice.split('-').map(Number);
	return [year, running];
}

function byNotice(a: ListRow, b: ListRow): number {
	const [yearA, runningA] = noticeKey(a.noticeNumber);
	const [yearB, runningB] = noticeKey(b.noticeNumber);
	return yearA - yearB || runningA - runningB;
}

// Infinity sorts "In notice" last; two of them compare equal rather than as NaN.
function byShownDeadline(a: ListRow, b: ListRow): number {
	const at = shownAt(a);
	const bt = shownAt(b);
	if (at !== bt) return at < bt ? -1 : 1;
	return byNotice(a, b);
}

export function buildTenderList(
	index: Pick<SnapshotIndex, 'rows'>,
	state: FilterState,
	now: Date
): TenderList {
	const rows = applyFilters(index.rows, state, now).map((row) => toListRow(row, now));
	const open = rows.filter((row) => row.deadline.open).sort(byShownDeadline);
	const closed = rows.filter((row) => !row.deadline.open).sort(byShownDeadline);
	return {
		open,
		closed,
		counts: {
			total: index.rows.length,
			shown: rows.length,
			open: open.length,
			closed: closed.length
		},
		filtered: isActive(state),
		inverted: rangeInverted(state)
	};
}

// Figures stay numbers so the page can set them in Mono; the words around them are plain text.
export type CountsLine = (string | number)[];

// The live list says "closed" alone: 13 capture notices had closed before the capture was taken, so
// "closed since the capture" would be false for them.
export function countsLine(
	counts: ListCounts,
	filtered: boolean,
	closedWords = 'closed'
): CountsLine {
	const notices = counts.total === 1 ? ' notice' : ' notices';
	if (!filtered) {
		return [
			counts.open,
			' open and ',
			counts.closed,
			` ${closedWords}, of `,
			counts.total,
			`${notices}.`
		];
	}
	const verb = counts.shown === 1 ? ' matches' : ' match';
	return [
		counts.shown,
		' of ',
		counts.total,
		`${notices}${verb} these filters: `,
		counts.open,
		' open, ',
		counts.closed,
		` ${closedWords}.`
	];
}

// The page components read it from here, beside the other list words.
export { dayText };

// The reading most rows of a list share. The list writes that one as plain text and tags only the
// rows that differ, so the tag marks the exception. A tie has no most common reading.
export function commonReading(rows: readonly ListRow[]): ReadingStatus['tag'] | undefined {
	const counts = new Map<ReadingStatus['tag'], number>();
	for (const row of rows) counts.set(row.reading.tag, (counts.get(row.reading.tag) ?? 0) + 1);
	const ranked = [...counts].sort((a, b) => b[1] - a[1]);
	const [first, second] = ranked;
	if (first === undefined || first[1] === second?.[1]) return undefined;
	return first[0];
}

// Up to two letters from the first two words of a buyer's name, standing where a job board shows
// the employer's logo. Digits and marks are not letters, so "Gemeente 's-Hertogenbosch" gives GS.
// A pair that spells GO would put the verdict's word in a box on a page that shows no verdict
// (SPEC R3), so that buyer keeps its first letter alone.
export function initialsOf(name: string): string {
	const letters = name
		.replace(/[^\p{L}\s]/gu, ' ')
		.split(/\s+/)
		.filter((word) => word !== '')
		.slice(0, 2)
		.map((word) => word.charAt(0).toLocaleUpperCase('en'))
		.join('');
	return letters === 'GO' ? 'G' : letters;
}

export function captureFacts(capture: SnapshotIndex['capture']): CaptureFacts {
	const firstPublished = firstPublishedDay(capture.query);
	return {
		capturedOn: captureDay(capture.fetchedAt),
		fetchedAt: capture.fetchedAt,
		...(firstPublished && { firstPublished })
	};
}

export function filterSummary(state: FilterState): string {
	return [
		...state.countries.map((code) => COUNTRY_OF_FILTER[code]),
		...state.cpv.map((group) => WORK_OF_FILTER[group]),
		...(state.from ? [`deadline on or after ${dayText(state.from)}`] : []),
		...(state.to ? [`deadline on or before ${dayText(state.to)}`] : [])
	].join(', ');
}
