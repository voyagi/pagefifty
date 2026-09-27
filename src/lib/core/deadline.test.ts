import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '../ingest/read-notice';
import type { LotRecord } from '../ingest/record';
import {
	SERVER_TIME_ZONE,
	cetDayEnd,
	cetDayStart,
	displayedDeadline,
	formatDeadline,
	isOpen,
	noticeDeadline,
	timeLeft,
	usableTimeZone
} from './deadline';

const AMSTERDAM = 'Europe/Amsterdam';
const NEW_YORK = 'America/New_York';
const CAPTURE_NOW = new Date('2026-09-15T12:00:00Z');

function lotsOf(role: RoleName, which = 0): LotRecord[] {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	return result.record.lots;
}

const tender = (instant: string) => ({ kind: 'tender' as const, instant });
const lotWith = (deadlines: LotRecord['deadlines']) => ({ deadlines });
const IN_NOTICE = lotWith({});

describe('displayedDeadline', () => {
	it('is the server zone the buyers in scope publish in', () => {
		expect(SERVER_TIME_ZONE).toBe(AMSTERDAM);
	});

	it('takes the request deadline when a lot has both', () => {
		const [lot] = lotsOf('both-deadlines');
		expect(lot.deadlines.tender).toBeDefined();
		expect(displayedDeadline(lot)).toEqual({
			kind: 'request',
			instant: '2026-09-29T12:00:00+02:00'
		});
	});

	it('takes the request deadline of a lot that has only one', () => {
		const [lot] = lotsOf('request-deadline-only');
		expect(displayedDeadline(lot)).toEqual({
			kind: 'request',
			instant: '2026-09-29T12:00:00+02:00'
		});
	});

	it('takes the tender deadline when there is no request deadline', () => {
		const [lot] = lotsOf('one-lot');
		expect(displayedDeadline(lot)).toEqual({
			kind: 'tender',
			instant: '2026-10-06T10:30:00+02:00'
		});
	});

	it('shows a lot with neither deadline as in the notice, open at any instant', () => {
		const [lot] = lotsOf('neither-deadline');
		const deadline = displayedDeadline(lot);
		expect(deadline).toEqual({ kind: 'in-notice' });
		expect(isOpen(deadline, new Date('1970-01-01T00:00:00Z'))).toBe(true);
		expect(isOpen(deadline, new Date('2999-12-31T23:59:59Z'))).toBe(true);
	});
});

describe('isOpen', () => {
	const deadline = tender('2026-10-06T10:00:00+02:00');

	it('counts a deadline exactly equal to now as closed', () => {
		expect(isOpen(deadline, new Date('2026-10-06T08:00:00Z'))).toBe(false);
	});

	it('counts a deadline one second later than now as open', () => {
		expect(isOpen(deadline, new Date('2026-10-06T07:59:59Z'))).toBe(true);
	});

	it('compares instants, not the published text, across offsets', () => {
		const utc = tender('2026-10-26T09:00:00+00:00');
		expect(isOpen(utc, new Date('2026-10-26T10:00:00+01:00'))).toBe(false);
		expect(isOpen(utc, new Date('2026-10-26T09:59:59+01:00'))).toBe(true);
	});

	describe('with the clock set far from the instants under test', () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		it('reads no clock: only the now it is given decides', () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
			const now = new Date('2025-01-01T00:00:00Z');
			expect(isOpen(deadline, now)).toBe(true);
			expect(noticeDeadline([lotWith({ tender: deadline.instant })], now).open).toBe(true);
			expect(timeLeft(deadline.instant, now)).toBe('643 days');
		});
	});
});

