import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { newestReadingRun, searchRunOf } from '$lib/server/records';
import type { ReadingRun } from '$lib/snapshot/readings';
import { load } from './+page.server';
import AiPage, { AI_LIMITS } from './+page.svelte';

// providersOf stays real, so the rule for when a provider is named is the one these pages run; only
// the two records it is given are chosen here. The model ID and region are set apart from the
// example's, so a page that names the example run's values from anywhere but the load is caught.
vi.mock('$lib/server/records', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/records')>()),
	newestReadingRun: vi.fn(),
	searchRunOf: vi.fn()
}));

const RUN: ReadingRun = {
	model: 'example-org/model-under-test-7b',
	provider: 'Nebius Token Factory',
	region: 'eu-test-9',
	thinking: false,
	runDate: '2026-11-02',
	prices: { inputUsdPerMillion: '0.30', outputUsdPerMillion: '0.90', listedOn: '2026-10-15' },
	lots: { withCriteria: 3, read: 2, reused: 0, notRead: 1 },
	sends: 2,
	tokens: { input: 1000, output: 900, reasoning: 0 },
	costUsd: '0.001110',
	quotes: { verified: 7, rejected: 1 }
};

type LoadEvent = Parameters<typeof load>[0];
type Loaded = Exclude<Awaited<ReturnType<typeof load>>, void>;

async function loaded(search: { searches: number } | null): Promise<Loaded> {
	vi.mocked(newestReadingRun).mockReturnValue({ id: '2026-11-02', run: RUN });
	vi.mocked(searchRunOf).mockReturnValue(
		search === null ? null : { searches: search.searches, notSearched: 0, credits: null }
	);
	return (await load({} as LoadEvent)) as Loaded;
}

const pageOf = (data: Loaded) => render(AiPage, { props: { data: data as never } }).body;

// Every element marked with data-fact, by name, with its text as rendered.
function facts(body: string): Record<string, string[]> {
	const found: Record<string, string[]> = {};
	for (const [, name, text] of body.matchAll(/data-fact="([a-z-]+)"[^>]*>([^<]*)</g)) {
		(found[name] ??= []).push(text);
	}
	return found;
}

const text = (body: string) =>
	body
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

describe('/ai load', () => {
	it('the AI page names the model and region of the newest reading run', async () => {
		const data = await loaded(null);
		expect(data).toEqual({ capture: '2026-11-02', run: RUN, providers: ['Nebius Token Factory'] });
		const body = pageOf(data);
		expect(facts(body).model).toEqual([RUN.model]);
		expect(facts(body).region).toEqual([RUN.region]);
		expect(facts(body).provider).toEqual([RUN.provider]);
		expect(text(body)).toContain('Zero Data Retention');
		expect(body).toContain('data-run-record');
		expect(body).toContain('href="/example"');
	});

	it('the AI page names Tavily only when the newest run searched', async () => {
		for (const search of [null, { searches: 0 }]) {
			const data = await loaded(search);
			expect(data.providers).toEqual(['Nebius Token Factory']);
			expect(pageOf(data)).not.toContain('Tavily');
		}
		const data = await loaded({ searches: 1 });
		expect(data.providers).toEqual(['Nebius Token Factory', 'Tavily']);
		const body = pageOf(data);
		expect(facts(body)['search-provider']).toEqual(['Tavily']);
		expect(body).toContain('href="https://tavily.com/privacy"');
	});

	it('says no model read is recorded when no capture holds one', async () => {
		vi.mocked(newestReadingRun).mockReturnValue(null);
		const data = (await load({} as LoadEvent)) as Loaded;
		expect(data).toEqual({ capture: null, run: null, providers: [] });
		const body = pageOf(data);
		expect(text(body)).toContain('No model read is recorded yet.');
		expect(facts(body).model).toBeUndefined();
	});
});

describe('/ai copy', () => {
	it('the AI page says what the product does not cover in two sentences', async () => {
		expect(AI_LIMITS).toEqual([
			"A Go covers only the selection criteria read in the notice, never the exclusion grounds, the procurement documents or the buyer's shortlisting.",
			'Where a buyer names a category of references, staff or business lines, only the firm can judge whether its own match, so that criterion reads Ask first.'
		]);
		const body = text(pageOf(await loaded(null)));
		for (const sentence of AI_LIMITS) expect(body).toContain(sentence);
	});

	// A capture run can leave lots unread (its cap, a lot outside the run: the 2026-09-15 run read 2
	// lots of a capture of 362 notices), so the page claims no reading for every lot.
	it('the AI page says only the lots a run sends are read', async () => {
		const body = text(pageOf(await loaded(null)));
		expect(body).not.toContain('each tender lot');
		expect(body).toContain('the tender lots the capture run sends it');
		expect(body).toContain(
			'The criteria of a lot without a reading are shown as published and not compared with your firm.'
		);
	});

	// Each provider fact is its own block, and the block holds the link to the page it was read on.
	it('links each provider fact to the page it was read on', async () => {
		const guide = 'href="https://docs.tokenfactory.nebius.com/legal/legal-quick-guide"';
		const blocks = pageOf(await loaded({ searches: 1 })).split('class="fact');
		const blockOf = (phrase: string) => blocks.filter((block) => text(block).includes(phrase));
		for (const [phrase, href] of [
			['not tied to any single data center', guide],
			['not stored on its systems after each request is processed', guide],
			[
				'may share query data with third-party search index providers',
				'href="https://tavily.com/privacy"'
			],
			[
				'query data is not stored or used for improvements',
				'href="https://help.tavily.com/articles/4205958832-understanding-the-allow-use-of-query-data-setting"'
			],
			[
				'the buyer search recorded on 15 October 2026 was made while the setting was still on',
				'href="https://help.tavily.com/articles/4205958832-understanding-the-allow-use-of-query-data-setting"'
			]
		]) {
			expect(blockOf(phrase), phrase).toHaveLength(1);
			expect(blockOf(phrase)[0], phrase).toContain(href);
		}
	});
});
