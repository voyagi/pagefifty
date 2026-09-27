// The one deadline rule. The list's order, its open and closed groups, the date filter and every
// rendered date read these functions, so a notice can never show open while filtering as closed.
// No function here reads the clock: "now" is always an argument, so one render judges every card
// against the same instant (D-06).
import type { LotDeadlines } from '../ingest/record.ts';

// Every buyer in scope publishes in CET or CEST, and the server cannot know a visitor's zone
// without a cookie, which phase 1 does not set (D-11). The server renders in this zone and the
// browser re-renders in the visitor's own zone after hydration.
export const SERVER_TIME_ZONE = 'Europe/Amsterdam';

type DatedDeadline = { kind: 'request' | 'tender'; instant: string };
export type DisplayedDeadline = DatedDeadline | { kind: 'in-notice' };

export interface NoticeDeadline {
	open: boolean;
	shown: DisplayedDeadline;
	lotsDiffer: boolean;
	openLotCount: number;
}

interface HasDeadlines {
	deadlines: LotDeadlines;
}

const IN_NOTICE: DisplayedDeadline = { kind: 'in-notice' };
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const epoch = (deadline: DatedDeadline) => Date.parse(deadline.instant);
const isDated = (deadline: DisplayedDeadline): deadline is DatedDeadline =>
	deadline.kind !== 'in-notice';

export function displayedDeadline({ deadlines }: HasDeadlines): DisplayedDeadline {
	if (deadlines.request) return { kind: 'request', instant: deadlines.request };
	if (deadlines.tender) return { kind: 'tender', instant: deadlines.tender };
	return IN_NOTICE;
}

// A deadline equal to now has passed. A lot without one can never be counted as closed.
export function isOpen(deadline: DisplayedDeadline, now: Date): boolean {
	return !isDated(deadline) || epoch(deadline) > now.getTime();
}

function earliest(deadlines: DatedDeadline[]): DatedDeadline {
	return deadlines.reduce((best, each) => (epoch(each) < epoch(best) ? each : best));
}

function latest(deadlines: DatedDeadline[]): DatedDeadline {
	return deadlines.reduce((best, each) => (epoch(each) > epoch(best) ? each : best));
}

// Instants, not published text, decide whether lots share a deadline: +00:00 and +01:00 can
// name the same moment.
const sameness = (deadline: DisplayedDeadline) =>
	isDated(deadline) ? String(epoch(deadline)) : deadline.kind;

// Open while any lot is open (D-08). An open notice shows its earliest dated open lot; a closed
// one shows the last deadline that passed, since that is when it closed.
export function noticeDeadline(lots: readonly HasDeadlines[], now: Date): NoticeDeadline {
	const deadlines = lots.map(displayedDeadline);
	const open = deadlines.filter((deadline) => isOpen(deadline, now));
	if (open.length === 0 && deadlines.length > 0) {
		const shown = latest(deadlines.filter(isDated));
		return { open: false, shown, lotsDiffer: false, openLotCount: 0 };
	}
	const dated = open.filter(isDated);
	return {
		open: true,
		shown: dated.length > 0 ? earliest(dated) : IN_NOTICE,
		lotsDiffer: new Set(open.map(sameness)).size > 1,
		openLotCount: open.length
	};
}

function partsIn(
	instant: Date,
	timeZone: string,
	options: Intl.DateTimeFormatOptions,
	locale = 'en-GB'
): Record<string, string> {
	const parts = new Intl.DateTimeFormat(locale, { timeZone, ...options }).formatToParts(instant);
	return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

const GMT_OFFSET = /^GMT[+-]/;

// en-GB names Central European zones (CET, CEST) but writes "GMT-4" for New York, where en-US
// says "EDT". Where neither locale has a name, the offset is the honest label.
function zoneName(instant: Date, timeZone: string): string {
	const british = partsIn(instant, timeZone, { timeZoneName: 'short' }).timeZoneName;
	if (!GMT_OFFSET.test(british)) return british;
	const american = partsIn(instant, timeZone, { timeZoneName: 'short' }, 'en-US').timeZoneName;
	return GMT_OFFSET.test(american) ? british : american;
}

// Month names come from the table: en-GB data now writes September as "Sept".
export function formatDeadline(instant: string, timeZone: string): string {
	const moment = new Date(instant);
	const part = partsIn(moment, timeZone, {
		day: 'numeric',
		month: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	});
	const date = `${Number(part.day)} ${MONTHS[Number(part.month) - 1]} ${part.year}`;
	return `${date}, ${part.hour}:${part.minute} ${zoneName(moment, timeZone)}`;
}

// A browser that cannot tell its own zone reports a name Intl refuses ("Etc/Unknown" in Chromium on
// a misconfigured host), and formatting in it throws. The label then stays in the server's zone,
// which it already showed before hydration, rather than breaking the page after it.
export function usableTimeZone(zone: string | undefined): string {
	if (!zone) return SERVER_TIME_ZONE;
	try {
		return new Intl.DateTimeFormat('en-GB', { timeZone: zone }).resolvedOptions().timeZone;
	} catch (error) {
		if (error instanceof RangeError) return SERVER_TIME_ZONE;
		throw error;
	}
}

export function timeLeft(instant: string, now: Date): string | undefined {
	const remaining = Date.parse(instant) - now.getTime();
	if (remaining <= 0) return undefined;
	const days = Math.floor(remaining / DAY_MS);
	if (days === 0) return 'less than a day';
	return days === 1 ? '1 day' : `${days} days`;
}

// longOffset writes "GMT+02:00", or a bare "GMT" at a zero offset, where both slices are empty
// and read as 0.
function serverOffsetMinutes(at: number): number {
	const text = partsIn(new Date(at), SERVER_TIME_ZONE, { timeZoneName: 'longOffset' }).timeZoneName;
	const hours = Number(text.slice(3, 6));
	return hours * 60 + Math.sign(hours) * Number(text.slice(7, 9));
}

// The offset is read for the day itself, never assumed to be +01:00 or +02:00. Reading it twice
// settles a guess taken on the far side of a change; Central European clocks change at 01:00
// UTC, never near local midnight, so the second reading is the day's own.
function serverMidnight(year: number, month: number, day: number): number {
	const utcMidnight = Date.UTC(year, month - 1, day);
	const guess = utcMidnight - serverOffsetMinutes(utcMidnight) * 60_000;
	return utcMidnight - serverOffsetMinutes(guess) * 60_000;
}

function calendarDay(date: string): [number, number, number] {
	const [year, month, day] = date.split('-').map(Number);
	return [year, month, day];
}

export function cetDayStart(date: string): Date {
	return new Date(serverMidnight(...calendarDay(date)));
}

export function cetDayEnd(date: string): Date {
	const [year, month, day] = calendarDay(date);
	return new Date(serverMidnight(year, month, day + 1) - 1);
}
