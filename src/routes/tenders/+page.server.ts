import { LATEST_CAPTURE } from '$lib/server/records';
import { loadTenderPage } from '$lib/server/tender-page';
import type { PageServerLoad } from './$types';

// The bare list opens the tender its layout chose beside it, or none when nothing is open. The
// tender is judged at the instant the layout judged the list (D-06), so a deadline passing between
// two clock reads never shows it open in the list and closed beside it.
export const load: PageServerLoad = async ({ parent }) => {
	const { defaultNotice, now } = await parent();
	return {
		record:
			defaultNotice === null
				? null
				: await loadTenderPage({ capture: LATEST_CAPTURE, notice: defaultNotice, now })
	};
};
