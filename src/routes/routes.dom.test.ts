import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeQuote } from '$lib/core/quote';
import { VERDICT_LABELS } from '$lib/core/verdict';
import { DEMO_FIRM_SHORT, DEMO_PROFILE } from '$lib/profile/demo-firm';
import { CaptureLineSchema, NoticeRecordSchema } from '$lib/snapshot/index-row';
import { NoticeReadingsSchema, type NoticeReadings } from '$lib/snapshot/readings';
import { captureFacts } from '$lib/tenders/list';
import { buildTenderPage, type TenderPageData } from '$lib/tenders/tender-page';
import { DECIDED_LINES, lotVerdict } from '$lib/tenders/verdict-view';
import Layout from './+layout.svelte';
import Page from './+page.svelte';

const TAGLINE = "The rule your firm can't meet alone is on page fifty. Read it first.";
const PURPOSE =
	"Pagefifty checks whether your firm meets a tender's published selection criteria, and quotes each clause from the tender's own text with its source.";
const entryData = {
	served: 7,
	total: 7,
	capturedOn: '15 Sep 2026',
	firstPublished: '1 Sep 2026',
	figure: null,
	example: null
};
const renderEntry = () => render(Page, { props: { data: entryData } });
const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

// The example capture as the records build wrote it: globalSetup ran scripts/build-records.mjs.
const BUILT = join('src', 'lib', 'snapshot', 'generated', '2026-09-15');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function storedReadings(notice: string): NoticeReadings | undefined {
	const path = join(BUILT, 'readings', `${notice}.json`);
	return existsSync(path) ? NoticeReadingsSchema.parse(readJson(path)) : undefined;
}

// A record of the example capture as the example loader hands it over, at the capture instant.
function exampleRecord(notice: string, readings = storedReadings(notice)): TenderPageData {
	const record = NoticeRecordSchema.parse(readJson(join(BUILT, 'records', `${notice}.json`)));
	const line = CaptureLineSchema.parse(readJson(join(BUILT, 'capture.json')));
	return {
		tender: buildTenderPage(record, new Date(line.fetchedAt), readings),
		capture: captureFacts(line),
		readingRun: null
	};
}

const renderWith = (example: TenderPageData | null) =>
	render(Page, { props: { data: { ...entryData, example } } }).container;

