import type { AfterNavigate } from '@sveltejs/kit';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FilterState } from '$lib/core/filters';
import type { IndexRow } from '$lib/snapshot/index-row';
import { buildTenderList } from '$lib/tenders/list';
import TenderSplit from './TenderSplit.svelte';

// The router is not running here, so the callback the split hands it is kept and called by hand.
const router = vi.hoisted(() => ({
	afterNavigate: undefined as ((to: AfterNavigate) => void) | undefined
}));
vi.mock('$app/navigation', () => ({
	afterNavigate: (callback: (to: AfterNavigate) => void) => {
		router.afterNavigate = callback;
	}
}));

const NO_FILTER: FilterState = { countries: [], cpv: [] };
const NOTICE = '700001-2026';
const ROW: IndexRow = {
	noticeNumber: NOTICE,
	title: { text: `Tender ${NOTICE}`, lang: 'de' },
	buyers: [{ name: { text: 'Stadt Halle', lang: 'de' }, country: 'DEU' }],
	country: ['DEU'],
	cpvCodes: ['72000000'],
	lots: [
		{
			id: 'LOT-0001',
			deadlines: { tender: '2026-11-02T10:00:00+01:00' },
			coverage: { criteriaCount: 1, sources: ['epo-notice'], pointsToDocuments: false }
		}
	]
};
const RECORD = createRawSnippet(() => ({
	render: () => '<article><h1 tabindex="-1">Tender</h1></article>'
}));

function renderSplit() {
	const { container } = render(TenderSplit, {
		props: {
			data: {
				list: buildTenderList({ rows: [ROW] }, NO_FILTER, new Date('2026-09-28T12:00:00Z')),
				filters: NO_FILTER,
				dropped: false,
				capture: { capturedOn: '15 Sep 2026', fetchedAt: '2026-09-15T19:50:49.157Z' }
			},
			basePath: '/tenders',
			opened: NOTICE,
			onRecord: true,
			children: RECORD
		}
	});
	const pane = container.querySelector('.pane') as HTMLElement;
	const listColumn = container.querySelector('.list-col') as HTMLElement;
	const row = container.querySelector('a.t') as HTMLAnchorElement;
	pane.scrollTop = 240;
	row.focus();
	return { pane, listColumn, row, heading: pane.querySelector('h1') as HTMLElement };
}

// jsdom lays nothing out, so the list column and the open row get the boxes a 1440x900 screen
// draws: the column starts under a 224px head and is a screen tall, and the row sits offset px down
// the list's content, wherever the column is scrolled to.
function layOut(listColumn: HTMLElement, row: HTMLElement, offset: number) {
	vi.stubGlobal('innerHeight', 900);
	Object.defineProperty(listColumn, 'clientHeight', { configurable: true, value: 900 });
	listColumn.getBoundingClientRect = () => ({ top: 224, height: 900 }) as DOMRect;
	row.getBoundingClientRect = () =>
		({ top: 224 + offset - listColumn.scrollTop, height: 130 }) as DOMRect;
}

function onScreen(phone: boolean) {
	vi.stubGlobal(
		'matchMedia',
		vi.fn((query: string) => ({ matches: phone && query === '(max-width: 45em)' }))
	);
	const scrolled = vi.fn();
	vi.stubGlobal('scrollTo', scrolled);
	return scrolled;
}

const arrive = (type: AfterNavigate['type'], notice?: string) =>
	router.afterNavigate?.({
		type,
		to: { params: notice === undefined ? {} : { notice } }
	} as unknown as AfterNavigate);

afterEach(() => {
	vi.unstubAllGlobals();
	router.afterNavigate = undefined;
});

describe('TenderSplit after a navigation', () => {
	it('shows a newly opened tender from its start on a wide screen, leaving the list and the focus', () => {
		const scrolled = onScreen(false);
		const { pane, row } = renderSplit();
		arrive('link', NOTICE);
		expect(pane.scrollTop).toBe(0);
		expect(scrolled).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(row);
	});

	it('takes a phone to the top and moves focus to the tender it now shows in place of the list', () => {
		const scrolled = onScreen(true);
		const { heading } = renderSplit();
		arrive('link', NOTICE);
		expect(scrolled.mock.calls).toEqual([[0, 0]]);
		expect(document.activeElement).toBe(heading);
	});

	it('leaves a phone where it is when the address names no tender, as the bare list does', () => {
		const scrolled = onScreen(true);
		const { row } = renderSplit();
		arrive('form');
		expect(scrolled).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(row);
	});

	// scrollIntoView would move the page as well as the list, so it is recorded to show it is never
	// called, and put back after.
	function recordReveals() {
		const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
		const reveal = vi.fn();
		Object.defineProperty(Element.prototype, 'scrollIntoView', {
			value: reveal,
			configurable: true,
			writable: true
		});
		const restore = () =>
			original === undefined
				? Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
				: Object.defineProperty(Element.prototype, 'scrollIntoView', original);
		return { reveal, restore };
	}

	it('scrolls only the list to show the open row on a first load that names it', () => {
		const scrolled = onScreen(false);
		const { reveal, restore } = recordReveals();
		try {
			const { pane, listColumn, row } = renderSplit();
			const item = row.closest('li') as HTMLElement;
			layOut(listColumn, item, 3000);
			arrive('enter', NOTICE);
			// The row now leads the part of the column on screen; the page and the pane stay put.
			expect([listColumn.scrollTop, item.getBoundingClientRect().top]).toEqual([3000, 224]);
			expect(reveal).not.toHaveBeenCalled();
			expect(row.getAttribute('aria-current')).toBe('page');
			expect([pane.scrollTop, scrolled.mock.calls.length]).toEqual([240, 0]);
			expect(document.activeElement).toBe(row);
		} finally {
			restore();
		}
	});

	it('keeps the list where it is on a click, a step back, a phone, or a row already in view', () => {
		const { reveal, restore } = recordReveals();
		try {
			const listAfter = (type: AfterNavigate['type'], phone: boolean, offset: number) => {
				onScreen(phone);
				const { listColumn, row } = renderSplit();
				listColumn.scrollTop = 120;
				layOut(listColumn, row.closest('li') as HTMLElement, offset);
				arrive(type, NOTICE);
				return listColumn.scrollTop;
			};
			expect([
				listAfter('link', false, 3000),
				listAfter('popstate', false, 3000),
				listAfter('enter', true, 3000),
				listAfter('enter', false, 300)
			]).toEqual([120, 120, 120, 120]);
			// The same row out of view on a wide first load does move the list.
			expect(listAfter('enter', false, 3000)).toBe(3000);
			expect(reveal).not.toHaveBeenCalled();
		} finally {
			restore();
		}
	});

	it.each(['enter', 'popstate'] as const)(
		'keeps the place the browser gives a %s navigation',
		(type) => {
			for (const phone of [false, true]) {
				const scrolled = onScreen(phone);
				const { pane, row } = renderSplit();
				arrive(type, NOTICE);
				expect([pane.scrollTop, scrolled.mock.calls.length]).toEqual([240, 0]);
				expect(document.activeElement).toBe(row);
			}
		}
	);
});