describe('noticeDeadline', () => {
	it('shows the earliest open lot and flags lots whose deadlines differ', () => {
		const lots = lotsOf('lots-differ');
		expect(lots.map((lot) => lot.deadlines.tender)).toEqual([
			'2026-10-05T10:00:00+02:00',
			'2026-10-06T10:00:00+02:00'
		]);
		const expected = {
			open: true,
			shown: tender('2026-10-05T10:00:00+02:00'),
			lotsDiffer: true,
			openLotCount: 2
		};
		expect(noticeDeadline(lots, CAPTURE_NOW)).toEqual(expected);
		expect(noticeDeadline([...lots].reverse(), CAPTURE_NOW)).toEqual(expected);
	});

	it('counts only the lots still open once the earlier one has closed', () => {
		const lots = lotsOf('lots-differ');
		expect(noticeDeadline(lots, new Date('2026-10-05T12:00:00Z'))).toEqual({
			open: true,
			shown: tender('2026-10-06T10:00:00+02:00'),
			lotsDiffer: false,
			openLotCount: 1
		});
	});

	it('does not flag lots that share one instant published in different offsets', () => {
		const lots = [
			lotWith({ tender: '2026-10-26T09:00:00+00:00' }),
			lotWith({ tender: '2026-10-26T10:00:00+01:00' })
		];
		const result = noticeDeadline(lots, CAPTURE_NOW);
		expect(result.lotsDiffer).toBe(false);
		expect(result.openLotCount).toBe(2);
	});

	it('shows two lots of one real notice with the same deadline as not differing', () => {
		const result = noticeDeadline(lotsOf('multi-lot'), CAPTURE_NOW);
		expect(result).toEqual({
			open: true,
			shown: tender('2026-10-05T10:00:00+02:00'),
			lotsDiffer: false,
			openLotCount: 2
		});
	});

	it('reports a notice whose lots have all closed with its latest deadline, in any lot order', () => {
		const lots = [
			lotWith({ tender: '2026-10-01T10:00:00+02:00' }),
			lotWith({ request: '2026-10-03T12:00:00+02:00' }),
			lotWith({ tender: '2026-10-02T10:00:00+02:00' })
		];
		const now = new Date('2026-11-01T00:00:00Z');
		const expected = {
			open: false,
			shown: { kind: 'request', instant: '2026-10-03T12:00:00+02:00' },
			lotsDiffer: false,
			openLotCount: 0
		};
		expect(noticeDeadline(lots, now)).toEqual(expected);
		expect(noticeDeadline([...lots].reverse(), now)).toEqual(expected);
	});

	it('keeps a notice open while an in-notice lot sits beside closed dated lots', () => {
		const lots = [lotWith({ tender: '2026-10-01T10:00:00+02:00' }), IN_NOTICE];
		const now = new Date('2026-11-01T00:00:00Z');
		for (const order of [lots, [...lots].reverse()]) {
			expect(noticeDeadline(order, now)).toEqual({
				open: true,
				shown: { kind: 'in-notice' },
				lotsDiffer: false,
				openLotCount: 1
			});
		}
	});

	it('shows the earliest dated open lot beside an in-notice lot and flags the difference', () => {
		const lots = [IN_NOTICE, lotWith({ tender: '2026-10-09T10:00:00+02:00' })];
		for (const order of [lots, [...lots].reverse()]) {
			expect(noticeDeadline(order, CAPTURE_NOW)).toEqual({
				open: true,
				shown: tender('2026-10-09T10:00:00+02:00'),
				lotsDiffer: true,
				openLotCount: 2
			});
		}
	});

	it('reports a notice whose lots are all in the notice as in the notice and open', () => {
		expect(noticeDeadline([IN_NOTICE, IN_NOTICE], CAPTURE_NOW)).toEqual({
			open: true,
			shown: { kind: 'in-notice' },
			lotsDiffer: false,
			openLotCount: 2
		});
	});

	it('treats a notice with no lots as having no deadline, never as closed', () => {
		expect(noticeDeadline([], CAPTURE_NOW)).toEqual({
			open: true,
			shown: { kind: 'in-notice' },
			lotsDiffer: false,
			openLotCount: 0
		});
	});
});

