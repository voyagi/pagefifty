import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const data = {
	capturedOn: '15 Sep 2026',
	total: 2,
	rows: [
		{
			noticeNumber: '609955-2026',
			title: { text: 'Gebäudeautomation <b>Los 4</b>', lang: 'de', rawLang: 'DEU' },
			buyers: [{ name: { text: 'Burgenlandkreis', lang: 'de', rawLang: 'DEU' }, country: 'DEU' }],
			lots: []
		},
		{
			noticeNumber: '600367-2026',
			title: { text: 'Aanbesteding', lang: 'nl', rawLang: 'NLD' },
			buyers: [],
			lots: []
		}
	]
};

describe('tenders list', () => {
	it('names the page and the capture day', () => {
		render(Page, { props: { data } });
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Open IT tenders');
		expect(screen.getByText('Snapshot captured from TED on 15 Sep 2026')).toBeTruthy();
		expect(document.title).toBe('Open IT tenders in NL, BE and DE - Pagefifty');
	});

	it('renders one row per notice with the title and buyer in their own language', () => {
		const { container } = render(Page, { props: { data } });
		const rows = container.querySelectorAll('tr[data-notice]');
		expect([...rows].map((row) => row.getAttribute('data-notice'))).toEqual([
			'609955-2026',
			'600367-2026'
		]);
		const first = rows[0].querySelectorAll('[lang]');
		expect([...first].map((node) => node.getAttribute('lang'))).toEqual(['de', 'de']);
		expect(screen.getByRole('table').querySelector('caption')?.textContent).toBe(
			'Open tenders, soonest deadline first'
		);
	});

	it('shows notice text as text, never as markup', () => {
		const { container } = render(Page, { props: { data } });
		expect(container.querySelector('tr b')).toBeNull();
		expect(screen.getByText('Gebäudeautomation <b>Los 4</b>')).toBeTruthy();
	});
});
