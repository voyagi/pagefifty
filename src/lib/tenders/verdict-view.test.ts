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
import {
	ARTICLE_63_LINE,
	DECIDED_LINES,
	REASON_LINES,
	STATE_LABELS,
	comparedLine,
	lotVerdict
} from './verdict-view';

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

	it('words the Article 63 line only for a lot a partner could help', () => {
		const record = capturedRecord('610242-2026');
		const page = buildTenderPage(record, NOW, exampleReadings('610242-2026'));
		const view = lotVerdict(page.lots[0], DEMO_PROFILE, page.now);
		expect(view?.article63).toBeNull();
		expect(view?.shortfalls).toEqual([]);
		expect(view?.link).toBeNull();
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

// P5: what a verdict says is what was read, never what the firm should do or will get, and a
// partner is never enough on its own.
const BANNED = [
	'a partner is enough',
	'partner is sufficient',
	'partner suffices',
	'you should',
	'we recommend',
	'you will qualify',
	'you will be invited',
	'guarantee',
	'apply now'
];

describe('the verdict copy', () => {
	it('the verdict copy is never advice, a promise or legal advice', () => {
		const copy = [
			...Object.values(REASON_LINES),
			...Object.values(STATE_LABELS),
			...Object.values(DECIDED_LINES),
			ARTICLE_63_LINE,
			...(['own', 'none', 'newer'] as const).map((kind) => comparedLine({ kind })),
			comparedLine({ kind: 'demo', name: 'Brink Data B.V.' })
		];
		expect(copy.length).toBeGreaterThan(30);
		for (const sentence of copy) {
			expect(sentence.trim()).not.toBe('');
			for (const phrase of BANNED) expect(sentence.toLowerCase()).not.toContain(phrase);
		}
		for (const part of ['Article 63', '2014/24/EU', 'necessary', 'not sufficient']) {
			expect(ARTICLE_63_LINE).toContain(part);
		}
	});

	it('ends the compared-firm line once, whether or not the firm name ends in a period', () => {
		expect(comparedLine({ kind: 'demo', name: 'Brink Data B.V.' })).toBe(
			'Compared with the demo firm, Brink Data B.V.'
		);
		expect(comparedLine({ kind: 'demo', name: 'Brink Data' })).toBe(
			'Compared with the demo firm, Brink Data.'
		);
	});

	it('names no verdict in a criterion state word', () => {
		for (const word of Object.values(STATE_LABELS)) {
			expect(word).not.toMatch(/^(Go|No-go|Ask first|Not met alone|Partner needed)$/i);
		}
	});
});
