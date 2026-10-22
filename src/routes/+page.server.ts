import { figureFile, LATEST_CAPTURE, loadIndex } from '$lib/server/records';
import { captureFacts } from '$lib/tenders/list';
import type { PageServerLoad } from './$types';

// The figure is read from the committed file of the latest capture, never computed here: no server
// module decides a verdict or reaches the profile. A latest capture the model never read has none.
export const load: PageServerLoad = async () => {
	const { capture, rows } = await loadIndex(LATEST_CAPTURE);
	const { capturedOn, firstPublished } = captureFacts(capture);
	// TED's count also holds the notices the capture left out (closing before the cutoff, failed or
	// outdated), while the figure and /tenders count the rows served, so both counts are passed.
	return {
		served: rows.length,
		total: capture.total,
		capturedOn,
		...(firstPublished && { firstPublished }),
		figure: figureFile(LATEST_CAPTURE)
	};
};
