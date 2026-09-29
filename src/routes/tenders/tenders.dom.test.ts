import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { FilterState } from '$lib/core/filters';
import { captureDay, SnapshotIndexSchema, type IndexRow } from '$lib/snapshot/index-row';
import { buildTenderList, captureFacts, type TenderListData } from '$lib/tenders/list';
import { CAPTURE_ID } from '../../test/fixtures/roles';
import Page from './+page.svelte';

const NO_FILTER: FilterState = { countries: [], cpv: [] };
// A fixed "now" after some capture deadlines have passed, so both groups hold rows.
const NOW = new Date('2026-09-28T12:00:00Z');

const index = SnapshotIndexSchema.parse(
	JSON.parse(
		readFileSync(join('src', 'lib', 'snapshot', 'generated', CAPTURE_ID, 'index.json'), 'utf8')
	)
);

function dataFor(rows: IndexRow[], now = NOW): TenderListData {
	return {
		list: buildTenderList({ rows }, NO_FILTER, now),
		filters: NO_FILTER,
		dropped: false,
		capture: captureFacts(index.capture)
	};
}

function rowDue(noticeNumber: string, tender: string, title = noticeNumber): IndexRow {
	return {
		noticeNumber,
		title: { text: title, lang: 'de' },
		buyers: [{ name: { text: 'Burgenlandkreis', lang: 'de' }, country: 'DEU' }],
		country: ['DEU'],
		cpvCodes: ['72000000'],
		lots: [
			{
				id: 'LOT-0001',
				deadlines: { tender },
				coverage: { criteriaCount: 2, sources: ['epo-notice'], pointsToDocuments: false }
			}
		]
	};
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const renderPage = (data: TenderListData) => render(Page, { props: { data } });

describe('tenders list page', () => {
	it('names the page and the capture day', () => {
		const { container } = renderPage(dataFor(index.rows));
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Open IT tenders');
		const captureLine = container.querySelector('.capture .mono');
		expect(squash(captureLine?.textContent)).toBe('Snapshot captured from TED on 15 Sep 2026');
		expect(document.title).toBe('Open IT tenders in NL, BE and DE - Pagefifty');
	});

	// The capture holds only notices published from the query's first day to the capture day, so the
	// caveat names both; a new capture must fail here rather than leave the page naming old days.
	it('names the first publication day and the capture day the built index records', () => {
		const from = /publication-date>=(\d{4})(\d{2})(\d{2})/.exec(index.capture.query);
		if (!from)
			throw new Error(`the capture query names no first publication day: ${index.capture.query}`);
		const { container } = renderPage(dataFor(index.rows));
		expect(squash(container.querySelector('.caveat')?.textContent)).toBe(
			`A snapshot, not live: tenders published before ${captureDay(`${from[1]}-${from[2]}-${from[3]}T12:00:00Z`)} or after ${captureDay(index.capture.fetchedAt)} are missing.`
		);
	});

	it('shows notice text as text, never as markup, marked as the notice own words', () => {
		const rows = [
			rowDue('609955-2026', '2026-10-06T10:30:00+02:00', 'Gebäudeautomation <b>Los 4</b>')
		];
		const { container } = renderPage(dataFor(rows));
		expect(container.querySelector('tr b')).toBeNull();
		const title = screen.getByText('Gebäudeautomation <b>Los 4</b>');
		expect(title.hasAttribute('data-notice-text')).toBe(true);
		expect(title.getAttribute('lang')).toBe('de');
		expect(title.getAttribute('href')).toBe('/tenders/609955-2026');
		const buyer = screen.getByText('Burgenlandkreis');
		expect([buyer.hasAttribute('data-notice-text'), buyer.getAttribute('lang')]).toEqual([
			true,
			'de'
		]);
	});

	// The count is the page's own words, so it sits outside the notice text a verdict scan leaves out.
	it('counts the other buyers of a joint procurement beside the first one', () => {
		const { container } = renderPage(dataFor(index.rows));
		const lines = (notice: string) => [
			...container.querySelectorAll(`tr[data-notice="${notice}"] td.tender > .b`)
		];
		const joint = lines('612350-2026');
		expect(joint.map((line) => squash(line.textContent))).toEqual([
			'European Commission, DG BUDG - Budget',
			'and 38 other buyers',
			'612350-2026'
		]);
		expect(joint.map((line) => line.hasAttribute('data-notice-text'))).toEqual([
			true,
			false,
			false
		]);
		expect(lines('629580-2026').map((line) => squash(line.textContent))[1]).toBe(
			'and 1 other buyer'
		);
		expect(lines('609955-2026').map((line) => squash(line.textContent))).toEqual([
			'Burgenlandkreis',
			'609955-2026'
		]);
	});

	it('is the skip link target in a slate binder', () => {
		const { container } = renderPage(dataFor(index.rows));
		const main = document.getElementById('main');
		expect(main?.tagName).toBe('MAIN');
		expect(container.querySelector('main')?.classList.contains('board-slate')).toBe(true);
	});

	it('lists every capture notice once across the open and closed groups', () => {
		const { container } = renderPage(dataFor(index.rows));
		const rows = [...container.querySelectorAll('tr[data-notice]')];
		expect(rows).toHaveLength(index.rows.length);
		expect(new Set(rows.map((row) => row.getAttribute('data-notice'))).size).toBe(
			index.rows.length
		);
	});

	it('orders the open table by its deadlines and keeps closed notices out of it', () => {
		const { container } = renderPage(dataFor(index.rows));
		const [open, closed] = [...container.querySelectorAll('table')];
		expect(open.querySelector('caption')?.textContent).toBe('Open tenders, soonest deadline first');
		const instants = [...open.querySelectorAll('tbody tr time')].map((time) =>
			Date.parse(time.getAttribute('datetime') ?? '')
		);
		expect(instants.length).toBeGreaterThan(100);
		expect(instants.every((at) => at > NOW.getTime())).toBe(true);
		expect(instants.every((at, i) => i === 0 || at >= instants[i - 1])).toBe(true);
		// The closed table runs by the same one rule, so its caption names the order as the open one does.
		expect(closed.querySelector('caption')?.textContent).toBe(
			'Closed tenders, earliest deadline first'
		);
		const closedTimes = [...closed.querySelectorAll('tbody tr time')];
		expect(closedTimes.length).toBeGreaterThan(10);
		const closedInstants = closedTimes.map((time) =>
			Date.parse(time.getAttribute('datetime') ?? '')
		);
		expect(closedInstants.every((at, i) => i === 0 || at >= closedInstants[i - 1])).toBe(true);
		for (const time of closedTimes) {
			expect(Date.parse(time.getAttribute('datetime') ?? '')).toBeLessThanOrEqual(NOW.getTime());
		}
		expect(closed.closest('details')).not.toBeNull();
	});

	it('marks each closed row "Closed" above its date and counts the group in its summary', () => {
		const { container } = renderPage(dataFor(index.rows));
		const details = container.querySelector('details');
		const closedRows = details?.querySelectorAll('tbody tr') ?? [];
		for (const row of closedRows) {
			expect(row.querySelector('td')?.textContent?.trim().startsWith('Closed')).toBe(true);
		}
		expect(squash(details?.querySelector('summary')?.textContent)).toBe(
			`Closed (${closedRows.length})`
		);
	});

	// The capture holds notices whose every lot had closed before it was taken, so the live list may
	// never say its closed notices closed "since the capture".
	it('never says a notice closed since the capture, which already held closed notices', () => {
		const atCapture = buildTenderList(index, NO_FILTER, new Date(index.capture.fetchedAt));
		expect(atCapture.closed.length).toBeGreaterThan(0);
		const { container } = renderPage(dataFor(index.rows));
		expect(container.textContent).not.toContain('since the capture');
	});

	it('shows the reading-status tag with its reason, and a missing value in words', () => {
		const { container } = renderPage(dataFor(index.rows));
		const row = container.querySelector('tr[data-notice="609955-2026"]');
		expect(row).not.toBeNull();
		const cells = within(row as HTMLElement);
		expect(cells.getByText('Criteria in the documents').className).toContain('facedown');
		expect(cells.getByText('EUR 834,550.06').className).toContain('mono');
		const unvalued = container.querySelector('tr[data-notice="615890-2026"]') as HTMLElement;
		expect(within(unvalued).getByText('Value not published')).toBeTruthy();
	});

	it.each([
		[0, 'notices'],
		[1, 'notice'],
		[3, 'notices']
	])('writes a count of %i in Mono in the head and the tabs, with the noun "%s"', (n, noun) => {
		const rows = Array.from({ length: n }, (_, i) =>
			rowDue(`70000${i}-2026`, '2026-11-02T10:00:00+01:00')
		);
		const { container } = renderPage(dataFor(rows));
		const counts = container.querySelector('.counts');
		expect(squash(counts?.textContent)).toBe(`${n} open and 0 closed, of ${n} ${noun}.`);
		expect([...(counts?.querySelectorAll('.mono') ?? [])].map((each) => each.textContent)).toEqual([
			String(n),
			'0',
			String(n)
		]);
		const tabCounts = [...container.querySelectorAll('a.tab .count')].map(
			(each) => each.textContent
		);
		expect(tabCounts).toEqual([String(n), '0']);
	});

	it('renders no verdict word anywhere on the page', () => {
		const { container } = renderPage(dataFor(index.rows));
		const text = container.textContent ?? '';
		for (const word of [/\bGO\b/, /\bNO-GO\b/, /PARTNER NEEDED/i, /\bAsk first\b/i, /\bNo-go\b/i]) {
			expect(text).not.toMatch(word);
		}
	});
});
