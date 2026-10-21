import { newestReadingRun, providersOf, searchRunOf } from '$lib/server/records';
import type { PageServerLoad } from './$types';

// The model ID, provider and region come from the run record alone, so the page cannot name a
// model the snapshot was not read with.
export const load: PageServerLoad = () => {
	const newest = newestReadingRun();
	if (newest === null) return { capture: null, run: null, providers: [] as string[] };
	return {
		capture: newest.id,
		run: newest.run,
		providers: providersOf(newest.run, searchRunOf(newest.id))
	};
};
