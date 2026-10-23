import { EXAMPLE_CAPTURE } from '$lib/server/records';
import { exampleNotice, loadExampleList } from '$lib/server/tenders';
import type { LayoutServerLoad } from './$types';

// The same list as /tenders, replayed from the tracked capture at the instant it was taken, so it
// opens the same tender beside it however long after the capture it is opened.
export const load: LayoutServerLoad = async ({ url }) => {
	const data = await loadExampleList({ url });
	return { ...data, defaultNotice: exampleNotice(EXAMPLE_CAPTURE, data.list.open) };
};
