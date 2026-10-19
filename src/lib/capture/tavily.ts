// The capture's one client of Tavily: one basic search per notice for the buyer's earlier awards,
// the answer's validation and the results the capture keeps. It never calls fetch: the transport is
// injected and every request goes out through the metered gate, which hands it the key. The body
// holds the buyer's name and fixed words only, never anything of a firm. Imported under Node type
// stripping: erasable syntax only, relative .ts imports.
import { z } from 'zod';
import type { NoticeRecord } from '../ingest/record.ts';
import type { WebResult } from '../snapshot/searches.ts';
import type { Transport } from '../snapshot/transport.ts';
import type { MeteredGate } from './metered.ts';

export const SEARCH_URL = 'https://api.tavily.com/search';

// The German words are the ones the recorded search of 15 October 2026 sent, so its answer is a
// fixture of exactly this request; the other languages' words are unmeasured until the final capture.
export const AWARD_WORDS = Object.freeze({
	de: 'Vergabe Zuschlag IT Dienstleistungen',
	nl: 'aanbesteding gunning IT diensten',
	fr: 'marché public attribution services informatiques',
	en: 'public tender award IT services'
});

type AwardLanguage = keyof typeof AWARD_WORDS;

type SearchedRecord = Pick<NoticeRecord, 'buyers' | 'title'>;

// A Belgian buyer publishes in Dutch or French, and the notice title says which.
function awardLanguage({ buyers, title }: SearchedRecord): AwardLanguage {
	const country = buyers[0]?.country;
	if (country === 'DEU') return 'de';
	if (country === 'NLD') return 'nl';
	if (country === 'BEL' && (title.lang === 'nl' || title.lang === 'fr')) return title.lang;
	return 'en';
}

export function searchQuery(record: SearchedRecord): string {
	return `${record.buyers[0].name.text} ${AWARD_WORDS[awardLanguage(record)]}`;
}

export function searchBody(record: SearchedRecord) {
	return {
		query: searchQuery(record),
		search_depth: 'basic',
		max_results: 5,
		include_answer: false,
		include_raw_content: false,
		include_usage: true
	} as const;
}

type SearchBody = ReturnType<typeof searchBody>;

// Not strict: Tavily adds fields of its own (each result's content snippet among them), and only
// these are used.
export const SearchResponseSchema = z.object({
	request_id: z.string().optional(),
	results: z.array(z.object({ url: z.string(), title: z.string(), score: z.number() })),
	usage: z.object({ credits: z.number().nonnegative() }).optional()
});

export function readResults(results: readonly WebResult[]): WebResult[] {
	return results.map(({ title, url, score }) => ({ title, url, score }));
}

export interface SearchAnswer {
	results: WebResult[];
	credits: number | null;
}

function parsedJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

// A refusal names only the status or the schema, never the body: a provider's error text can quote
// the request it was sent.
export function sendSearch(gate: MeteredGate, transport: Transport, body: SearchBody) {
	return gate.attempt<SearchAnswer>('tavily', 'search', async (key) => {
		const response = await transport(
			new Request(SEARCH_URL, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${key}`,
					'content-type': 'application/json',
					accept: 'application/json'
				},
				body: JSON.stringify(body)
			})
		);
		if (!response.ok) throw new Error(`Tavily answered ${response.status}`);
		const json = parsedJson(await response.text());
		const parsed = SearchResponseSchema.safeParse(json);
		if (!parsed.success) throw new Error('the Tavily answer is not a search result');
		const { request_id: id = '', results, usage } = parsed.data;
		return {
			id,
			usage: (json as { usage?: unknown }).usage ?? null,
			value: { results, credits: usage?.credits ?? null }
		};
	});
}
