import { render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ACTIVE_FIRM_KEY,
	PROFILE_KEY,
	getProfileStore,
	resetProfileStore
} from '$lib/profile/store.svelte';
import DeskBar from './DeskBar.svelte';

// The export date in the slot is the visitor's local date; the zone is pinned so the expectation
// holds on CI in UTC as it does here (00:30 on 21 Sep in Amsterdam is 20 Sep in UTC).
process.env.TZ = 'Europe/Amsterdam';

function saved(lastExportedAt: string | null) {
	return JSON.stringify({
		schemaVersion: 1,
		savedAt: '2026-09-20T10:00:00.000Z',
		lastExportedAt,
		profile: {
			registration: {},
			authorisations: [],
			securityClearances: [],
			turnover: [],
			staff: { total: 19, byRole: [], yearlyAverages: [] },
			insurance: [],
			certificates: [],
			references: [],
			countries: [],
			languages: []
		}
	});
}

beforeEach(() => {
	localStorage.clear();
	resetProfileStore();
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function slotOf(container: HTMLElement) {
	return container.querySelector('[data-firm-slot]') as HTMLElement;
}

// The slot reads its store after a lazy import in onMount: this waits for that import and the
// render after it, so a check that the slot stayed empty is made after it had its chance to fill.
async function settled() {
	await vi.dynamicImportSettled();
	await tick();
}

async function filledSlot(container: HTMLElement) {
	const header = screen.getByRole('banner');
	const link = await within(header).findByRole('link', { name: /firm|Brink Data/ });
	expect(link).toBe(slotOf(container));
	expect(link.getAttribute('href')).toBe('/profile');
	return {
		first: squash(link.querySelector('strong')?.textContent),
		second: squash(link.querySelector('.second')?.textContent)
	};
}

describe('the header firm slot', () => {
	it('names the own firm with no profile yet', async () => {
		const { container } = render(DeskBar, { props: { path: '/tenders' } });
		expect(await filledSlot(container)).toEqual({ first: 'Your firm', second: 'No profile yet' });
	});

	it('says a saved profile was never exported', async () => {
		localStorage.setItem(PROFILE_KEY, saved(null));
		const { container } = render(DeskBar, { props: { path: '/' } });
		expect(await filledSlot(container)).toEqual({
			first: 'Your firm',
			second: 'Last exported: never'
		});
	});

	it('gives the local day of the last export', async () => {
		localStorage.setItem(PROFILE_KEY, saved('2026-09-20T22:30:00.000Z'));
		const { container } = render(DeskBar, { props: { path: '/' } });
		expect(await filledSlot(container)).toEqual({
			first: 'Your firm',
			second: 'Last exported: 21 Sep 2026'
		});
	});

	it('labels the demo firm while it is active', async () => {
		localStorage.setItem(PROFILE_KEY, saved(null));
		localStorage.setItem(ACTIVE_FIRM_KEY, 'demo');
		const { container } = render(DeskBar, { props: { path: '/tenders' } });
		expect(await filledSlot(container)).toEqual({
			first: 'Brink Data (demo firm)',
			second: 'Invented figures'
		});
	});

	it('always labels the demo firm on an example page, leaving the active firm alone', async () => {
		localStorage.setItem(PROFILE_KEY, saved(null));
		const { container } = render(DeskBar, { props: { path: '/example/600457-2026' } });
		expect(await filledSlot(container)).toEqual({
			first: 'Brink Data (demo firm)',
			second: 'Invented figures'
		});
		expect(localStorage.getItem(ACTIVE_FIRM_KEY)).toBeNull();
	});

	it('does not take a path that only starts with the letters of example as the example', async () => {
		const { container } = render(DeskBar, { props: { path: '/examples' } });
		expect(await filledSlot(container)).toEqual({ first: 'Your firm', second: 'No profile yet' });
	});

	it('follows another tab switching to the demo firm', async () => {
		const { container } = render(DeskBar, { props: { path: '/' } });
		await filledSlot(container);
		localStorage.setItem(ACTIVE_FIRM_KEY, 'demo');
		window.dispatchEvent(new StorageEvent('storage', { key: ACTIVE_FIRM_KEY }));
		await vi.waitFor(() =>
			expect(squash(slotOf(container).querySelector('strong')?.textContent)).toBe(
				'Brink Data (demo firm)'
			)
		);
	});

	// One store per page: the store the profile page switches is the one the header reads, so the
	// header follows at once, with no storage event (those reach other tabs only).
	it('relabels at once when the page switches to the demo firm through the shared store', async () => {
		const { container } = render(DeskBar, { props: { path: '/profile' } });
		await filledSlot(container);
		getProfileStore().store.useDemo();
		await vi.waitFor(() =>
			expect(squash(slotOf(container).querySelector('strong')?.textContent)).toBe(
				'Brink Data (demo firm)'
			)
		);
	});

	it('fills within one settle of its lazy import when storage works', async () => {
		const { container } = render(DeskBar, { props: { path: '/tenders' } });
		await settled();
		expect(slotOf(container).tagName).toBe('A');
	});

	it('stays empty, and no link, when the browser blocks storage', async () => {
		vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		const { container } = render(DeskBar, { props: { path: '/tenders' } });
		// The same wait the test above shows is long enough for the slot to fill.
		await settled();
		const slot = slotOf(container);
		expect(slot.tagName).toBe('DIV');
		expect(slot.textContent?.trim()).toBe('');
		expect(
			within(screen.getByRole('banner'))
				.getAllByRole('link')
				.map((l) => l.textContent?.trim())
		).toEqual(['Skip to content', 'Pagefifty', 'Tenders', 'Firm profile', 'Example run']);
	});
});
