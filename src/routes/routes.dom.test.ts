import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
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
	it('renders the page inside it and links the favicon', () => {
		const children = createRawSnippet(() => ({ render: () => '<p>inner page</p>' }));
		render(Layout, { props: { children } });
		expect(screen.getByText('inner page')).toBeTruthy();
		expect(document.head.querySelector('link[rel="icon"]')?.getAttribute('href')).toBeTruthy();
	});
});
