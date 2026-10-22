import { getConfig, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import Page from '../routes/+page.svelte';

// The Svelte testing library wraps each test in its setup and cleanup only when vitest's globals are
// on, and they are off here, so the jsdom project loads the library's vitest setup module instead.
describe('Svelte testing setup in the jsdom project', () => {
	it('makes events fired through the DOM testing library wait for Svelte to flush', () => {
		expect(getConfig().eventWrapper).toBe(flushSync);
	});

	// The two tests below run in order: the second proves the first one's page was removed.
	it('renders a page into the document', () => {
		render(Page, {
			props: { data: { total: 1, capturedOn: '15 Sep 2026', figure: null, example: null } }
		});
		expect(document.querySelectorAll('h1')).toHaveLength(1);
	});

	it('starts the next test with that page gone', () => {
		expect(document.querySelectorAll('h1')).toHaveLength(0);
	});
});
