// A capture is named by the day it was taken. Imported under Node type stripping by the scripts as
// well as by the Worker code and the client list model: erasable syntax only, no framework import,
// and nothing that pulls the index schemas into the browser bundle.
import { formatDay, SERVER_TIME_ZONE } from '../core/deadline.ts';

export const CAPTURE_ID = /^\d{4}-\d{2}-\d{2}$/;

// Every publication-date>= clause is found whatever follows its operator, and its value runs to the
// next space or closing bracket, so a value that is not YYYYMMDD, or a second lower bound, is seen
// rather than skipped or read as the day its first eight digits spell.
const FIRST_PUBLISHED = /publication-date\s*>=\s*([^\s)]*)/g;
const YYYYMMDD = /^\d{8}$/;

function firstPublishedValues(query: string): string[] {
	return [...query.matchAll(FIRST_PUBLISHED)].map((clause) => clause[1]);
}

// A day only for a query with exactly one dated clause, written as YYYYMMDD and naming a calendar
// day: formatDay throws on an impossible month and reads 30 February as 2 March, so no other value
// is ever formatted.
function firstPublishedId(query: string): string | undefined {
	const values = firstPublishedValues(query);
	if (values.length !== 1 || !YYYYMMDD.test(values[0])) return undefined;
	const [digits] = values;
	const id = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
	return isCalendarDay(id) ? id : undefined;
}

// A filter day, a capture's first publication day and the capture's own day are all written as the
// buyers in scope count days, in the zone and the words every deadline uses. Noon UTC is the same
// calendar day in every zone in scope.
export function dayText(day: string): string {
	return formatDay(`${day}T12:00:00Z`, SERVER_TIME_ZONE);
}

export function captureDay(fetchedAt: string): string {
	return formatDay(fetchedAt, SERVER_TIME_ZONE);
}

// The first publication day is read from the query the capture ran, so a new capture cannot leave a
// page naming the old one's window.
export function firstPublishedDay(query: string): string | undefined {
	const id = firstPublishedId(query);
	return id ? dayText(id) : undefined;
}

// A dated clause that yields no day would leave every live page silently without its "published
// from" phrase, so the capture line's schema refuses it where the build reads it: a value that is not
// a calendar day as YYYYMMDD, or a second clause, which leaves the window's start unnamed. A query
// with no dated clause names no first day and is fine.
export function namesRealFirstDay(query: string): boolean {
	return firstPublishedValues(query).length === 0 || firstPublishedId(query) !== undefined;
}

// A name like 2026-02-30 matches the pattern but names no day, and sorting it in would let a
// mistyped folder win over every real capture. The build's capture line schema and the live pages'
// choice of capture both ask this, so the build refuses a folder the pages would never serve.
export function isCaptureId(id: string): boolean {
	return CAPTURE_ID.test(id) && isCalendarDay(id);
}

function isCalendarDay(id: string): boolean {
	const [year, month, day] = id.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

export function newestCapture(ids: Iterable<string>): string {
	const dated = [...ids].filter(isCaptureId).sort();
	if (dated.length === 0) {
		throw new Error(
			'no built capture: scripts/build-records.mjs writes them, and npm run dev, npm run build and the test run each call it first'
		);
	}
	return dated[dated.length - 1];
}
