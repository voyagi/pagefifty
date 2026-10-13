import { LATEST_CAPTURE } from '$lib/server/records';
import { loadTenderList } from '$lib/server/tenders';
import type { PageServerLoad } from './$types';

// The real clock, read once per request: every card on the page is judged open or closed against
// this one instant (D-06).
export const load: PageServerLoad = ({ url }) =>
	loadTenderList({ capture: LATEST_CAPTURE, url, now: new Date() });
