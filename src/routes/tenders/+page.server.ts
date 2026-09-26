import { DEFAULT_CAPTURE, loadIndex } from '$lib/server/records';
import { captureDay } from '$lib/snapshot/index-row';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { capture, rows } = await loadIndex(DEFAULT_CAPTURE);
	return { capturedOn: captureDay(capture.fetchedAt), total: capture.total, rows };
};
