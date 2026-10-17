import { render } from '@testing-library/svelte';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NoticeRecord } from '$lib/ingest/record';
import { CaptureLineSchema, NoticeRecordSchema } from '$lib/snapshot/index-row';
import {
	NoticeReadingsSchema,
	ReadingRunSchema,
	type NoticeReadings,
	type ReplyItem
} from '$lib/snapshot/readings';
import { captureFacts } from '$lib/tenders/list';
import { buildTenderPage, type TenderPageData } from '$lib/tenders/tender-page';
import RunRecord, { RUN_RECORD_FIELDS } from './RunRecord.svelte';
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

const builtRecord = (notice: string): NoticeRecord =>
	NoticeRecordSchema.parse(readJson(join(BUILT, 'records', `${notice}.json`)));
const captureLine = () => CaptureLineSchema.parse(readJson(join(BUILT, 'capture.json')));
const readingRun = () => {
	const runPath = join(BUILT, 'reading-run.json');
	return existsSync(runPath) ? ReadingRunSchema.parse(readJson(runPath)) : null;
};

function pageOf(record: NoticeRecord, readings: NoticeReadings | undefined): TenderPageData {
	const line = captureLine();
	return {
		tender: buildTenderPage(record, new Date(line.fetchedAt), readings),
		capture: captureFacts(line),
		readingRun: readingRun()
	};
}

const examplePage = (notice: string) => pageOf(builtRecord(notice), storedReadings(notice));

// The page as phase 1 built it: no readings and no run handed in.
function phaseOnePage(notice: string): TenderPageData {
	const line = captureLine();
	return {
		tender: buildTenderPage(builtRecord(notice), new Date(line.fetchedAt)),
		capture: captureFacts(line)
	};
}

const textOf = (element: Element | null | undefined) => element?.textContent?.trim() ?? '';
const occurrences = (text: string, part: string) => text.split(part).length - 1;

function renderPage(data: TenderPageData) {
	return render(TenderPage, { props: { data, variant: 'example' } }).container;
}