describe('entry route', () => {
	it('states the tagline as its heading and the product in its title', () => {
		renderEntry();
		expect(squash(screen.getByRole('heading', { level: 1 }).textContent)).toBe(TAGLINE);
		expect(document.title).toBe("Pagefifty: the rule your firm can't meet alone is on page fifty");
	});

	it('gives the purpose line as the lede and as the search description', () => {
		renderEntry();
		expect(screen.getByText(PURPOSE, { normalizer: squash })).toBeTruthy();
		const description = document.head.querySelector('meta[name="description"]');
		expect(description?.getAttribute('content')).toBe(PURPOSE);
	});

	it('reads the capture count and its publication window from the loaded index, not from the page', () => {
		renderEntry();
		expect(
			screen.getByText(
				'Snapshot: 7 IT notices published from 1 Sep 2026 that TED listed as active on 15 Sep 2026.',
				{ normalizer: squash }
			).className
		).toContain('mono');
	});

	// The figure counts the notices the site serves, so the capture line leads with that count and
	// names TED's own count beside it, never in its place.
	it('leads with the served count when the capture serves fewer notices than TED listed', () => {
		render(Page, { props: { data: { ...entryData, served: 5 } } });
		expect(
			screen.getByText(
				'Snapshot: 5 of the 7 IT notices published from 1 Sep 2026 that TED listed as active on 15 Sep 2026.',
				{ normalizer: squash }
			).className
		).toContain('mono');
	});

	it('keeps the capture line without a window when the query names no first day', () => {
		render(Page, {
			props: {
				data: { served: 7, total: 7, capturedOn: '15 Sep 2026', figure: null, example: null }
			}
		});
		expect(
			screen.getByText('Snapshot: 7 IT notices TED listed as active on 15 Sep 2026.', {
				normalizer: squash
			}).className
		).toContain('mono');
	});

	// With no example record the first action opens the example list, and no card stands beside it.
	it('leads to the example, the tenders and the profile, and says it is not legal advice', () => {
		const { container } = renderEntry();
		expect(screen.getByRole('link', { name: 'Browse open tenders' }).getAttribute('href')).toBe(
			'/tenders'
		);
		const example = screen.getByRole('link', { name: 'Open the example verdict' });
		expect(example.getAttribute('href')).toBe('/example');
		expect(
			[...(container.querySelector('.actions')?.querySelectorAll('a') ?? [])].map((link) =>
				link.textContent?.trim()
			)
		).toEqual(['Open the example verdict', 'Browse open tenders']);
		expect(container.querySelector('[data-example]')).toBeNull();
		expect(screen.getByRole('link', { name: 'Set up your firm' }).getAttribute('href')).toBe(
			'/profile'
		);
		expect(
			screen.getByText('Not legal advice. Your firm profile stays in your browser', {
				normalizer: squash
			})
		).toBeTruthy();
	});

	it('opens the example record its card shows, with the verdict of its first lot that has one', () => {
		const data = exampleRecord('610242-2026');
		const container = renderWith(data);
		expect(
			screen.getByRole('link', { name: 'Open the example verdict' }).getAttribute('href')
		).toBe('/example/610242-2026');
		const card = container.querySelector('[data-example]');
		expect(squash(card?.querySelector('h2')?.textContent)).toBe(data.tender.title.text);
		expect(card?.querySelector('h2')?.getAttribute('lang')).toBe(data.tender.title.lang);
		const ted = card?.querySelector(`a[href="${data.tender.tedUrl}"]`);
		expect(squash(ted?.textContent)).toBe('TED notice 610242-2026');
		expect(squash(card?.textContent)).toContain(`Checked against ${DEMO_FIRM_SHORT}, demo firm`);
		// One verdict tag, in the app's verdict words, whichever verdict the capture gives the lot.
		const tags = [...(card?.querySelectorAll('[data-verdict-word]') ?? [])];
		expect(tags).toHaveLength(1);
		expect(Object.values(VERDICT_LABELS)).toContain(squash(tags[0]?.textContent));
		// The card's last line says what this lot's run did: the demo firm meets no figure on this
		// lot, so it never says figures were compared.
		const view = lotVerdict(data.tender.lots[0], DEMO_PROFILE, data.tender.now);
		expect(squash(card?.querySelector('.foot')?.textContent)).toBe(
			`Read with NVIDIA Nemotron on Nebius. ${DECIDED_LINES['nothing-compared']}`
		);
		expect(view?.decidedBy).toBe(DECIDED_LINES['nothing-compared']);
		expect(squash(card?.textContent)).not.toContain('Numbers compared by code.');
	});

	// The clause that decides is the one the verdict rests on, quoted from the notice. The card shows
	// the sentence holding the first quote the verdict rests on, that quote set apart, and the
	// model's one reading of it labelled as such; the whole clause folds out under it.
	it("sets the deciding words apart inside the deciding clause and labels the model's reading", () => {
		const data = exampleRecord('610242-2026');
		const [lot] = data.tender.lots;
		const view = lotVerdict(lot, DEMO_PROFILE, data.tender.now, data.tender.documents);
		const deciding = lot.criteria.find((each) => each.position === view?.deciding);
		expect(deciding?.requirements?.length).toBeGreaterThan(0);
		const resting = (view?.decidingQuotes ?? []).map((index) => deciding?.requirements?.[index]);
		expect(resting.length).toBeGreaterThan(0);
		const card = renderWith(data).querySelector('[data-example]');
		const source = deciding?.descriptions.find(
			(each) => each.lang === deciding.requirements?.[0].lang
		);
		const whole = card?.querySelector('details.whole blockquote');
		expect(whole?.textContent).toBe(source?.text.trim());
		const excerpt = card?.querySelector('.excerpt blockquote');
		expect(excerpt?.textContent?.length).toBeGreaterThan(20);
		expect(source?.text.trim()).toContain(excerpt?.textContent);
		expect(excerpt?.textContent?.length).toBeLessThan(source?.text.trim().length ?? 0);
		expect(squash(card?.querySelector('details.whole summary')?.textContent)).toBe(
			'Show the whole clause'
		);
		// Each mark is a quote the verdict rests on, as code verified it: whitespace collapsed and a
		// line-end hyphen's break dropped (normalizeQuote), so a quote over a word the PDF broke is
		// marked too. The excerpt marks the first of them only.
		const marked = (root: Element | null | undefined) =>
			[...(root?.querySelectorAll('mark') ?? [])].map((mark) =>
				normalizeQuote(mark.textContent ?? '')
			);
		expect(marked(excerpt)).toEqual([normalizeQuote(resting[0]?.quote ?? '')]);
		expect(marked(whole).length).toBeGreaterThan(0);
		for (const mark of marked(whole)) {
			expect(resting.map((each) => normalizeQuote(each?.quote ?? ''))).toContain(mark);
		}
		const readings = [...(card?.querySelectorAll('[data-ai-generated]') ?? [])];
		expect(readings.map((each) => each.textContent)).toEqual([resting[0]?.reading]);
		expect(squash(card?.textContent)).toContain('Quoted from TED notice 610242-2026');
		expect(card?.querySelectorAll('.ai-label')).toHaveLength(1);
	});

	it('skips the lots with no verdict and shows the first lot that has one', () => {
		const data = exampleRecord('610242-2026');
		const [lot] = data.tender.lots;
		const unlisted = { ...lot, anchor: 'lot-1', number: 1, verdictInput: undefined };
		const second = { ...lot, anchor: 'lot-2', number: 2 };
		const card = renderWith({
			...data,
			tender: { ...data.tender, lots: [unlisted, second] }
		}).querySelector('[data-example]');
		expect(squash(card?.querySelector('.lot')?.textContent)).toMatch(/^Lot 2\b/);
	});

	// A record whose lots carry no verdict, or no record at all, shows no card and opens the list.
	it.each([
		['a record the readings do not list', () => exampleRecord('609955-2026')],
		['no record', () => null]
	])('shows no card and links the example list for %s', (_name, example) => {
		const container = renderWith(example());
		expect(container.querySelector('[data-example]')).toBeNull();
		expect(container.querySelector('[data-verdict]')).toBeNull();
		expect(
			screen.getByRole('link', { name: 'Open the example verdict' }).getAttribute('href')
		).toBe('/example');
		cleanup();
	});

	it('sets the page in the main frame with the start panel first and the firm panel after it', () => {
		const { container } = renderEntry();
		const main = container.querySelector('main');
		expect(main?.classList.contains('page')).toBe(true);
		const panels = [...(main?.querySelectorAll(':scope > .panel') ?? [])];
		expect(
			panels.map((panel) => [
				panel.id,
				squash(document.getElementById(panel.getAttribute('aria-labelledby') ?? '')?.textContent)
			])
		).toEqual([
			['start', TAGLINE],
			['firm', "Your firm's figures"]
		]);
	});
});

