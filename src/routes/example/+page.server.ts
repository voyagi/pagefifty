import { loadExamplePage } from '$lib/server/tenders';
import type { PageServerLoad } from './$types';

// The bare example list opens the tender its layout chose, judged at the capture instant as every
// example page is.
export const load: PageServerLoad = async ({ parent }) => {
	const { defaultNotice } = await parent();
	return {
		record: defaultNotice === null ? null : await loadExamplePage({ notice: defaultNotice })
	};
};
