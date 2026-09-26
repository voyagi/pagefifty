import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './+layout.svelte';
import Page from './+page.svelte';

describe('entry route', () => {
	it('names the product in its heading and title', () => {
		render(Page);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pagefifty');
		expect(document.title).toBe('Pagefifty');
	});

	it('describes the check for search results', () => {
		render(Page);
		const description = document.head.querySelector('meta[name="description"]');
		expect(description?.getAttribute('content')).toContain('EU public tender');
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
			expect.arrayContaining(['/fonts/plex-sans-400.woff2', '/fonts/plex-sans-condensed-600.woff2'])
		);
	});
});

describe('entry route main', () => {
	it('is the skip link target', () => {
		render(Page);
		expect(document.getElementById('main')?.tagName).toBe('MAIN');
	});
});
