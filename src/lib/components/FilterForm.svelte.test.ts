import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { parseFilters, type FilterState } from '$lib/core/filters';
import type { IndexRow } from '$lib/snapshot/index-row';
import { buildTenderList, type TenderListData } from '$lib/tenders/list';
import FilterForm from './FilterForm.svelte';
import TenderListPage from './TenderListPage.svelte';

const NO_FILTER: FilterState = { countries: [], cpv: [] };
const NOW = new Date('2026-09-28T12:00:00Z');
const CAPTURE = {
	capturedOn: '15 Sep 2026',
	fetchedAt: '2026-09-15T19:50:49.157Z',
	firstPublished: '1 Sep 2026'
};

function rowDue(noticeNumber: string, tender: string): IndexRow {
	return {
		noticeNumber,
		title: { text: `Tender ${noticeNumber}`, lang: 'de' },
		buyers: [{ name: { text: 'Stadt Halle', lang: 'de' }, country: 'DEU' }],
		country: ['DEU'],
		cpvCodes: ['72000000'],
		lots: [
			{
				id: 'LOT-0001',
				deadlines: { tender },
				coverage: { criteriaCount: 1, sources: ['epo-notice'], pointsToDocuments: false }
			}
		]
	};
}

const OPEN_ROW = rowDue('700001-2026', '2026-11-02T10:00:00+01:00');
const CLOSED_ROW = rowDue('700002-2026', '2026-09-20T10:00:00+02:00');

