import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capturePath } from '../../test/fixtures/node';
import { decideLotStatus, type LotContext } from '../core/compare';
import { summarizeLot } from '../core/coverage-facts';
import { displayedDeadline } from '../core/deadline';
import { lotStatusOf } from '../core/lot-reading';
import { readNotice } from '../ingest/read-notice';
import type { LotRecord, NoticeRecord } from '../ingest/record';
import { DEMO_PROFILE } from '../profile/demo-firm';
import { ReadingsFileSchema, type NoticeReadings } from '../snapshot/readings';
import { buildTenderPage } from './tender-page';
import { lotVerdict } from './verdict-view';

// The example's instant: the 2026-09-15 capture's own time.
const NOW = new Date('2026-09-15T12:00:00Z');

function capturedRecord(notice: string): NoticeRecord {
	const result = readNotice(new Uint8Array(readFileSync(capturePath(notice))), {
		noticeNumber: notice
	});
	if (!result.ok) throw new Error(`${notice} did not read: ${result.detail}`);
	return result.record;
}

function exampleReadings(notice: string): NoticeReadings {
	const file = ReadingsFileSchema.parse(
		JSON.parse(readFileSync('examples/2026-09-15/readings.json', 'utf8'))
	);
	return {
		notice,
		lots: file.notices.find((each) => each.notice === notice)?.lots ?? [],
		readings: file.readings.filter((reading) => reading.notice === notice)
	};
}

// The context the core tests build for a tracked lot, written out again here so the browser path is
// checked against the core path rather than against itself.
function contextOf(record: NoticeRecord, lot: LotRecord, now: string): LotContext {
	const shown = displayedDeadline(lot);
	return {
		legalBasis: record.legalBasis,
		deadline: shown.kind === 'in-notice' ? null : shown.instant,
		now,
		coverage: summarizeLot(lot),
		cancelIntent: record.cancelIntent === true,
		reserved: lot.reserved
	};
}

const notReadOnly = (notice: string, lot: string): NoticeReadings => ({
	notice,
	lots: [{ lot, status: 'not-read', reason: 'cap-reached' }],
	readings: []
});

describe('lotVerdict', () => {
	it('lotVerdict decides with the core path', () => {
		const record = capturedRecord('610242-2026');
		const readings = exampleReadings('610242-2026');
		const page = buildTenderPage(record, NOW, readings);
		const expected = decideLotStatus(
			lotStatusOf(record.lots[0], readings),
			DEMO_PROFILE,
			contextOf(record, record.lots[0], NOW.toISOString())
		);
		expect(expected?.decision).toEqual({ verdict: 'ASK FIRST', reason: 'profile-field-missing' });
		const view = lotVerdict(page.lots[0], DEMO_PROFILE, page.now);
		expect(view?.decision).toEqual(expected?.decision);
		expect(view?.label).toBe('Ask first');
		expect(view?.criteria.map((criterion) => criterion.state)).toEqual([
			'not-assessed',
			'not-assessed',
			'not-compared',
			'not-compared',
			'PROFILE_GAP',
			'PROFILE_GAP'
		]);
	});

	it('the Dutch example lot decides route-unsettled with one state per criterion', () => {
		const record = capturedRecord('634398-2026');
		const readings = exampleReadings('634398-2026');
		const page = buildTenderPage(record, NOW, readings);
		const index = record.lots.findIndex((lot) => lot.id === 'LOT-0001');
		const view = lotVerdict(page.lots[index], DEMO_PROFILE, page.now);
		expect(view?.decision).toEqual({ verdict: 'ASK FIRST', reason: 'route-unsettled' });
		expect(view?.criteria.map((criterion) => criterion.state)).toEqual([
			'not-compared',
			'PROFILE_GAP',
			'PROFILE_GAP',
			'SHORT_ROUTE_UNSETTLED',
			'not-compared'
		]);
	});

	it('a lot outside the readings has no verdict', () => {
		const unlisted = buildTenderPage(capturedRecord('609955-2026'), NOW);
		expect(unlisted.lots.length).toBeGreaterThan(0);
		for (const lot of unlisted.lots) {
			expect(lotVerdict(lot, DEMO_PROFILE, unlisted.now)).toBeNull();
		}
		const record = capturedRecord('610242-2026');
		const notRead = buildTenderPage(record, NOW, notReadOnly('610242-2026', 'LOT-0000'));
		expect(notRead.lots[0].reading?.status).toBe('not-read');
		expect(lotVerdict(notRead.lots[0], DEMO_PROFILE, notRead.now)).toBeNull();
		expect(lotVerdict(notRead.lots[0], null, notRead.now)).toBeNull();
	});

	it('a listed lot not read on a notice the buyer means to cancel still asks first', () => {
		const record = { ...capturedRecord('610242-2026'), cancelIntent: true as const };
		const page = buildTenderPage(record, NOW, notReadOnly('610242-2026', 'LOT-0000'));
		expect(lotVerdict(page.lots[0], DEMO_PROFILE, page.now)?.decision).toEqual({
			verdict: 'ASK FIRST',
			reason: 'cancel-intent'
		});
	});
});
