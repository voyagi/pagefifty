import { render } from '@testing-library/svelte';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CaptureLineSchema, NoticeRecordSchema } from '$lib/snapshot/index-row';
import { NoticeReadingsSchema, ReadingRunSchema } from '$lib/snapshot/readings';
import { captureFacts } from '$lib/tenders/list';
import { buildTenderPage, type TenderPageData } from '$lib/tenders/tender-page';
import TenderPage from './TenderPage.svelte';

// The example capture as the records build wrote it: globalSetup ran scripts/build-records.mjs.
const BUILT = join('src', 'lib', 'snapshot', 'generated', '2026-09-15');
const MODEL = 'nvidia/nemotron-3-super-120b-a12b';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const readingsPath = (notice: string) => join(BUILT, 'readings', `${notice}.json`);

function storedReadings(notice: string) {
	const path = readingsPath(notice);
	return existsSync(path) ? NoticeReadingsSchema.parse(readJson(path)) : undefined;
}

function examplePage(notice: string): TenderPageData {
	const record = NoticeRecordSchema.parse(readJson(join(BUILT, 'records', `${notice}.json`)));
	const line = CaptureLineSchema.parse(readJson(join(BUILT, 'capture.json')));
	const runPath = join(BUILT, 'reading-run.json');
	return {
		tender: buildTenderPage(record, new Date(line.fetchedAt), storedReadings(notice)),
		capture: captureFacts(line),
		readingRun: existsSync(runPath) ? ReadingRunSchema.parse(readJson(runPath)) : null
	};
}

const textOf = (element: Element | null | undefined) => element?.textContent?.trim() ?? '';

describe('the model readings on the example tender pages', () => {
	it('the German lot page shows each reading under its own clause with the AI label', () => {
		expect(existsSync(readingsPath('610242-2026'))).toBe(true);
		const { container } = render(TenderPage, {
			props: { data: examplePage('610242-2026'), variant: 'example' }
		});
		const clauses = [...container.querySelectorAll('li.clause')];
		expect(clauses).toHaveLength(6);
		const [stored] = storedReadings('610242-2026')?.readings ?? [];
		clauses.forEach((clause, index) => {
			const own = stored.items.filter((item) => item.criterion === index + 1);
			const rows = [...clause.querySelectorAll('.requirement')];
			expect(rows.map((row) => textOf(row.querySelector('[data-ai-generated]')))).toEqual(
				own.map((item) => item.reading)
			);
		});
		const row = [...clauses[2].querySelectorAll('.requirement')].find((each) =>
			textOf(each.querySelector('[data-notice-text]')).startsWith(
				'Die Mindestanforderung für den durchschnittlichen Jahresumsatz'
			)
		);
		expect(row).toBeDefined();
		expect(row?.querySelector('[data-notice-text]')?.getAttribute('lang')).toBe('de');
		const reading = row?.querySelector('[data-ai-generated]');
		expect(reading?.getAttribute('data-ai-generated')).toBe(MODEL);
		expect(textOf(reading)).toMatch(
			/^The bidder must have an average annual turnover of at least 100,000\.00 EUR net/
		);
		expect(textOf(row?.querySelector('.ai-label'))).toBe('AI reading');
	});
});
