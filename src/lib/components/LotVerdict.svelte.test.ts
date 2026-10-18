import { render } from '@testing-library/svelte';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NoticeRecord } from '$lib/ingest/record';
import { CaptureLineSchema, NoticeRecordSchema } from '$lib/snapshot/index-row';
import { NoticeReadingsSchema, type NoticeReadings } from '$lib/snapshot/readings';
import { captureFacts } from '$lib/tenders/list';
import { buildTenderPage, type TenderPageData } from '$lib/tenders/tender-page';
import TenderPage from './TenderPage.svelte';

// The example capture as the records build wrote it: globalSetup ran scripts/build-records.mjs.
const BUILT = join('src', 'lib', 'snapshot', 'generated', '2026-09-15');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function storedReadings(notice: string): NoticeReadings | undefined {
	const path = join(BUILT, 'readings', `${notice}.json`);
	return existsSync(path) ? NoticeReadingsSchema.parse(readJson(path)) : undefined;
}

const builtRecord = (notice: string): NoticeRecord =>
	NoticeRecordSchema.parse(readJson(join(BUILT, 'records', `${notice}.json`)));

function pageOf(record: NoticeRecord, readings: NoticeReadings | undefined): TenderPageData {
	const line = CaptureLineSchema.parse(readJson(join(BUILT, 'capture.json')));
	return {
		tender: buildTenderPage(record, new Date(line.fetchedAt), readings),
		capture: captureFacts(line),
		readingRun: null
	};
}

const examplePage = (notice: string) => pageOf(builtRecord(notice), storedReadings(notice));

const textOf = (element: Element | null | undefined) =>
	element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function verdictOf(container: Element, anchor: string): Element | null {
	return container.querySelector(`#${anchor} [data-verdict]`);
}

describe('the lot verdict on the tender page', () => {
	it('the German example lot reads ASK FIRST for the demo firm with its reason', () => {
		const { container } = render(TenderPage, {
			props: { data: examplePage('610242-2026'), variant: 'example' }
		});
		const region = verdictOf(container, 'lot-1');
		expect(region).not.toBeNull();
		expect(textOf(region?.querySelector('[data-verdict-word]'))).toBe('Ask first');
		expect(textOf(region)).toContain(
			'Only the firm can judge whether its references or staff fit what the buyer names.'
		);
		expect(textOf(region)).toContain('Compared with the demo firm, Brink Data B.V.');
	});
});
