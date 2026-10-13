import { LATEST_CAPTURE, loadIndex } from '$lib/server/records';
import { captureFacts } from '$lib/tenders/list';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { capture } = await loadIndex(LATEST_CAPTURE);
	const { capturedOn, firstPublished } = captureFacts(capture);
	return { total: capture.total, capturedOn, ...(firstPublished && { firstPublished }) };
};
