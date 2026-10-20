import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_PROFILE } from '../profile/demo-firm';
import { NoticeRecordSchema, SnapshotIndexSchema } from '../snapshot/index-row';
import { NoticeReadingsSchema } from '../snapshot/readings';
import { figureOf, mostLenient, type FigureNotice } from './figure';
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
