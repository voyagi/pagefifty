import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CaptureLineSchema, NoticeRecordSchema } from '$lib/snapshot/index-row';
import { NoticeSearchSchema, SearchesFileSchema } from '$lib/snapshot/searches';
import { buildTenderPage } from '$lib/tenders/tender-page';

// A capture as the records build wrote it: globalSetup ran scripts/build-records.mjs. Shared by the
// buyer-search tests and the README's figures, so both count the panels the same way.
const builtOf = (capture: string) => join('src', 'lib', 'snapshot', 'generated', capture);
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

export function builtSearch(capture: string, notice: string) {
	return NoticeSearchSchema.parse(readJson(join(builtOf(capture), 'searches', `${notice}.json`)));
}

// The buyer-search panel a notice's page shows, built at the capture's own instant.
export function shownSearch(capture: string, notice: string) {
	const built = builtOf(capture);
	const now = new Date(CaptureLineSchema.parse(readJson(join(built, 'capture.json'))).fetchedAt);
	return buildTenderPage(
		NoticeRecordSchema.parse(readJson(join(built, 'records', `${notice}.json`))),
		now,
		undefined,
		builtSearch(capture, notice)
	).search;
}

// Over every notice the capture searched: the results its searches returned, the pages the panels
// list, and the panels that show the empty line instead.
export function buyerSearchCounts(capture: string) {
	const file = SearchesFileSchema.parse(readJson(join('examples', capture, 'searches.json')));
	const counts = { searched: 0, returned: 0, listed: 0, none: 0 };
	for (const search of file.notices) {
		if (search.status !== 'searched') continue;
		counts.searched += 1;
		counts.returned += search.results.length;
		const view = shownSearch(capture, search.notice);
		if (view === undefined) throw new Error(`${search.notice} was searched but shows no panel`);
		if ('none' in view) counts.none += 1;
		else counts.listed += view.results.length;
	}
	return counts;
}
