import { EXAMPLE_CAPTURE, providersOf, readingRunOf, searchRunOf } from '$lib/server/records';
import type { PageServerLoad } from './$types';

// The run named here is the one that read the example capture, which /example and /tenders serve,
// so the page never links a run as the example run while the tender pages show another capture's
// readings. The model ID, provider and region come from that run record alone, so the page cannot
// name a model the snapshot was not read with.
export const load: PageServerLoad = () => {
	const run = readingRunOf(EXAMPLE_CAPTURE);
	if (run === null) return { capture: null, run: null, providers: [] as string[] };
	return {
		capture: EXAMPLE_CAPTURE,
		run,
		providers: providersOf(run, searchRunOf(EXAMPLE_CAPTURE))
	};
};
