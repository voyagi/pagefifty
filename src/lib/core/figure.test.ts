import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import type { Criterion, NoticeRecord } from '../ingest/record';
import { DEMO_PROFILE } from '../profile/demo-firm';
import { NoticeRecordSchema, SnapshotIndexSchema } from '../snapshot/index-row';
import { NoticeReadingsSchema, type ReplyItem } from '../snapshot/readings';
import { figureOf, mostLenient, type FigureNotice } from './figure';
import type { NoticeReadingsLike } from './lot-reading';
import { LOT_VERDICTS, type LotVerdict } from './verdict';

// The example capture as the records build wrote it: globalSetup ran scripts/build-records.mjs.
const BUILT = join('src', 'lib', 'snapshot', 'generated', '2026-09-15');
const READ_NOTICES = ['610242-2026', '634398-2026'];

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function builtExample(): { notices: FigureNotice[]; now: string } {
	const index = SnapshotIndexSchema.parse(readJson(join(BUILT, 'index.json')));
	const notices = index.rows.map(({ noticeNumber }) => {
		const record = NoticeRecordSchema.parse(
			readJson(join(BUILT, 'records', `${noticeNumber}.json`))
		);
		const path = join(BUILT, 'readings', `${noticeNumber}.json`);
		return existsSync(path)
			? { record, readings: NoticeReadingsSchema.parse(readJson(path)) }
			: { record };
	});
	return { notices, now: new Date(index.capture.fetchedAt).toISOString() };
}

const sum = ({ go, partnerNeeded, noGo, askFirst }: ReturnType<typeof figureOf>) =>
	go + partnerNeeded + noGo + askFirst;

describe('figureOf', () => {
	it('the figure of the example readings counts each notice under its most lenient lot', () => {
		const { notices, now } = builtExample();
		const figure = figureOf(notices, DEMO_PROFILE, now);
		expect(figure).toEqual({ population: 362, go: 0, partnerNeeded: 0, noGo: 0, askFirst: 362 });
		expect(sum(figure)).toBe(figure.population);
		const read = notices.filter((notice) => notice.readings !== undefined);
		expect(read.map(({ record }) => record.noticeNumber)).toEqual(READ_NOTICES);
		for (const notice of read) {
			expect(figureOf([notice], DEMO_PROFILE, now)).toEqual({
				population: 1,
				go: 0,
				partnerNeeded: 0,
				noGo: 0,
				askFirst: 1
			});
		}
	});
});

// Synthetic notices on the German example's record: each lot is unlisted, listed but not read,
// listed with no criteria, or read with a turnover floor the demo firm meets (500.000) or misses on
// its own (2.000.000), so the lots decide nothing, ask first, go and not met alone.
const LOT_KINDS = ['unlisted', 'not-read', 'no-criteria', 'read-met', 'read-short'] as const;
type LotKind = (typeof LOT_KINDS)[number];

const turnoverText = (floor: string) =>
	`Mindestjahresumsatz von mindestens ${floor} Euro netto pro Jahr in den letzten drei Geschäftsjahren.`;

function turnoverItem(floor: string): ReplyItem {
	return {
		criterion: 1,
		kind: 'turnover-general',
		quote: `mindestens ${floor} Euro netto pro Jahr in den letzten drei Geschäftsjahren`,
		reading: 'A plain reading of the clause.',
		numberText: `${floor} Euro`,
		period: 'pro Jahr',
		mandatory: true
	};
}

const FLOORS: Partial<Record<LotKind, string>> = {
	'read-met': '500.000',
	'read-short': '2.000.000'
};

