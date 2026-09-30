import { render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetProfileStore } from '$lib/profile/store.svelte';
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
	it('links exactly Tenders, Firm profile and Example run, in that order', () => {
		render(MainNav, { props: { path: '/' } });
		expect(navLinks()).toEqual([
			{ name: 'Tenders', href: '/tenders', current: null },
			{ name: 'Firm profile', href: '/profile', current: null },
			{ name: 'Example run', href: '/example', current: null }
		]);
	});

	it('marks the link of the current route as the page', () => {
		render(MainNav, { props: { path: '/profile' } });
		expect(navLinks().map((link) => link.current)).toEqual([null, 'page', null]);
	});

	it('marks the parent link on a child route', () => {
		render(MainNav, { props: { path: '/tenders/600457-2026' } });
		expect(navLinks().map((link) => link.current)).toEqual(['true', null, null]);
	});

	it('marks the example run as the page on /example and as the parent on its notices', () => {
		render(MainNav, { props: { path: '/example' } });
		expect(navLinks().map((link) => link.current)).toEqual([null, null, 'page']);
		document.body.innerHTML = '';
		render(MainNav, { props: { path: '/example/609955-2026' } });
		expect(navLinks().map((link) => link.current)).toEqual([null, null, 'true']);
	});

	it('marks nothing for a path that only starts with the same letters', () => {
		render(MainNav, { props: { path: '/tendersheet' } });
		expect(navLinks().map((link) => link.current)).toEqual([null, null, null]);
		document.body.innerHTML = '';
		render(MainNav, { props: { path: '/examples' } });
		expect(navLinks().map((link) => link.current)).toEqual([null, null, null]);
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

	// The empty server render of the slot is held in FirmSlot.ssr.test.ts; in the browser it fills.
	it('carries the wordmark, the main nav, the firm slot and the theme switch', async () => {
		localStorage.clear();
		resetProfileStore();
		const { container } = render(DeskBar, { props: { path: '/tenders' } });
		const header = screen.getByRole('banner');
		expect(within(header).getByRole('link', { name: 'Pagefifty' }).getAttribute('href')).toBe('/');
		expect(navLinks().map((link) => link.current)).toEqual(['page', null, null]);
		expect(within(header).getByRole('group', { name: 'Theme' })).toBeTruthy();
		await vi.waitFor(() =>
			expect(container.querySelector('[data-firm-slot]')?.textContent).toContain('Your firm')
		);
	});

	it('has no hamburger: every nav link is in the page, none behind a toggle', () => {
		render(DeskBar, { props: { path: '/' } });
		expect(screen.queryByRole('button', { name: /menu/i })).toBeNull();
		expect(screen.queryAllByRole('button', { expanded: false })).toHaveLength(0);
	});

	// On a phone the bar orders the theme switch by the switch's own root class, so a renamed or
	// wrapped root would drop the switch out of its row with no other check noticing.
	it('holds the theme switch as a direct child with the class its phone order targets', () => {
		const { container } = render(DeskBar, { props: { path: '/tenders' } });
		expect(container.querySelector('header.deskbar > .theme')).toBe(
			screen.getByRole('group', { name: 'Theme' })
		);
	});
});
