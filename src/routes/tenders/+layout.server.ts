import { LATEST_CAPTURE } from '$lib/server/records';
import { defaultNotice, loadTenderList } from '$lib/server/tenders';
import type { LayoutServerLoad } from './$types';

// The list beside every tender. It reads only the address's filters, so opening another tender
// from it does not load the list again. The real clock, read once per request: every row is judged
// open or closed against this one instant (D-06), which the bare list's tender is judged at too.
export const load: LayoutServerLoad = async ({ url }) => {
	const now = new Date();
	const data = await loadTenderList({ capture: LATEST_CAPTURE, url, now });
	return { ...data, defaultNotice: defaultNotice(LATEST_CAPTURE, data.list.open), now };
};