function syntheticNotice(kinds: readonly LotKind[], cancelIntent: boolean): FigureNotice {
	const base = NoticeRecordSchema.parse(readJson(join(BUILT, 'records', '610242-2026.json')));
	const [lot] = base.lots;
	const hash = (index: number) => String(index + 1).repeat(64);
	const criteriaOf = (kind: LotKind): Criterion[] => {
		const floor = FLOORS[kind];
		if (floor === undefined) return kind === 'no-criteria' ? [] : lot.criteria;
		const text = turnoverText(floor);
		return [
			{
				code: 'slc-stand-to-gen',
				descriptions: [{ lang: 'de', text }],
				parameters: [],
				pointsToDocuments: false
			}
		];
	};
	const record: NoticeRecord = {
		...base,
		...(cancelIntent && { cancelIntent: true as const }),
		lots: kinds.map((kind, index) => ({
			...lot,
			id: `LOT-000${index}`,
			criteria: criteriaOf(kind),
			criteriaSources: ['epo-notice']
		}))
	};
	const readings: NoticeReadingsLike = {
		lots: kinds.flatMap((kind, index) => {
			const id = `LOT-000${index}`;
			if (kind === 'unlisted') return [];
			if (kind === 'not-read') return [{ lot: id, status: 'not-read' as const, reason: 'dry-run' }];
			if (kind === 'no-criteria') return [{ lot: id, status: 'no-criteria' as const }];
			return [{ lot: id, status: 'read' as const, textSha256: hash(index) }];
		}),
		readings: kinds.flatMap((kind, index) => {
			const floor = FLOORS[kind];
			return floor === undefined ? [] : [{ textSha256: hash(index), items: [turnoverItem(floor)] }];
		})
	};
	return { record, readings };
}

const CAPTURE_INSTANT = '2026-09-15T19:50:49.157Z';

describe('figureOf over synthetic notices', () => {
	it('decides a read lot by the tender page path: a met floor goes, a missed one is not met alone', () => {
		expect(figureOf([syntheticNotice(['read-met'], false)], DEMO_PROFILE, CAPTURE_INSTANT).go).toBe(
			1
		);
		expect(
			figureOf([syntheticNotice(['read-short'], false)], DEMO_PROFILE, CAPTURE_INSTANT)
				.partnerNeeded
		).toBe(1);
		expect(
			figureOf([syntheticNotice(['read-met'], true)], DEMO_PROFILE, CAPTURE_INSTANT).askFirst
		).toBe(1);
		expect(
			figureOf([syntheticNotice(['unlisted', 'read-short'], false)], DEMO_PROFILE, CAPTURE_INSTANT)
				.askFirst
		).toBe(1);
	});

	test.prop([
		fc.array(
			fc.record({
				kinds: fc.array(fc.constantFrom(...LOT_KINDS), { minLength: 0, maxLength: 6 }),
				cancelIntent: fc.boolean()
			}),
			{ maxLength: 8 }
		)
	])('the four counts always sum to the population', (notices) => {
		const figure = figureOf(
			notices.map(({ kinds, cancelIntent }) => syntheticNotice(kinds, cancelIntent)),
			DEMO_PROFILE,
			CAPTURE_INSTANT
		);
		expect(figure.population).toBe(notices.length);
		expect(sum(figure)).toBe(figure.population);
	});
});

// The example decides every notice ask first, so it cannot tell one ranking from another. Each pair
// of the four verdicts is ranked in both orders here.
const LENIENCY: readonly LotVerdict[] = ['GO', 'ASK FIRST', 'PARTNER NEEDED', 'NO-GO'];
const PAIRS = LOT_VERDICTS.flatMap((first) =>
	LOT_VERDICTS.filter((second) => second !== first).map((second) => [first, second] as const)
);

describe('mostLenient', () => {
	it.each(PAIRS)('ranks %s beside %s by leniency, in either order', (first, second) => {
		const expected = LENIENCY.indexOf(first) < LENIENCY.indexOf(second) ? first : second;
		expect(mostLenient([first, second])).toBe(expected);
	});

	it('counts a lot with no decision as ask first, never as go', () => {
		expect(mostLenient([null])).toBe('ASK FIRST');
		expect(mostLenient([])).toBe('ASK FIRST');
		expect(mostLenient([null, 'GO'])).toBe('GO');
		expect(mostLenient(['NO-GO', null])).toBe('ASK FIRST');
		expect(mostLenient([null, 'PARTNER NEEDED'])).toBe('ASK FIRST');
		expect(mostLenient(['ASK FIRST', null])).toBe('ASK FIRST');
	});

	it('counts a notice with a go lot and a no-go lot as go', () => {
		expect(mostLenient(['NO-GO', 'GO'])).toBe('GO');
		expect(mostLenient(['GO', 'NO-GO', 'PARTNER NEEDED'])).toBe('GO');
	});
});
