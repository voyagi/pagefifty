import { LATEST_CAPTURE } from '$lib/server/records';
import { loadTenderPage } from '$lib/server/tender-page';
import type { PageServerLoad } from './$types';

// The bare list opens the tender its layout chose beside it, or none when nothing is open. The
// tender reads the real clock once, as /tenders/[notice] does (D-06).
export const load: PageServerLoad = async ({ parent }) => {
	const { defaultNotice } = await parent();
	return {
		record:
			defaultNotice === null
				? null
				: await loadTenderPage({ capture: LATEST_CAPTURE, notice: defaultNotice, now: new Date() })
	};
};
