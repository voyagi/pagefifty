import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_PROFILE } from '../profile/demo-firm';
import { readNotice } from '../ingest/read-notice';
import type { LotRecord, NoticeRecord } from '../ingest/record';
import { capturePath } from '../../test/fixtures/node';
import { replyRequirements } from '../../test/fixtures/replies';
import { summarizeLot } from './coverage-facts';
import { displayedDeadline } from './deadline';
import { readLot } from './lot-reading';
import { decideReadLot, type CriterionOutcome, type LotContext } from './compare';

const CAPTURE_NOW = '2026-09-15T12:00:00Z';

function trackedLot(notice: string, lotId: string): { record: NoticeRecord; lot: LotRecord } {
	const result = readNotice(new Uint8Array(readFileSync(capturePath(notice))), {
		noticeNumber: notice
	});
	if (!result.ok) throw new Error(`${notice} did not read: ${result.kind}, ${result.detail}`);
	const lot = result.record.lots.find((each) => each.id === lotId);
	if (!lot) throw new Error(`${notice} has no ${lotId}`);
	return { record: result.record, lot };
}

function contextOf(record: NoticeRecord, lot: LotRecord): LotContext {
	const shown = displayedDeadline(lot);
	return {
		legalBasis: record.legalBasis,
		deadline: shown.kind === 'in-notice' ? null : shown.instant,
		now: CAPTURE_NOW,
		coverage: summarizeLot(lot),
		cancelIntent: record.cancelIntent === true,
		reserved: lot.reserved
	};
}

const outline = (outcome: CriterionOutcome) => ({
	state: outcome.state,
	notCompared: outcome.notCompared,
	why: outcome.requirements.map((requirement) => requirement.why)
});

describe('the two lots spike 004 read, decided for the demo firm', () => {
	it('the German lot spike 004 read decides ASK FIRST profile-field-missing for the demo firm', () => {
		const { record, lot } = trackedLot('610242-2026', 'LOT-0000');
		expect(lot.criteria.map((criterion) => criterion.code)).toEqual([
			'slc-suit-reg-trade',
			'slc-suit-reg-prof',
			'slc-stand-to-spec',
			'slc-stand-ins',
			'slc-abil-staff-qual',
			'slc-abil-ref-services'
		]);
		const reading = readLot({
			criteria: lot.criteria,
			items: replyRequirements('de-610242-thinking-off')
		});
		const decided = decideReadLot(reading, DEMO_PROFILE, contextOf(record, lot));
		expect(decided.criteria.map(outline)).toEqual([
			{ state: 'INFO', notCompared: false, why: ['not-assessed'] },
			{ state: 'INFO', notCompared: false, why: ['not-assessed'] },
			{ state: undefined, notCompared: true, why: ['period-disagrees'] },
			{ state: undefined, notCompared: true, why: ['insurance'] },
			{ state: 'PROFILE_GAP', notCompared: false, why: ['firm-judges'] },
			{ state: 'PROFILE_GAP', notCompared: false, why: ['firm-judges'] }
		]);
		expect(decided.decision).toEqual({ verdict: 'ASK FIRST', reason: 'profile-field-missing' });
	});

	it('the Dutch lot spike 004 read decides ASK FIRST route-unsettled for the demo firm', () => {
		const { record, lot } = trackedLot('634398-2026', 'LOT-0001');
		expect(lot.criteria.map((criterion) => criterion.code)).toEqual([
			'slc-stand-to-gen',
			'slc-abil-ref-services',
			'slc-abil-staff-qual',
			'slc-sche-qu-cert-indep',
			'slc-stand-other'
		]);
		const reading = readLot({
			criteria: lot.criteria,
			items: replyRequirements('nl-634398-super')
		});
		const decided = decideReadLot(reading, DEMO_PROFILE, contextOf(record, lot));
		expect(decided.criteria.map(outline)).toEqual([
			{ state: undefined, notCompared: true, why: ['kind-disagrees'] },
			{ state: 'PROFILE_GAP', notCompared: false, why: ['firm-judges'] },
			{ state: 'PROFILE_GAP', notCompared: false, why: ['firm-judges'] },
			{ state: 'SHORT_ROUTE_UNSETTLED', notCompared: false, why: ['not-named'] },
			{ state: undefined, notCompared: true, why: ['family'] }
		]);
		expect(decided.decision).toEqual({ verdict: 'ASK FIRST', reason: 'route-unsettled' });
	});
});
