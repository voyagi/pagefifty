import { EXAMPLE_CAPTURE, figureFile, LATEST_CAPTURE, loadIndex } from '$lib/server/records';
import { defaultNotice, loadExampleList, loadExamplePage } from '$lib/server/tenders';
import { captureFacts } from '$lib/tenders/list';
import type { PageServerLoad } from './$types';

// The record the example list opens when no filter is set, chosen by the same rule /example uses,
// so a new example capture changes the start page's card with it. A list with nothing open has none.
async function exampleRecord(origin: string) {
	const { list } = await loadExampleList({ url: new URL('/example', origin) });
	const notice = defaultNotice(EXAMPLE_CAPTURE, list.open);
	return notice === null ? null : loadExamplePage({ notice });
}

// The figure is read from the committed file of the latest capture, never computed here: no server
// module decides a verdict or reaches the profile, so the example card's verdict is decided on the
// page, as on every tender page. A latest capture the model never read has no figure.
export const load: PageServerLoad = async ({ url }) => {
	const [{ capture }, example] = await Promise.all([
		loadIndex(LATEST_CAPTURE),
		exampleRecord(url.origin)
	]);
	const { capturedOn, firstPublished } = captureFacts(capture);
	return {
		total: capture.total,
		capturedOn,
		...(firstPublished && { firstPublished }),
		figure: figureFile(LATEST_CAPTURE),
		example
	};
};
