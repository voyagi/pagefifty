// The list loader /tenders and /example share. The caller passes "now": the real clock for
// /tenders, the capture instant for /example (D-06).
import { parseFilters } from '../core/filters';
import { buildTenderList, captureFacts, type TenderListData } from '../tenders/list';
import { loadIndex } from './records';

export async function loadTenderList({
	capture,
	url,
	now
}: {
	capture: string;
	url: URL;
	now: Date;
}): Promise<TenderListData> {
	const index = await loadIndex(capture);
	const { state, dropped } = parseFilters(url.searchParams);
	return {
		list: buildTenderList(index, state, now),
		filters: state,
		dropped,
		capture: captureFacts(index.capture)
	};
}
