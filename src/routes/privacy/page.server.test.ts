import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { newestReadingRun, searchRunOf } from '$lib/server/records';
import type { ReadingRun } from '$lib/snapshot/readings';
import { load } from './+page.server';
import PrivacyPage from './+page.svelte';

// As on the AI page: providersOf stays real, and only the two records it is given are chosen here.
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

const pageOf = (data: Loaded) => render(PrivacyPage, { props: { data: data as never } }).body;

const text = (body: string) =>
	body
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

describe('/privacy load', () => {
	it('the privacy page names Tavily only when the newest run searched', async () => {
		for (const search of [null, { searches: 0 }]) {
			const data = await loaded(search);
			expect(data.providers).toEqual(['Nebius Token Factory']);
			expect(pageOf(data)).not.toContain('Tavily');
		}
		const data = await loaded({ searches: 2 });
		expect(data.providers).toEqual(['Nebius Token Factory', 'Tavily']);
		const body = pageOf(data);
		expect(text(body)).toContain("the buyer's name and fixed search words are sent to Tavily");
		expect(body).toContain('href="https://tavily.com/privacy"');
	});

	it('names the region of the newest reading run, byte for byte', async () => {
		const body = pageOf(await loaded(null));
		expect(
			[...body.matchAll(/data-fact="region"[^>]*>([^<]*)</g)].map((match) => match[1])
		).toEqual([RUN.region]);
		expect(
			[...body.matchAll(/data-fact="provider"[^>]*>([^<]*)</g)].map((match) => match[1])
		).toEqual([RUN.provider]);
	});

	// Each provider fact is its own block, and the block holds the link to the page it was read on.
	it('the privacy page links each provider fact to its source', async () => {
		const blocks = pageOf(await loaded({ searches: 1 })).split('class="fact');
		const blockOf = (phrase: string) => blocks.filter((block) => text(block).includes(phrase));
		for (const [phrase, href] of [
			[
				'receives the technical data of each request',
				'href="https://www.cloudflare.com/privacypolicy/"'
			],
			[
				'serves its pages from its network',
				'href="https://developers.cloudflare.com/workers/static-assets/"'
			],
			[
				'not tied to any single data center',
				'href="https://docs.tokenfactory.nebius.com/legal/legal-quick-guide"'
			],
			[
				'not stored on its systems after each request is processed',
				'href="https://docs.tokenfactory.nebius.com/legal/legal-quick-guide"'
			],
			[
				'may share query data with third-party search index providers',
				'href="https://tavily.com/privacy"'
			]
		]) {
			expect(blockOf(phrase), phrase).toHaveLength(1);
			expect(blockOf(phrase)[0], phrase).toContain(href);
		}
	});
});
