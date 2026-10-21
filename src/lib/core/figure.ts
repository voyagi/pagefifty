// The home page's finding over one capture: each served notice counted once, under one verdict.
// Every lot is decided by the tender page's own path (lotStatusOf, then decideLotStatus on the
// context lotContextOf builds), so the figure cannot disagree with the pages it summarises.
// Loaded by scripts/figure.mjs under Node type stripping: erasable syntax only, imports with .ts.
import type { NoticeRecord } from '../ingest/record.ts';
import { decideLotStatus, type FirmFacts } from './compare.ts';
import { lotContextOf } from './lot-context.ts';
import { lotStatusOf, type NoticeReadingsLike } from './lot-reading.ts';
import type { LotVerdict } from './verdict.ts';

export interface Figure {
	population: number;
	go: number;
	partnerNeeded: number;
	noGo: number;
	askFirst: number;
}

export interface FigureNotice {
	record: NoticeRecord;
	readings?: NoticeReadingsLike;
}

// REQUIREMENTS.md "Lot verdict": a notice card shows its most lenient lot, so the figure counts each
// notice as its card would. A lot with no decision could not be read, which is ask first: never a
// go the readings do not support, and never a no-go they do not support either.
const LENIENCY: readonly LotVerdict[] = ['GO', 'ASK FIRST', 'PARTNER NEEDED', 'NO-GO'];

export function mostLenient(decisions: readonly (LotVerdict | null)[]): LotVerdict {
	if (decisions.length === 0) return 'ASK FIRST';
	return LENIENCY[
		Math.min(...decisions.map((verdict) => LENIENCY.indexOf(verdict ?? 'ASK FIRST')))
	];
}

const COUNTED: Readonly<Record<LotVerdict, keyof Omit<Figure, 'population'>>> = {
	GO: 'go',
	'PARTNER NEEDED': 'partnerNeeded',
	'NO-GO': 'noGo',
	'ASK FIRST': 'askFirst'
};

function noticeVerdict({ record, readings }: FigureNotice, firm: FirmFacts | null, now: string) {
	return mostLenient(
		record.lots.map(
			(lot) =>
				decideLotStatus(lotStatusOf(lot, readings), firm, { ...lotContextOf(record, lot), now })
					?.decision.verdict ?? null
		)
	);
}

// now is the capture instant: a lot closed by then still counts, since the population is every
// notice the capture serves.
export function figureOf(
	notices: readonly FigureNotice[],
	firm: FirmFacts | null,
	now: string
): Figure {
	const figure: Figure = {
		population: notices.length,
		go: 0,
		partnerNeeded: 0,
		noGo: 0,
		askFirst: 0
	};
	for (const notice of notices) figure[COUNTED[noticeVerdict(notice, firm, now)]] += 1;
	return figure;
}
