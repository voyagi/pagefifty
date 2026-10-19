import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readResults, searchQuery } from '$lib/capture/tavily';
import type { NoticeRecord } from '$lib/ingest/record';
import { CaptureLineSchema, NoticeRecordSchema } from '$lib/snapshot/index-row';
import { NoticeReadingsSchema, ReadingRunSchema } from '$lib/snapshot/readings';
import { NoticeSearchSchema, type NoticeSearch } from '$lib/snapshot/searches';
import { captureFacts } from '$lib/tenders/list';
import { buildTenderPage, type TenderPageData } from '$lib/tenders/tender-page';
import { readReplyFixture } from '../../test/fixtures/replies';
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
});