function pageData(rows: IndexRow[], filters = NO_FILTER, dropped = false): TenderListData {
	return { list: buildTenderList({ rows }, filters, NOW), filters, dropped, capture: CAPTURE };
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

describe('FilterForm', () => {
	it('is a plain GET search form posting to the list it filters', () => {
		const { container } = render(FilterForm, { props: { state: NO_FILTER, basePath: '/tenders' } });
		const form = screen.getByRole('search', { name: 'Filter tenders' });
		expect(form.tagName).toBe('FORM');
		expect(form.getAttribute('method')).toBe('get');
		expect(form.getAttribute('action')).toBe('/tenders');
		const names = [...container.querySelectorAll('input')].map((input) => input.name);
		expect([...new Set(names)]).toEqual(['country', 'cpv', 'from', 'to']);
		expect(screen.getByRole('button', { name: 'Apply filters' }).getAttribute('type')).toBe(
			'submit'
		);
	});

	it('offers each country and type of work as a checkbox chip with its code', () => {
		render(FilterForm, { props: { state: NO_FILTER, basePath: '/tenders' } });
		const country = screen.getByRole('group', { name: 'Country' });
		const work = screen.getByRole('group', { name: 'Type of work' });
		const values = (group: HTMLElement) =>
			within(group)
				.getAllByRole('checkbox')
				.map((box) => [(box as HTMLInputElement).value, squash(box.closest('label')?.textContent)]);
		expect(values(country)).toEqual([
			['NL', 'Netherlands NL'],
			['BE', 'Belgium BE'],
			['DE', 'Germany DE']
		]);
		expect(values(work)).toEqual([
			['72', 'IT services 72'],
			['48', 'Software packages 48']
		]);
	});

	it('labels both date fields and ties both to the one Central European Time hint', () => {
		render(FilterForm, { props: { state: NO_FILTER, basePath: '/tenders' } });
		const from = screen.getByLabelText('Deadline on or after') as HTMLInputElement;
		const to = screen.getByLabelText('Deadline on or before') as HTMLInputElement;
		expect([from.type, from.name, to.type, to.name]).toEqual(['date', 'from', 'date', 'to']);
		const hint = screen.getByText('Whole days in Central European Time.');
		expect(from.getAttribute('aria-describedby')).toBe(hint.id);
		expect(to.getAttribute('aria-describedby')).toBe(hint.id);
	});

	it('with no filter leaves every chip unchecked, both dates empty and no Clear filters link', () => {
		const { container } = render(FilterForm, {
			props: { state: NO_FILTER, basePath: '/tenders' }
		});
		const boxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
		expect(boxes).toHaveLength(5);
		expect(boxes.some((box) => box.checked)).toBe(false);
		const dates = [...container.querySelectorAll<HTMLInputElement>('input[type="date"]')];
		expect(dates.map((input) => input.value)).toEqual(['', '']);
		expect(screen.queryByRole('link', { name: 'Clear filters' })).toBeNull();
	});

	it('checks the chips and fills the dates the address holds, and offers Clear filters', () => {
		const state: FilterState = { countries: ['NL'], cpv: ['72'], from: '2026-10-01' };
		const { container } = render(FilterForm, { props: { state, basePath: '/example' } });
		const checked = [...container.querySelectorAll<HTMLInputElement>('input:checked')].map(
			(box) => box.value
		);
		expect(checked).toEqual(['NL', '72']);
		expect((screen.getByLabelText('Deadline on or after') as HTMLInputElement).value).toBe(
			'2026-10-01'
		);
		expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe(
			'/example'
		);
	});

	// A plain GET form sends a blank date field as "from=" and "to=", which is no bound, not junk.
	it('submits blank dates as no bound, so the address it makes drops nothing', () => {
		const { container } = render(FilterForm, { props: { state: NO_FILTER, basePath: '/tenders' } });
		const form = container.querySelector('form') as HTMLFormElement;
		(form.querySelector('input[value="DE"]') as HTMLInputElement).checked = true;
		const query = new URLSearchParams(new FormData(form) as unknown as Record<string, string>);
		expect(query.toString()).toBe('country=DE&from=&to=');
		expect(parseFilters(query)).toEqual({
			state: { countries: ['DE'], cpv: [] },
			dropped: false
		});
	});
});

describe('TenderListPage states', () => {
	it('puts the filter form under the index head, posting to the page it sits on', () => {
		const { container } = render(TenderListPage, {
			props: { data: pageData([OPEN_ROW]), basePath: '/tenders' }
		});
		const form = screen.getByRole('search', { name: 'Filter tenders' });
		const head = container.querySelector('.index-head') as HTMLElement;
		expect(head.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(form.getAttribute('action')).toBe('/tenders');
	});

	it('says when values in the address were dropped and still lists the rows', () => {
		const { container } = render(TenderListPage, {
			props: { data: pageData([OPEN_ROW], NO_FILTER, true), basePath: '/tenders' }
		});
		expect(screen.getByRole('status').textContent?.trim()).toBe(
			'Some filter values in the address were not recognised and were ignored.'
		);
		expect(container.querySelectorAll('tr[data-notice]')).toHaveLength(1);
	});

	it('shows no dropped-values line when nothing was dropped', () => {
		render(TenderListPage, { props: { data: pageData([OPEN_ROW]), basePath: '/tenders' } });
		expect(screen.queryByText(/not recognised/)).toBeNull();
	});

	it('replaces the closed group with a note when nothing has closed', () => {
		const { container } = render(TenderListPage, {
			props: { data: pageData([OPEN_ROW]), basePath: '/tenders' }
		});
		expect(container.querySelector('details')).toBeNull();
		const closed = container.querySelector('#closed') as HTMLElement;
		expect(
			within(closed).getByText('No tender in this list has closed since the capture.')
		).toBeTruthy();
	});

	// The time is cut from the formatted deadline text, so a change to that format must fail here.
	it('writes the capture day and time on the example run, in the server zone', () => {
		const { container } = render(TenderListPage, {
			props: { data: pageData([OPEN_ROW]), variant: 'example', basePath: '/example' }
		});
		expect(squash(container.querySelector('.capture .mono')?.textContent)).toBe(
			'Captured from TED on 15 Sep 2026 at 21:50 CEST'
		);
	});

	// On the example "now" is the capture instant, so nothing can have closed since it.
	it('words the no-closed note by the variant on the example run', () => {
		const { container } = render(TenderListPage, {
			props: { data: pageData([OPEN_ROW]), variant: 'example', basePath: '/example' }
		});
		const closed = container.querySelector('#closed') as HTMLElement;
		expect(squash(closed.querySelector('.note')?.textContent)).toBe(
			'No tender in this list had closed at the capture time.'
		);
		expect(closed.textContent).not.toContain('since the capture');
	});

	it('names the closed group by the variant, with its count in Mono', () => {
		const { container } = render(TenderListPage, {
			props: { data: pageData([OPEN_ROW, CLOSED_ROW]), variant: 'example', basePath: '/example' }
		});
		const summary = container.querySelector('details summary');
		expect(squash(summary?.textContent)).toBe('Closed at the capture time (1)');
		expect(summary?.querySelector('.mono')?.textContent).toBe('1');
	});

	it('says no tender is still open instead of an empty open table', () => {
		const { container } = render(TenderListPage, {
			props: { data: pageData([CLOSED_ROW]), basePath: '/tenders' }
		});
		const open = container.querySelector('#open') as HTMLElement;
		expect(
			within(open).getByText('No tender in this list is still open. The closed ones are below.')
		).toBeTruthy();
		expect(open.querySelector('table')).toBeNull();
		expect(container.querySelectorAll('#closed tr[data-notice]')).toHaveLength(1);
	});

	it('shows the named empty state with the filters in words when nothing matches', () => {
		const filters: FilterState = { countries: ['BE'], cpv: ['48'], from: '2027-01-01' };
		const { container } = render(TenderListPage, {
			props: { data: pageData([OPEN_ROW, CLOSED_ROW], filters), basePath: '/tenders' }
		});
		expect(
			screen.getByRole('heading', { level: 2, name: 'No tenders match these filters' })
		).toBeTruthy();
		expect(
			screen.getByText(
				'Nothing in the 15 Sep 2026 snapshot matches Belgium, software packages, deadline on or after 1 Jan 2027. Widen the deadline range or pick another country.'
			)
		).toBeTruthy();
		const clear = screen.getAllByRole('link', { name: 'Clear filters' });
		expect(clear.map((link) => link.getAttribute('href'))).toEqual(['/tenders', '/tenders']);
		expect(container.querySelector('table')).toBeNull();
		expect(container.querySelector('#closed')).toBeNull();
	});

	it('says which date is after which when the range is inverted', () => {
		const filters: FilterState = { countries: [], cpv: [], from: '2026-11-01', to: '2026-10-01' };
		render(TenderListPage, {
			props: { data: pageData([OPEN_ROW], filters), basePath: '/tenders' }
		});
		expect(
			screen.getByText(
				'The deadline range ends before it starts: 1 Nov 2026 is after 1 Oct 2026. Swap the two dates.'
			)
		).toBeTruthy();
	});
});
