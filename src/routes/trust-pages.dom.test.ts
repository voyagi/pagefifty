import { render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	page: { status: 200, error: null as App.Error | null, url: new URL('http://127.0.0.1/') }
}));
vi.mock('$app/state', () => state);

const { default: Layout } = await import('./+layout.svelte');

const TRUST_LINKS = [['How the AI is used', '/ai']];

describe('the site footer', () => {
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

	// The error page renders inside the root layout, so a 404 reaches the footer through the same
	// layout; a footer the layout drew only for a page that answered would be caught by its status.
	it.each([
		['the entry page', '/', 200],
		['the tenders list', '/tenders', 200],
		['the profile page', '/profile', 200],
		['the error page', '/no-such-page', 404]
	])('every page carries the trust page links in its footer: %s', (_label, path, status) => {
		state.page.url = new URL(`http://127.0.0.1${path}`);
		state.page.status = status;
		const children = createRawSnippet(() => ({ render: () => '<p>inner page</p>' }));
		render(Layout, { props: { children } });
		const footer = screen.getByRole('contentinfo');
		expect(
			screen.getByText('inner page').compareDocumentPosition(footer) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		const links = within(footer)
			.queryAllByRole('link')
			.map((link) => [link.textContent?.trim(), link.getAttribute('href')]);
		expect(links).toEqual(TRUST_LINKS);
	});
});
