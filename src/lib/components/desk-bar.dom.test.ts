import { render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeskBar from './DeskBar.svelte';
import MainNav from './MainNav.svelte';

// jsdom has no matchMedia, and the theme switch inside the desk bar asks it for the OS scheme.
function stubColourScheme() {
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	);
}

function navLinks() {
	const nav = screen.getByRole('navigation', { name: 'Main' });
	return within(nav)
		.getAllByRole('link')
		.map((link) => ({
			name: link.textContent?.trim(),
			href: link.getAttribute('href'),
			current: link.getAttribute('aria-current')
		}));
}

describe('MainNav', () => {
	it('links exactly Tenders and Firm profile until the example run exists', () => {
		render(MainNav, { props: { path: '/' } });
		expect(navLinks()).toEqual([
			{ name: 'Tenders', href: '/tenders', current: null },
			{ name: 'Firm profile', href: '/profile', current: null }
		]);
	});

	it('marks the link of the current route as the page', () => {
		render(MainNav, { props: { path: '/profile' } });
		expect(navLinks().map((link) => link.current)).toEqual([null, 'page']);
	});

	it('marks the parent link on a child route', () => {
		render(MainNav, { props: { path: '/tenders/600457-2026' } });
		expect(navLinks().map((link) => link.current)).toEqual(['true', null]);
	});

	it('marks nothing for a path that only starts with the same letters', () => {
		render(MainNav, { props: { path: '/tendersheet' } });
		expect(navLinks().map((link) => link.current)).toEqual([null, null]);
	});
});

describe('DeskBar', () => {
	beforeEach(stubColourScheme);
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('opens with a skip link to the main content', () => {
		const { container } = render(DeskBar, { props: { path: '/tenders' } });
		const first = container.querySelector('a, button');
		expect(first?.textContent?.trim()).toBe('Skip to content');
		expect(first?.getAttribute('href')).toBe('#main');
	});

	it('carries the wordmark, the main nav, the reserved firm slot and the theme switch', () => {
		const { container } = render(DeskBar, { props: { path: '/tenders' } });
		const header = screen.getByRole('banner');
		expect(within(header).getByRole('link', { name: 'Pagefifty' }).getAttribute('href')).toBe('/');
		expect(navLinks().map((link) => link.current)).toEqual(['page', null]);
		expect(within(header).getByRole('group', { name: 'Theme' })).toBeTruthy();
		const slot = container.querySelector('[data-firm-slot]');
		expect(slot).toBeTruthy();
		expect(slot?.textContent?.trim()).toBe('');
	});

	it('has no hamburger: every nav link is in the page, none behind a toggle', () => {
		render(DeskBar, { props: { path: '/' } });
		expect(screen.queryByRole('button', { name: /menu/i })).toBeNull();
		expect(screen.queryAllByRole('button', { expanded: false })).toHaveLength(0);
	});
});
