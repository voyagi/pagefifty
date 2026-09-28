import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { captureDay, SnapshotIndexSchema } from '$lib/snapshot/index-row';
import { CAPTURE_ID } from '../../test/fixtures/roles';
import Page from './+page.svelte';

const data = {
	capturedOn: '15 Sep 2026',
	total: 2,
	rows: [
		{
			noticeNumber: '609955-2026',
			title: { text: 'Gebäudeautomation <b>Los 4</b>', lang: 'de', rawLang: 'DEU' },
			buyers: [{ name: { text: 'Burgenlandkreis', lang: 'de', rawLang: 'DEU' }, country: 'DEU' }],
			country: ['DEU'],
			cpvCodes: ['45315700', '48921000'],
			lots: []
		},
		{
			noticeNumber: '600367-2026',
			title: { text: 'Aanbesteding', lang: 'nl', rawLang: 'NLD' },
			buyers: [],
			country: [],
			cpvCodes: [],
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

	// The capture holds only notices published from the query's first day to the capture day, so the
	// caveat names both; a new capture must fail here rather than leave the page naming old days.
	it('names the first publication day and the capture day the built index records', () => {
		const index = SnapshotIndexSchema.parse(
			JSON.parse(
				readFileSync(join('src', 'lib', 'snapshot', 'generated', CAPTURE_ID, 'index.json'), 'utf8')
			)
		);
		const from = /publication-date>=(\d{4})(\d{2})(\d{2})/.exec(index.capture.query);
		if (!from)
			throw new Error(`the capture query names no first publication day: ${index.capture.query}`);
		const capturedOn = captureDay(index.capture.fetchedAt);
		const { container } = render(Page, { props: { data: { ...data, capturedOn } } });
		expect(container.querySelector('.caveat')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			`A snapshot, not live: tenders published before ${captureDay(`${from[1]}-${from[2]}-${from[3]}T12:00:00Z`)} or after ${capturedOn} are missing.`
		);
	});

	it('is the skip link target', () => {
		render(Page, { props: { data } });
		expect(document.getElementById('main')?.tagName).toBe('MAIN');
	});
});
