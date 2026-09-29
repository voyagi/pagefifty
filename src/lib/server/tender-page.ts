// The tender page loader /tenders/[notice] and /example/[notice] share. The caller passes "now":
// the real clock for /tenders, the capture instant for /example (D-06).
import { error } from '@sveltejs/kit';
import { captureFacts } from '../tenders/list';
import { buildTenderPage, type TenderPageData } from '../tenders/tender-page';
import { instantOf, loadIndex, loadRecord, type Now } from './records';

export function unknownNotice(notice: string): never {
	error(404, { message: 'Not Found', kind: 'unknown-notice', notice });
}

// The record is looked up first, so a notice the snapshot does not hold answers 404 before the
// index is read; the index is read only for the capture day the leaf foot names.
export async function loadTenderPage({
	capture,
	notice,
	now
}: {
	capture: string;
	notice: string;
	now: Now;
}): Promise<TenderPageData> {
	const record = await loadRecord(capture, notice);
	if (record === undefined) unknownNotice(notice);
	const index = await loadIndex(capture);
	return {
		tender: buildTenderPage(record, instantOf(now, index)),
		capture: captureFacts(index.capture)
	};
}
