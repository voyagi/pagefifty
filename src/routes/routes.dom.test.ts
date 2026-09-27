import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './+layout.svelte';
import Page from './+page.svelte';

const TAGLINE = "The rule your firm can't meet alone is on page fifty. Read it first.";
const PURPOSE =
	"Pagefifty checks whether your firm meets a tender's published selection criteria, and quotes each clause from the tender's own text with its source.";
const entryData = { total: 7, capturedOn: '15 Sep 2026' };
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

	it('reads the capture count from the loaded index, not from the page', () => {
		renderEntry();
		expect(
			screen.getByText('Snapshot: 7 IT notices TED listed as active on 15 Sep 2026.', {
				normalizer: squash
			}).className
		).toContain('mono');
	});

	it('leads to the tenders and the profile, says it is not legal advice, and links no example yet', () => {
		renderEntry();
		expect(screen.getByRole('link', { name: 'Browse open tenders' }).getAttribute('href')).toBe(
			'/tenders'
		);
		expect(screen.getByRole('link', { name: 'Set up your firm' }).getAttribute('href')).toBe(
			'/profile'
		);
		expect(screen.getByText('This is not legal advice.')).toBeTruthy();
		const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
		expect(hrefs.some((href) => href?.startsWith('/example'))).toBe(false);
	});

	it('files the page in a teal binder with the Start tab open and the Firm tab after it', () => {
		const { container } = renderEntry();
		expect(container.querySelector('main')?.classList.contains('board-teal')).toBe(true);
		const tabs = [...container.querySelectorAll('a.tab')];
		expect(tabs.map((tab) => [squash(tab.textContent), tab.getAttribute('aria-current')])).toEqual([
			['Start', 'true'],
			['Firm', null]
		]);
	});
});

describe('root layout', () => {
	beforeEach(() => {
		// jsdom has no matchMedia, and the theme switch in the desk bar asks it for the OS scheme.
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

	it('puts the desk bar above the page and preloads the two fonts every page uses', () => {
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
		expect(preloads).toEqual(
			expect.arrayContaining(['/fonts/plex-sans.woff2', '/fonts/plex-sans-condensed-600.woff2'])
		);
	});
});

describe('entry route main', () => {
	it('is the skip link target', () => {
		renderEntry();
		expect(document.getElementById('main')?.tagName).toBe('MAIN');
	});
});
