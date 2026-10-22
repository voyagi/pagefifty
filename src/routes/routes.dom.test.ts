import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './+layout.svelte';
import Page from './+page.svelte';

const TAGLINE = "The rule your firm can't meet alone is on page fifty. Read it first.";
const PURPOSE =
	"Pagefifty checks whether your firm meets a tender's published selection criteria, and quotes each clause from the tender's own text with its source.";
const entryData = {
	total: 7,
	capturedOn: '15 Sep 2026',
	firstPublished: '1 Sep 2026',
	figure: null
};
const renderEntry = () => render(Page, { props: { data: entryData } });
const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

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

	it('keeps the capture line without a window when the query names no first day', () => {
		render(Page, { props: { data: { total: 7, capturedOn: '15 Sep 2026', figure: null } } });
		expect(
			screen.getByText('Snapshot: 7 IT notices TED listed as active on 15 Sep 2026.', {
				normalizer: squash
			}).className
		).toContain('mono');
	});

	it('leads to the tenders, the example run and the profile, and says it is not legal advice', () => {
		const { container } = renderEntry();
		expect(screen.getByRole('link', { name: 'Browse open tenders' }).getAttribute('href')).toBe(
			'/tenders'
		);
		const example = screen.getByRole('link', { name: 'Open the example run' });
		expect(example.getAttribute('href')).toBe('/example');
		expect(
			[...(container.querySelector('.cover-foot .actions')?.querySelectorAll('a') ?? [])].map(
				(link) => link.textContent?.trim()
			)
		).toEqual(['Browse open tenders', 'Open the example run']);
		expect(screen.getByRole('link', { name: 'Set up your firm' }).getAttribute('href')).toBe(
			'/profile'
		);
		expect(screen.getByText('This is not legal advice.')).toBeTruthy();
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
