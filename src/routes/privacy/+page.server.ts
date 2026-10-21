import { newestReadingRun, providersOf, searchRunOf } from '$lib/server/records';
import type { PageServerLoad } from './$types';

// The providers the page names are the ones the newest model-read capture used, so a capture
// that never searched leaves no search provider on the page.
export const load: PageServerLoad = () => {
	const newest = newestReadingRun();
	const search = newest === null ? null : searchRunOf(newest.id);
	return {
		capture: newest?.id ?? null,
		run: newest?.run ?? null,
		providers: providersOf(newest?.run ?? null, search)
	};
};