describe('root layout', () => {
	beforeEach(() => {
		// jsdom has no matchMedia, and the theme switch in the top band asks it for the OS scheme.
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('renders the page inside it and links the favicon', () => {
		const children = createRawSnippet(() => ({ render: () => '<p>inner page</p>' }));
		render(Layout, { props: { children } });
		expect(screen.getByText('inner page')).toBeTruthy();
		expect(document.head.querySelector('link[rel="icon"]')?.getAttribute('href')).toBeTruthy();
	});

	// The tab shows the top band's "50" square, filled with the band's own green, not a template logo.
	it('draws the tab icon as the top band mark in the band colour', () => {
		const icon = readFileSync(join('src', 'lib', 'assets', 'favicon.svg'), 'utf8');
		const band = /--band:\s*(#[0-9a-f]{6});/i.exec(readFileSync(join('src', 'app.css'), 'utf8'));
		expect(band?.[1]).toEqual(expect.any(String));
		expect(icon).toContain(`<rect width="32" height="32" rx="8" fill="${band?.[1]}"/>`);
		expect(icon).toContain('<title>Pagefifty</title>');
	});

	it('puts the top band above the page and preloads only the latin font file', () => {
		const children = createRawSnippet(() => ({ render: () => '<p>inner page</p>' }));
		const { container } = render(Layout, { props: { children } });
		const header = screen.getByRole('banner');
		expect(
			header.compareDocumentPosition(screen.getByText('inner page')) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		expect(container.querySelector('header')).toBe(header);
		const preloads = [...document.head.querySelectorAll('link[rel="preload"][as="font"]')].map(
			(link) => link.getAttribute('href')
		);
		expect(preloads).toEqual(['/fonts/albert-sans-latin.woff2']);
	});
});

describe('entry route main', () => {
	it('is the skip link target', () => {
		renderEntry();
		expect(document.getElementById('main')?.tagName).toBe('MAIN');
	});
});
