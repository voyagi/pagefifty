// A capture is named by the day it was taken. Imported under Node type stripping by the scripts as
// well as by the Worker code and the client list model: erasable syntax only, no framework import,
// and nothing that pulls the index schemas into the browser bundle.
import { formatDay, SERVER_TIME_ZONE } from '../core/deadline.ts';

export const CAPTURE_ID = /^\d{4}-\d{2}-\d{2}$/;

// The whole digit run is read, so a run longer or shorter than YYYYMMDD is seen whole, never read as
// the day its first eight digits spell.
const FIRST_PUBLISHED = /publication-date>=(\d+)/;

function firstPublishedId(query: string): string | undefined {
	const digits = FIRST_PUBLISHED.exec(query)?.[1];
	return digits?.length === 8
		? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
		: undefined;
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

// Every live page formats this day, and formatDay throws on an impossible month while 30 February
// reads as 2 March, so the capture line's schema refuses such a query where the build reads it. A
// clause whose digits are not YYYYMMDD names no day at all and is refused the same way; a query with
// no dated clause names no first day and is fine.
export function namesRealFirstDay(query: string): boolean {
	if (!FIRST_PUBLISHED.test(query)) return true;
	const id = firstPublishedId(query);
	return id !== undefined && isCalendarDay(id);
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
