import { render } from '@testing-library/svelte';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readResults, searchQuery } from '$lib/capture/tavily';
import { safeLink, type NoticeRecord } from '$lib/ingest/record';
import { CaptureLineSchema, NoticeRecordSchema } from '$lib/snapshot/index-row';
import { NoticeReadingsSchema, ReadingRunSchema } from '$lib/snapshot/readings';
import { NoticeSearchSchema, type NoticeSearch } from '$lib/snapshot/searches';
import { captureFacts } from '$lib/tenders/list';
import { buildTenderPage, type TenderPageData } from '$lib/tenders/tender-page';
import { readReplyFixture } from '../../test/fixtures/replies';
import BuyerSearch from './BuyerSearch.svelte';
import TenderPage from './TenderPage.svelte';

// The example capture as the records build wrote it: globalSetup ran scripts/build-records.mjs.
const BUILT = join('src', 'lib', 'snapshot', 'generated', '2026-09-15');
const NOTICE = '610242-2026';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const builtRecord = (notice: string): NoticeRecord =>
	NoticeRecordSchema.parse(readJson(join(BUILT, 'records', `${notice}.json`)));
const captureLine = () => CaptureLineSchema.parse(readJson(join(BUILT, 'capture.json')));
const builtReadings = (notice: string) =>
	NoticeReadingsSchema.parse(readJson(join(BUILT, 'readings', `${notice}.json`)));

interface RecordedResult {
	url: string;
	title: string;
	score: number;
}

const recordedResults = () =>
	(readReplyFixture('tavily-610242-buyer').response as unknown as { results: RecordedResult[] })
		.results;

// The buyer search the capture stores for 610242-2026, made by the capture's own functions from
// Tavily's recorded answer.
function recordedSearch(): NoticeSearch {
	return NoticeSearchSchema.parse({
		notice: NOTICE,
		status: 'searched',
		query: searchQuery(builtRecord(NOTICE)),
		results: readResults(recordedResults())
	});
}

function pageWith(search: NoticeSearch | undefined): TenderPageData {
	const line = captureLine();
	return {
		tender: buildTenderPage(
			builtRecord(NOTICE),
			new Date(line.fetchedAt),
			builtReadings(NOTICE),
			search
		),
		capture: captureFacts(line),
		readingRun: ReadingRunSchema.parse(readJson(join(BUILT, 'reading-run.json')))
	};
}

const textOf = (element: Element | null | undefined) =>
	element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('the buyer search on the tender page', () => {
	it('the tender page lists the buyer search results as unchecked web results', () => {
		const { container } = render(TenderPage, {
			props: { data: pageWith(recordedSearch()), variant: 'example' }
		});
		const region = container.querySelector('[data-web-search]');
		expect(region).not.toBeNull();
		const links = [...(region?.querySelectorAll('a') ?? [])];
		expect(links.map((link) => textOf(link))).toEqual(recordedResults().map(({ title }) => title));
		expect(links.map((link) => link.getAttribute('href'))).toEqual(
			recordedResults().map(({ url }) => new URL(url).href)
		);
		const words = textOf(region);
		expect(words).toContain('Web search results');
		expect(words).toContain('not checked');
		expect(words).toContain('do not change the verdict');
	});

	it('the example page lists the built buyer search of the German buyer', () => {
		const path = join(BUILT, 'searches', `${NOTICE}.json`);
		expect(existsSync(path)).toBe(true);
		const built = NoticeSearchSchema.parse(readJson(path));
		expect(built).toEqual(recordedSearch());
		const { container } = render(TenderPage, {
			props: { data: pageWith(built), variant: 'example' }
		});
		const links = [...container.querySelectorAll('[data-web-search] a')];
		expect(links.map((link) => textOf(link))).toEqual(recordedResults().map(({ title }) => title));
	});

	it('zero results read as none found by web search', () => {
		const none = NoticeSearchSchema.parse({ ...recordedSearch(), results: [] });
		const { container } = render(TenderPage, {
			props: { data: pageWith(none), variant: 'example' }
		});
		const region = container.querySelector('[data-web-search]');
		expect(region?.querySelectorAll('a')).toHaveLength(0);
		const lines = [...(region?.querySelectorAll('p') ?? [])].map((line) => textOf(line));
		expect(lines).toContain('No earlier awards found by web search.');
		expect(textOf(container)).not.toMatch(
			/\b(has|had|holds) no (earlier )?awards\b|\bnever (won|awarded|been awarded)\b|\bwon nothing\b/i
		);
	});

	it('the verdict is the same with and without search results', () => {
		// Each render draws new ids from $props.id() (c1, c2, ...), so ids are folded before comparing.
		const verdicts = (search: NoticeSearch | undefined) => {
			const { container } = render(TenderPage, {
				props: { data: pageWith(search), variant: 'example' }
			});
			return [...container.querySelectorAll('[data-verdict]')].map((region) =>
				region.outerHTML.replace(/\bc\d+(?=[-"])/g, 'cN')
			);
		};
		const without = verdicts(undefined);
		expect(without.length).toBeGreaterThan(0);
		expect(verdicts(recordedSearch())).toEqual(without);
		expect(verdicts(NoticeSearchSchema.parse({ ...recordedSearch(), results: [] }))).toEqual(
			without
		);
	});

	it('no search result is shown as verified', () => {
		const { container } = render(TenderPage, {
			props: { data: pageWith(recordedSearch()), variant: 'example' }
		});
		const leaf = container.querySelector('#web-search');
		expect(textOf(leaf?.querySelector('.label'))).toContain('not checked');
		expect(leaf?.querySelectorAll('[data-verdict], [data-ai-generated]')).toHaveLength(0);
		expect(leaf?.closest('[data-verdict], [data-ai-generated]')).toBeNull();
	});

	it('a result whose address is not http or https is shown as text, never as a link', () => {
		const hostile = 'javascript:alert(1)';
		const { container } = render(BuyerSearch, {
			props: {
				search: {
					results: [
						{ title: 'A planted result', link: { published: hostile, href: hostile } },
						{ title: 'A fine result', link: safeLink('https://fine.example/page') }
					]
				}
			}
		});
		const region = container.querySelector('[data-web-search]');
		const hrefs = [...(region?.querySelectorAll('a') ?? [])].map((link) =>
			link.getAttribute('href')
		);
		expect(hrefs).toEqual(['https://fine.example/page']);
		expect(textOf(region)).toContain('A planted result');
		expect(container.innerHTML).not.toContain('javascript:');
	});
});
