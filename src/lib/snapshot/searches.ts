// The capture's buyer search as it publishes it (searches.json): one entry per notice with criteria
// in the notice, either the web results Tavily returned for the buyer or why the notice was not
// searched. The capture command writes it, the records build splits it per notice, and the site
// reads it; none of them describes an entry a second way. Imported by the capture command under Node
// type stripping: erasable syntax only.
import { z } from 'zod';
import { linkTarget } from '../ingest/link-target.ts';
import { SearchRunSchema } from './search-run.ts';

export const NOT_SEARCHED_REASONS = ['dry-run', 'cap-reached', 'send-failed'] as const;

export const MAX_RESULTS = 5;

// The address is checked again here, where the build and the page read it, so a file edited by hand
// cannot put a script address into a link.
const WebResultSchema = z.strictObject({
	title: z.string(),
	url: z.string().refine((url) => linkTarget(url) !== undefined, {
		error: 'a result url must be an absolute http or https address'
	}),
	score: z.number()
});

export const NoticeSearchSchema = z.discriminatedUnion('status', [
	z.strictObject({
		notice: z.string(),
		status: z.literal('searched'),
		query: z.string(),
		results: z.array(WebResultSchema).max(MAX_RESULTS)
	}),
	z.strictObject({
		notice: z.string(),
		status: z.literal('not-searched'),
		reason: z.enum(NOT_SEARCHED_REASONS)
	})
]);

const sentOf = (notice: NoticeSearch) =>
	notice.status === 'searched' || notice.reason === 'send-failed';

// The trust pages name Tavily from the run's count alone, and the tender pages show each searched
// notice's results, so a count out of step with the notices would hide a provider whose results are
// on the site. The gate counts a search the moment it is sent, so every sent search ends as searched
// or send-failed.
export const SearchesFileSchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		run: SearchRunSchema,
		notices: z.array(NoticeSearchSchema)
	})
	.refine(({ run, notices }) => run.searches === notices.filter(sentOf).length, {
		error: 'the run counts a different number of searches sent than its notices searched or failed',
		path: ['run', 'searches']
	})
	.refine(
		({ run, notices }) =>
			run.notSearched === notices.filter((notice) => notice.status === 'not-searched').length,
		{
			error: 'the run counts a different number of notices not searched than it lists',
			path: ['run', 'notSearched']
		}
	);

export type WebResult = z.infer<typeof WebResultSchema>;
export type NoticeSearch = z.infer<typeof NoticeSearchSchema>;
export type SearchesFile = z.infer<typeof SearchesFileSchema>;
