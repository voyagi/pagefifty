import { loadExampleList } from '$lib/server/tenders';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadExampleList({ url });