// Each render draws new ids from $props.id() (c1, c2, ...), so two renders of one page differ there
// and nowhere else.
const sameIds = (html: string) => html.replace(/\bc\d+(?=[-"])/g, 'cN');

// The page without its run record, which every tender page carries and is checked on its own.
function withoutRunRecord(element: Element): string {
	const copy = element.cloneNode(true) as Element;
	for (const node of copy.querySelectorAll('[data-run-record]')) node.remove();
	return sameIds(copy.innerHTML);
}

const REJECTED_QUOTE = 'Dieser Satz steht in keiner Klausel dieses Loses.';
const REJECTED_READING = 'A reading whose quote this clause does not hold.';

// 610242-2026 with its lot copied as a second lot: the first read with one more requirement whose
// quote is in no clause, the second listed as not read.
function syntheticPage(): TenderPageData {
	const record = builtRecord('610242-2026');
	const [lot] = record.lots;
	const stored = storedReadings('610242-2026');
	if (stored === undefined) throw new Error('no generated readings for 610242-2026');
	const [reading] = stored.readings;
	const rejected: ReplyItem = {
		criterion: 3,
		kind: 'turnover-specific',
		quote: REJECTED_QUOTE,
		reading: REJECTED_READING,
		numberText: '',
		period: '',
		mandatory: true
	};
	return pageOf(
		{ ...record, lots: [lot, { ...lot, id: 'LOT-0001' }] },
		{
			notice: stored.notice,
			lots: [
				{ lot: lot.id, status: 'read', textSha256: reading.textSha256 },
				{ lot: 'LOT-0001', status: 'not-read', reason: 'cap-reached' }
			],
			readings: [{ ...reading, items: [...reading.items, rejected] }]
		}
	);
}

const storedTexts = (notice: string): string[] =>
	(storedReadings(notice)?.readings ?? []).flatMap((reading) =>
		reading.items.map((item) => item.reading)
	);

// Every reading of the two example lots verifies, so each stored reading is one the page shows; the
// synthetic page shows the German ones and never its rejected one.
const SUBJECTS = [
	{ name: '610242-2026', data: () => examplePage('610242-2026'), shown: '610242-2026' },
	{ name: '634398-2026', data: () => examplePage('634398-2026'), shown: '634398-2026' },
	{ name: 'the synthetic page', data: syntheticPage, shown: '610242-2026' }
];

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

	it('every model reading carries the AI label and the marker, and no other text does', () => {
		for (const subject of SUBJECTS) {
			const container = renderPage(subject.data());
			const marked = [...container.querySelectorAll('[data-ai-generated]')];
			const stored = storedTexts(subject.shown);
			expect(marked.length, subject.name).toBe(stored.length);
			expect(marked.map((element) => textOf(element)).sort(), subject.name).toEqual(
				[...stored].sort()
			);
			for (const element of marked) {
				expect(element.getAttribute('data-ai-generated')).toBe(MODEL);
				expect(element.matches('.requirement .reading'), subject.name).toBe(true);
				expect(element.closest('[data-notice-text]')).toBeNull();
				expect(element.querySelector('[data-notice-text]')).toBeNull();
				const labels = [...(element.closest('.requirement')?.querySelectorAll('.ai-label') ?? [])];
				expect(labels.map((label) => textOf(label))).toEqual(['AI reading']);
			}
			const page = container.textContent ?? '';
			for (const text of stored) {
				const inside = marked.filter((element) => textOf(element) === text).length;
				expect(occurrences(page, text), text).toBe(inside);
			}
			expect(occurrences(page, 'AI reading'), subject.name).toBe(marked.length);
			expect(container.querySelectorAll('.ai-label')).toHaveLength(marked.length);
			expect(container.querySelectorAll('[data-notice-text][data-ai-generated]')).toHaveLength(0);
		}
	});

	it('a rejected quote shows as not read with no AI label', () => {
		const container = renderPage(syntheticPage());
		const page = container.textContent ?? '';
		expect(page).not.toContain(REJECTED_QUOTE);
		expect(page).not.toContain(REJECTED_READING);
		const third = container.querySelectorAll('#lot-1 li.clause')[2];
		const lines = [...third.querySelectorAll('.not-read')];
		expect(lines.map((line) => textOf(line))).toEqual([
			'Not read: the quote the model gave was not found in this clause, so it is not used.'
		]);
		expect(lines[0].closest('.requirement')).toBeNull();
		expect(lines[0].querySelector('[data-ai-generated], .ai-label')).toBeNull();
	});

	it.each([
		['dry-run', 'Not read: the run that captured this notice made no model calls.'],
		['cap-reached', 'Not read: the run reached its cap on model calls before this lot.'],
		[
			'reply-invalid',
			'Not read: the model did not answer in the expected form, even when asked a second time.'
		],
		['send-failed', 'Not read: the request to the model failed.'],
		['outside-the-run', 'Not read: this lot was not part of the run that read this capture.']
	] as const)('a listed lot that was not read says why: %s', (reason, line) => {
		const record = builtRecord('610242-2026');
		const [lot] = record.lots;
		const container = renderPage(
			pageOf(record, {
				notice: record.noticeNumber,
				lots: [{ lot: lot.id, status: 'not-read', reason }],
				readings: []
			})
		);
		const leaf = container.querySelector('#lot-1');
		const said = [...(leaf?.querySelectorAll('.not-read') ?? [])];
		expect(said.map((each) => textOf(each))).toEqual([line]);
		expect(leaf?.querySelectorAll('[data-ai-generated], .requirement')).toHaveLength(0);
		said[0].remove();
		const before = renderPage(phaseOnePage('610242-2026')).querySelector('#lot-1');
		expect(sameIds(leaf?.innerHTML ?? '')).toBe(sameIds(before?.innerHTML ?? ''));
		expect(before?.innerHTML.length).toBeGreaterThan(1000);
	});

	it('a lot listed as read whose reading is missing says so and shows no reading', () => {
		const record = builtRecord('610242-2026');
		const container = renderPage(
			pageOf(record, {
				notice: record.noticeNumber,
				lots: [{ lot: record.lots[0].id, status: 'read', textSha256: '0'.repeat(64) }],
				readings: []
			})
		);
		expect([...container.querySelectorAll('#lot-1 .not-read')].map((each) => textOf(each))).toEqual(
			['Not read: this capture lists the lot as read, but its reading is missing.']
		);
		expect(container.querySelectorAll('[data-ai-generated], .ai-label')).toHaveLength(0);
	});

	it('a notice the readings do not list keeps the phase 1 view', () => {
		expect(storedReadings('609955-2026')).toBeUndefined();
		const read = renderPage(examplePage('609955-2026'));
		expect(read.querySelectorAll('[data-ai-generated], .requirement, .not-read')).toHaveLength(0);
		const before = renderPage(phaseOnePage('609955-2026'));
		expect(withoutRunRecord(read)).toBe(withoutRunRecord(before));
		expect(read.querySelectorAll('[data-run-record] dl')).toHaveLength(1);
	});

	it('every criterion of a read lot links its source', () => {
		for (const notice of ['610242-2026', '634398-2026']) {
			const data = examplePage(notice);
			const container = renderPage(data);
			const readLots = data.tender.lots.filter((lot) => lot.reading?.status === 'read');
			expect(readLots).toHaveLength(1);
			const clauses = [...container.querySelectorAll(`#${readLots[0].anchor} li.clause`)];
			expect(clauses).toHaveLength(readLots[0].criteria.length);
			for (const clause of clauses) {
				const links = [...clause.querySelectorAll('a')].map((link) => link.getAttribute('href'));
				expect(links).toEqual([data.tender.tedUrl]);
			}
		}
	});

	it('a reading holding markup renders as text', () => {
		const data = examplePage('610242-2026');
		const [criterion] = data.tender.lots[0].criteria;
		const markup = '<b>bold</b> <a href="https://example.org/">link</a> <script>x()</script>';
		const [first] = criterion.requirements ?? [];
		criterion.requirements = [{ ...first, reading: markup }];
		const container = renderPage(data);
		const reading = container.querySelector('#lot-1 li.clause [data-ai-generated]');
		expect(reading?.textContent).toBe(markup);
		expect(reading?.children).toHaveLength(0);
	});
});

const RUN_TERMS = [
	'Model',
	'Provider',
	'Region',
	'Run date',
	'Input tokens',
	'Output tokens',
	'Reasoning tokens',
	'Cost in USD',
	'Quotes verified',
	'Quotes rejected'
];

describe('RunRecord', () => {
	it('the run record names the read in a fixed order', () => {
		const run = readingRun();
		expect(run).not.toBeNull();
		const { container } = render(RunRecord, { props: { run } });
		const record = container.querySelector('[data-run-record]');
		const terms = [...(record?.querySelectorAll('dt') ?? [])].map((term) => textOf(term));
		const details = [...(record?.querySelectorAll('dd') ?? [])];
		expect(terms).toEqual(RUN_TERMS);
		expect(RUN_RECORD_FIELDS.map((field) => field.term)).toEqual(RUN_TERMS);
		expect(details.map((detail) => textOf(detail))).toEqual([
			'nvidia/nemotron-3-super-120b-a12b',
			'Nebius Token Factory',
			'us-central1',
			'2026-10-15',
			'2,811',
			'2,563',
			'0',
			'0.003150',
			'24',
			'0'
		]);
		const mono = details.map((detail) => detail.querySelector('.mono') !== null);
		expect(mono).toEqual([true, false, true, true, true, true, true, true, true, true]);
		expect(record?.querySelectorAll('[data-ai-generated]')).toHaveLength(0);
	});

	it('says a capture with no model read has none, and nothing else', () => {
		expect(existsSync(join(BUILT, '..', '2026-10-16', 'reading-run.json'))).toBe(false);
		const { container } = render(RunRecord, { props: { run: null } });
		expect(textOf(container)).toBe('No model read in this capture.');
		expect(container.querySelectorAll('[data-run-record]')).toHaveLength(1);
		expect(container.querySelectorAll('dl')).toHaveLength(0);
	});

	it('sits on every tender page, with the run of its capture or the no-read line', () => {
		const read = renderPage(examplePage('609955-2026'));
		expect(read.querySelectorAll('[data-run-record] dt')).toHaveLength(RUN_TERMS.length);
		const none = renderPage(phaseOnePage('609955-2026'));
		expect(textOf(none.querySelector('[data-run-record]'))).toBe('No model read in this capture.');
	});
});
