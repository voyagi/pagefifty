// What the example promises a judge: no lot it shows closes at or before the Devpost cutoff. The
// records tests check the example with this, and the capture-choice tests show it naming a lot
// planted at the cutoff, so the check that guards the real example is the one seen to fail.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { displayedDeadline } from '../lib/core/deadline.ts';
import { CAPTURE_ID, FINAL_CUTOFF } from '../lib/snapshot/capture-id.ts';
import { CaptureLineSchema, type IndexRow } from '../lib/snapshot/index-row.ts';
import { capturePath } from './fixtures/node.ts';

// Each built capture's line, keyed by its folder, as records.ts keys the lines it bundles.
export function builtCaptureLines(out: string) {
	return new Map(
		readdirSync(out)
			.filter((name) => CAPTURE_ID.test(name))
			.map((id) => [
				id,
				CaptureLineSchema.parse(JSON.parse(readFileSync(join(out, id, 'capture.json'), 'utf8')))
			])
	);
}

// Every lot whose displayed deadline is at or before the cutoff, or shows no instant, as
// "notice lot deadline".
export function lotsClosingByCutoff(rows: readonly IndexRow[]): string[] {
	const cutoff = Date.parse(FINAL_CUTOFF);
	return rows.flatMap((row) =>
		row.lots.flatMap((lot) => {
			const shown = displayedDeadline(lot);
			if (shown.kind === 'in-notice') return [`${row.noticeNumber} ${lot.id} shows no deadline`];
			return Date.parse(shown.instant) <= cutoff
				? [`${row.noticeNumber} ${lot.id} closes ${shown.instant}`]
				: [];
		})
	);
}

export function assertOpenPastCutoff(capture: string, rows: readonly IndexRow[]): void {
	const closing = lotsClosingByCutoff(rows);
	if (closing.length > 0) {
		throw new Error(
			`the example ${capture} shows lots closing at or before ${FINAL_CUTOFF}: ${closing.join(', ')}`
		);
	}
}

const TENDER_PERIOD =
	/<cac:TenderSubmissionDeadlinePeriod>[\s\S]*?<\/cac:TenderSubmissionDeadlinePeriod>/g;

// A tracked notice with each lot's tender deadline period, in lot order, replaced by the given day
// and time, or removed for null. The count must match, so a notice with another lot count, or a
// period this pattern misses, fails the fixture instead of keeping the tracked deadline.
export function noticeWithLotDeadlines(
	notice: string,
	periods: readonly (readonly [string, string] | null)[]
): string {
	const tracked = readFileSync(capturePath(notice), 'utf8');
	const found = tracked.match(TENDER_PERIOD)?.length ?? 0;
	if (found !== periods.length) {
		throw new Error(`${notice} has ${found} tender deadline periods, not ${periods.length}`);
	}
	let lot = 0;
	return tracked.replace(TENDER_PERIOD, () => {
		const period = periods[lot++];
		return period === null
			? ''
			: `<cac:TenderSubmissionDeadlinePeriod><cbc:EndDate>${period[0]}</cbc:EndDate><cbc:EndTime>${period[1]}</cbc:EndTime></cac:TenderSubmissionDeadlinePeriod>`;
	});
}
