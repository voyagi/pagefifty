// The facts of a lot its verdict is decided against, built once for the tender page, the browser
// checks in scripts/harness.mjs and the home figure, so the three cannot read a lot differently.
// Loaded by scripts under Node type stripping: erasable syntax only, relative imports with .ts.
import type { LotRecord, NoticeRecord } from '../ingest/record.ts';
import type { LotContext } from './compare.ts';
import { summarizeLot } from './coverage-facts.ts';
import { displayedDeadline } from './deadline.ts';

// The instant is left out: the caller judges every lot of a page or a run against one instant.
export function lotContextOf(
	record: Pick<NoticeRecord, 'legalBasis' | 'cancelIntent'>,
	lot: Pick<LotRecord, 'id' | 'deadlines' | 'criteria' | 'criteriaSources' | 'reserved'>
): Omit<LotContext, 'now'> {
	const deadline = displayedDeadline(lot);
	return {
		lot: lot.id,
		legalBasis: record.legalBasis,
		deadline: deadline.kind === 'in-notice' ? null : deadline.instant,
		coverage: summarizeLot(lot),
		cancelIntent: record.cancelIntent === true,
		// As published: a lot that declares no reservation code is unknown, never "none".
		reserved: lot.reserved
	};
}
