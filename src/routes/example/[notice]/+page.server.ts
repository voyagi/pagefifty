import { unknownNotice } from '$lib/server/tender-page';
import { loadExamplePage } from '$lib/server/tenders';
import { NOTICE_NUMBER } from '$lib/snapshot/index-row';
import type { PageServerLoad } from './$types';

// The same refusal as /tenders/[notice]: a malformed number answers 404 before anything is read.
export const load: PageServerLoad = ({ params }) => {
	if (!NOTICE_NUMBER.test(params.notice)) unknownNotice(params.notice);
	return loadExamplePage({ notice: params.notice });
};
