// The list loader /tenders and /example share, and the example's two loaders. The caller passes
// "now": the real clock for /tenders, the capture instant for /example (D-06).
import { parseFilters } from '../core/filters';
import { buildTenderList, captureFacts, type ListRow, type TenderListData } from '../tenders/list';
import type { TenderPageData } from '../tenders/tender-page';
import { EXAMPLE_CAPTURE, instantOf, loadIndex, readNoticesOf, type Now } from './records';
import { loadTenderPage } from './tender-page';

export async function loadTenderList({
	capture,
	url,
	now
}: {
	capture: string;
	url: URL;
	now: Now;
}): Promise<TenderListData> {
	const index = await loadIndex(capture);
	const { state, dropped } = parseFilters(url.searchParams);
	return {
		list: buildTenderList(index, state, instantOf(now, index)),
		filters: state,
		dropped,
		capture: captureFacts(index.capture)
	};
}

// The tender a list opens beside it before the visitor picks one: the first open notice the model
// read, so the record shows a verdict wherever the capture holds one, else the first open notice.
// A list with no open notice opens none.
export function defaultNotice(capture: string, open: readonly ListRow[]): string | null {
	const readNotices = readNoticesOf(capture);
	const read = open.find((row) => readNotices.has(row.noticeNumber));
	return (read ?? open[0])?.noticeNumber ?? null;
}

// The example replays the tracked capture through the same loaders as the live pages, judged at
// the instant it was taken, so it is never empty however long after the capture it is opened.
export function loadExampleList({ url }: { url: URL }): Promise<TenderListData> {
	return loadTenderList({ capture: EXAMPLE_CAPTURE, url, now: 'capture' });
}

export function loadExamplePage({ notice }: { notice: string }): Promise<TenderPageData> {
	return loadTenderPage({ capture: EXAMPLE_CAPTURE, notice, now: 'capture' });
}
