import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import type { FilterState } from '$lib/core/filters';
import { captureDay, SnapshotIndexSchema, type IndexRow } from '$lib/snapshot/index-row';
import {
	buildTenderList,
	captureFacts,
	commonReading,
	type TenderListData
} from '$lib/tenders/list';
import { CAPTURE_ID } from '../../test/fixtures/roles';
import ListRouteHarness from '../../test/ListRouteHarness.svelte';
import Layout from './+layout.svelte';

const NO_FILTER: FilterState = { countries: [], cpv: [] };
// A fixed "now" after some capture deadlines have passed, so both groups hold rows.
const NOW = new Date('2026-09-28T12:00:00Z');

const index = SnapshotIndexSchema.parse(
	JSON.parse(
		readFileSync(join('src', 'lib', 'snapshot', 'generated', CAPTURE_ID, 'index.json'), 'utf8')
	)
);

function dataFor(rows: IndexRow[], now = NOW, filters = NO_FILTER): TenderListData {
	return {
		list: buildTenderList({ rows }, filters, now),
		filters,
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

// Two lists that open no tender beside them: a filter no capture notice meets, and one notice
// whose only deadline had passed by NOW.
const NOTHING_MATCHES = dataFor(index.rows, NOW, {
	countries: ['BE'],
	cpv: [],
	from: '2099-01-01'
});
const ALL_CLOSED = dataFor([rowDue('609955-2026', '2026-09-01T10:30:00+02:00')]);

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

// The tender the route renders in the pane, standing in for the record so these tests read the
// list around it.
const RECORD = createRawSnippet(() => ({
	render: () => '<article data-record><h1 tabindex="-1">Tender</h1></article>'
}));

// The list layout as the route renders it: on the bare list (no notice in the address), opening
// the tender the layout chose, if any; or on a tender's own address. With no tender chosen the
// route's page reads no record, so the real page renders there, as the layout draws it.
function renderPage(
	data: TenderListData,
	{ notice, defaultNotice = null }: { notice?: string; defaultNotice?: string | null } = {}
) {
	if (notice === undefined && defaultNotice === null) {
		return render(ListRouteHarness, {
			props: { variant: 'tenders', data: { ...data, defaultNotice, now: NOW } }
		});
	}
	return render(Layout, {
		props: {
			data: { ...data, defaultNotice, now: NOW },
			params: notice === undefined ? {} : { notice },
			children: RECORD
		}
	});
}

describe('tenders list page', () => {
	it('names the page and the capture day', () => {
		const { container } = renderPage(dataFor(index.rows));
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Open IT tenders');
		const captureLine = container.querySelector('.capture .mono');
		expect(squash(captureLine?.textContent)).toBe('Snapshot captured from TED on 15 Sep 2026');
	});

	// The live accessibility audit reads a list's layout and group from these, and expects the list
	// alone on a wide screen once every tender has closed (expectedListLayout in scripts/harness.mjs).
	it('draws no pane and only closed rows on a list whose every tender has closed', () => {
		const { container } = renderPage(ALL_CLOSED);
		expect(container.querySelector('.pane')).toBeNull();
		expect(container.querySelector('#open ul.rows')).toBeNull();
		expect(container.querySelectorAll('#closed ul.rows li[data-notice]')).toHaveLength(1);
	});

	// The route's page holds the <title>, so a list that opens no tender beside it, with no pane to
	// put the page in, still renders the page: here the layout draws it, as SvelteKit does.
	it.each([
		['tenders', 'a filter that matches nothing', NOTHING_MATCHES],
		['tenders', 'a list whose every tender has closed', ALL_CLOSED],
		['example', 'a filter that matches nothing', NOTHING_MATCHES],
		['example', 'a list whose every tender has closed', ALL_CLOSED]
	] as const)('names the %s page on %s', (variant, _list, data) => {
		expect(data.list.open).toEqual([]);
		// An earlier test's page leaves its title in the document after it unmounts, so the title read
		// below is this render's own only when it starts empty.
		document.title = '';
		render(ListRouteHarness, {
			props: { variant, data: { ...data, defaultNotice: null, now: NOW } }
		});
		expect(document.title).toBe(
			variant === 'example'
				? `Example run, ${data.capture.capturedOn} snapshot - Pagefifty`
				: 'Open IT tenders in NL, BE and DE - Pagefifty'
		);
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
		expect(container.querySelector('[data-notice] b')).toBeNull();
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
			...container.querySelectorAll(`li[data-notice="${notice}"] .by > .b`)
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

	it('is the skip link target in the main frame', () => {
		const { container } = renderPage(dataFor(index.rows));
		const main = document.getElementById('main');
		expect(main?.tagName).toBe('MAIN');
		expect(container.querySelector('main')?.classList.contains('page')).toBe(true);
	});

	it('lists every capture notice once across the open and closed groups', () => {
		const { container } = renderPage(dataFor(index.rows));
		const rows = [...container.querySelectorAll('li[data-notice]')];
		expect(rows).toHaveLength(index.rows.length);
		expect(new Set(rows.map((row) => row.getAttribute('data-notice'))).size).toBe(
			index.rows.length
		);
	});

	it('orders the open list by its deadlines and keeps closed notices out of it', () => {
		const { container } = renderPage(dataFor(index.rows));
		const [open, closed] = [...container.querySelectorAll('ul.rows')];
		expect(open.getAttribute('aria-label')).toBe('Open tenders, soonest deadline first');
		const instants = [...open.querySelectorAll('li time')].map((time) =>
			Date.parse(time.getAttribute('datetime') ?? '')
		);
		expect(instants.length).toBeGreaterThan(100);
		expect(instants.every((at) => at > NOW.getTime())).toBe(true);
		expect(instants.every((at, i) => i === 0 || at >= instants[i - 1])).toBe(true);
		// The closed list runs by the same one rule, so its label names the order as the open one does.
		expect(closed.getAttribute('aria-label')).toBe('Closed tenders, earliest deadline first');
		const closedTimes = [...closed.querySelectorAll('li time')];
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

	it('marks each closed row "Closed" before its date and counts the group in its summary', () => {
		const { container } = renderPage(dataFor(index.rows));
		const details = container.querySelector('details');
		const closedRows = details?.querySelectorAll('li[data-notice]') ?? [];
		for (const row of closedRows) {
			expect(row.querySelector('.deadline')?.textContent?.trim().startsWith('Closed')).toBe(true);
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

	it('shows the reading status with its kind, and a missing value in words', () => {
		const { container } = renderPage(dataFor(index.rows));
		const row = container.querySelector('li[data-notice="609955-2026"]');
		expect(row).not.toBeNull();
		const cells = within(row as HTMLElement);
		expect(cells.getByText('Criteria in the documents').className).toContain('facedown');
		expect(cells.getByText('EUR 834,550.06').className).toContain('mono');
		const unvalued = container.querySelector('li[data-notice="615890-2026"]') as HTMLElement;
		expect(within(unvalued).getByText('Value not published')).toBeTruthy();
	});

	// The reading most rows share is the column's background, so it is written as plain text and the
	// tag is kept for the rows that differ from it.
	it('tags only the readings that differ from the one most rows share, and glosses the readings once', () => {
		const data = dataFor(index.rows);
		const { container } = renderPage(data);
		const open = container.querySelector('#open ul.rows') as HTMLElement;
		const common = commonReading(data.list.open);
		expect(common).toBeDefined();
		const shapes = data.list.open.map((row) => {
			const item = open.querySelector(`li[data-notice="${row.noticeNumber}"]`) as HTMLElement;
			const tag = item.querySelector('.tag');
			const plain = item.querySelector('.reading');
			return [
				row.reading.tag === common,
				squash((tag ?? plain)?.textContent) === row.reading.text,
				tag !== null
			];
		});
		expect(shapes.every(([shared, named, tagged]) => named && tagged === !shared)).toBe(true);
		expect(shapes.some(([, , tagged]) => tagged)).toBe(true);
		expect(shapes.some(([, , tagged]) => !tagged)).toBe(true);
		expect(squash(container.querySelector('.index-head .gloss')?.textContent)).toBe(
			'Reading status: what Pagefifty read in each notice.'
		);
	});

	it.each([
		[0, 'notices'],
		[1, 'notice'],
		[3, 'notices']
	])('writes a count of %i in Mono in the head, with the noun "%s"', (n, noun) => {
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
	});

	it('renders no verdict word anywhere on the page', () => {
		const { container } = renderPage(dataFor(index.rows));
		const text = container.textContent ?? '';
		for (const word of [/\bGO\b/, /\bNO-GO\b/, /PARTNER NEEDED/i, /\bAsk first\b/i, /\bNo-go\b/i]) {
			expect(text).not.toMatch(word);
		}
	});
});

describe('the tender beside the list', () => {
	const FILTERED: FilterState = { countries: ['DE'], cpv: [] };
	const rows = [
		rowDue('700001-2026', '2026-11-02T10:00:00+01:00'),
		rowDue('700002-2026', '2026-11-03T10:00:00+01:00')
	];
	const linkOf = (container: HTMLElement, notice: string) =>
		container.querySelector(`li[data-notice="${notice}"] a.t`) as HTMLAnchorElement;

	// A row opens its tender beside the list: the list keeps its place and the focus stays on the
	// row, and the filters the list applied stay applied.
	it('links each row to its tender with the applied filters, keeping the scroll and the focus', () => {
		const { container } = renderPage(dataFor(rows, NOW, FILTERED));
		const link = linkOf(container, '700001-2026');
		expect(link.getAttribute('href')).toBe('/tenders/700001-2026?country=DE');
		expect([
			link.hasAttribute('data-sveltekit-noscroll'),
			link.hasAttribute('data-sveltekit-keepfocus')
		]).toEqual([true, true]);
		expect(linkOf(renderPage(dataFor(rows)).container, '700002-2026').getAttribute('href')).toBe(
			'/tenders/700002-2026'
		);
	});

	it('marks the row whose tender the address names as the current page, and no other', () => {
		const { container } = renderPage(dataFor(rows), { notice: '700002-2026' });
		expect(linkOf(container, '700002-2026').getAttribute('aria-current')).toBe('page');
		expect(linkOf(container, '700001-2026').hasAttribute('aria-current')).toBe(false);
		expect(
			[...container.querySelectorAll('li.opened')].map((row) => row.getAttribute('data-notice'))
		).toEqual(['700002-2026']);
		expect(container.querySelector('[data-record]')).not.toBeNull();
	});

	// On the bare list the tender is the one the list opened by itself, not the page the address names.
	it('marks the tender the bare list opened as current within the list', () => {
		const { container } = renderPage(dataFor(rows), { defaultNotice: '700001-2026' });
		expect(linkOf(container, '700001-2026').getAttribute('aria-current')).toBe('true');
		expect(linkOf(container, '700002-2026').hasAttribute('aria-current')).toBe(false);
		expect(container.querySelector('[data-record]')).not.toBeNull();
		expect(screen.queryByRole('link', { name: 'Back to the list' })).toBeNull();
	});

	// A closed tender's address opens the closed group, so its row shows beside it; an open tender
	// leaves the group folded.
	it('opens the closed group when the tender the address names has closed', () => {
		const data = dataFor(index.rows);
		const [closed] = data.list.closed;
		const [open] = data.list.open;
		const shown = renderPage(data, { notice: closed.noticeNumber });
		expect(shown.container.querySelector('details')?.open).toBe(true);
		shown.unmount();
		const folded = renderPage(data, { notice: open.noticeNumber });
		expect(folded.container.querySelector('details')?.open).toBe(false);
	});

	it('shows the list alone when no tender is open', () => {
		const { container } = renderPage(dataFor(rows));
		expect(container.querySelector('[data-record]')).toBeNull();
		expect(container.querySelector('.pane')).toBeNull();
		expect(container.querySelector('li.opened')).toBeNull();
	});

	// A phone shows the tender alone, so its way back must land on the same filtered list.
	it("offers a way back to the list on a tender's own address, with the filters kept", () => {
		renderPage(dataFor(rows, NOW, FILTERED), { notice: '700001-2026' });
		expect(screen.getByRole('link', { name: 'Back to the list' }).getAttribute('href')).toBe(
			'/tenders?country=DE'
		);
	});

	// The links rebuild the query from the filters the list applied, so a value it ignored is dropped.
	it('carries only the filters the list applied into its links', () => {
		const filters: FilterState = { countries: ['NL', 'DE'], cpv: ['72'], from: '2026-10-01' };
		const { container } = renderPage(dataFor(rows, NOW, filters), { notice: '700001-2026' });
		expect(linkOf(container, '700001-2026').getAttribute('href')).toBe(
			'/tenders/700001-2026?country=NL&country=DE&cpv=72&from=2026-10-01'
		);
		expect(screen.getByRole('link', { name: 'Back to the list' }).getAttribute('href')).toBe(
			'/tenders?country=NL&country=DE&cpv=72&from=2026-10-01'
		);
	});
});
