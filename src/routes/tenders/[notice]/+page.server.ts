import { LATEST_CAPTURE } from '$lib/server/records';
import { loadTenderPage, unknownNotice } from '$lib/server/tender-page';
import { NOTICE_NUMBER } from '$lib/snapshot/index-row';
import type { PageServerLoad } from './$types';

// A malformed number is refused before the loader runs, so nothing is read for it. The real clock
// is read once per request, and the deadline and time left are judged against it (D-06).
export const load: PageServerLoad = ({ params }) => {
	if (!NOTICE_NUMBER.test(params.notice)) unknownNotice(params.notice);
	return loadTenderPage({ capture: LATEST_CAPTURE, notice: params.notice, now: new Date() });
};