describe('formatDeadline', () => {
	it('names Central European Summer Time in Amsterdam and Eastern Daylight Time in New York', () => {
		expect(formatDeadline('2026-10-06T10:00:00+02:00', AMSTERDAM)).toBe('6 Oct 2026, 10:00 CEST');
		expect(formatDeadline('2026-10-06T10:00:00+02:00', NEW_YORK)).toBe('6 Oct 2026, 04:00 EDT');
	});

	it('switches from CEST to CET at 2026-10-25 01:00 UTC', () => {
		expect(formatDeadline('2026-10-25T00:59:59Z', AMSTERDAM)).toBe('25 Oct 2026, 02:59 CEST');
		expect(formatDeadline('2026-10-25T01:00:00Z', AMSTERDAM)).toBe('25 Oct 2026, 02:00 CET');
	});

	it('writes September as Sep, not the Sept some en-GB data now gives', () => {
		expect(formatDeadline('2026-09-29T12:00:00+02:00', AMSTERDAM)).toBe('29 Sep 2026, 12:00 CEST');
	});

	it('writes midnight as 00:00 on a 24-hour clock', () => {
		expect(formatDeadline('2026-12-31T23:00:00Z', AMSTERDAM)).toBe('1 Jan 2027, 00:00 CET');
	});

	it('keeps the GMT offset where no locale has a short name for the zone', () => {
		expect(formatDeadline('2026-10-06T10:00:00+02:00', 'America/Sao_Paulo')).toBe(
			'6 Oct 2026, 05:00 GMT-3'
		);
	});

	it('uses the en-GB name where it has one', () => {
		expect(formatDeadline('2026-07-01T12:00:00Z', 'Europe/London')).toBe('1 Jul 2026, 13:00 BST');
	});

	describe('the DST fixtures on both sides of 2026-10-25 01:00 UTC', () => {
		const cases = [
			{
				role: 'before-dst',
				which: 0,
				notice: '609569-2026',
				instant: '2026-10-23T21:59:00.000Z',
				amsterdam: '23 Oct 2026, 23:59 CEST',
				newYork: '23 Oct 2026, 17:59 EDT'
			},
			{
				role: 'before-dst',
				which: 1,
				notice: '601844-2026',
				instant: '2026-10-23T08:00:00.000Z',
				amsterdam: '23 Oct 2026, 10:00 CEST',
				newYork: '23 Oct 2026, 04:00 EDT'
			},
			{
				role: 'after-dst',
				which: 0,
				notice: '628444-2026',
				instant: '2026-10-26T09:00:00.000Z',
				amsterdam: '26 Oct 2026, 10:00 CET',
				newYork: '26 Oct 2026, 05:00 EDT'
			},
			{
				role: 'after-dst',
				which: 1,
				notice: '612411-2026',
				instant: '2026-10-26T08:00:00.000Z',
				amsterdam: '26 Oct 2026, 09:00 CET',
				newYork: '26 Oct 2026, 04:00 EDT'
			}
		] as const;

		it.each(cases)(
			'$role $notice is one instant, labelled in each zone',
			({ role, which, instant, amsterdam, newYork }) => {
				const [lot] = lotsOf(role, which);
				const deadline = displayedDeadline(lot);
				if (deadline.kind === 'in-notice') throw new Error(`${role} has no deadline`);
				expect(new Date(deadline.instant).toISOString()).toBe(instant);
				expect(formatDeadline(deadline.instant, AMSTERDAM)).toBe(amsterdam);
				expect(formatDeadline(deadline.instant, NEW_YORK)).toBe(newYork);
			}
		);
	});
});

describe('usableTimeZone', () => {
	it('keeps a zone Intl can format in, an old alias included', () => {
		expect(usableTimeZone(NEW_YORK)).toBe(NEW_YORK);
		const alias = usableTimeZone('Asia/Calcutta');
		expect(formatDeadline('2026-10-06T10:00:00+02:00', alias)).toBe('6 Oct 2026, 13:30 GMT+5:30');
	});

	it('falls back to the server zone for a zone a browser reports but Intl refuses', () => {
		for (const zone of ['Etc/Unknown', 'Factory', '', undefined]) {
			expect(usableTimeZone(zone)).toBe(SERVER_TIME_ZONE);
		}
	});
});

describe('timeLeft', () => {
	const instant = '2026-10-06T10:00:00+02:00';

	it('counts whole days, floored', () => {
		expect(timeLeft(instant, new Date('2026-10-01T08:00:00Z'))).toBe('5 days');
		expect(timeLeft(instant, new Date('2026-10-01T08:00:01Z'))).toBe('4 days');
	});

	it('says one day in the singular', () => {
		expect(timeLeft(instant, new Date('2026-10-05T08:00:00Z'))).toBe('1 day');
	});

	it('says less than a day under 24 hours', () => {
		expect(timeLeft(instant, new Date('2026-10-05T08:00:01Z'))).toBe('less than a day');
		expect(timeLeft(instant, new Date('2026-10-06T07:59:59Z'))).toBe('less than a day');
	});

	it('gives nothing once the deadline has passed or is now', () => {
		expect(timeLeft(instant, new Date('2026-10-06T08:00:00Z'))).toBeUndefined();
		expect(timeLeft(instant, new Date('2026-10-07T08:00:00Z'))).toBeUndefined();
	});
});

describe('Central European filter days', () => {
	it('starts 25 October 2026 at midnight CEST', () => {
		expect(cetDayStart('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
	});

	it('ends 25 October 2026 at midnight CET, the day the clocks go back', () => {
		expect(cetDayEnd('2026-10-25').toISOString()).toBe('2026-10-25T22:59:59.999Z');
	});

	it('gives the day the clocks go forward 23 hours', () => {
		expect(cetDayStart('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
		expect(cetDayEnd('2026-03-29').toISOString()).toBe('2026-03-29T21:59:59.999Z');
	});

	it('crosses a month and a year end', () => {
		expect(cetDayStart('2027-01-01').toISOString()).toBe('2026-12-31T23:00:00.000Z');
		expect(cetDayEnd('2026-10-31').toISOString()).toBe('2026-10-31T22:59:59.999Z');
	});
});
