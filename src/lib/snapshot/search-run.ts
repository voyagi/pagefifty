// The run block of a capture's buyer search, as the capture command writes it into searches.json
// and the records build copies it to generated/{capture}/search-run.json. The trust pages read it
// to name the search provider only for a capture that searched. Imported by the capture command
// under Node type stripping: erasable syntax only.
import { z } from 'zod';

const count = z.int().nonnegative();

export const SearchRunSchema = z.strictObject({
	searches: count,
	notSearched: count,
	credits: z.number().nonnegative().nullable()
});

export type SearchRun = z.infer<typeof SearchRunSchema>;
