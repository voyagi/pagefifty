import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '$lib/ingest/read-notice';
import type { NoticeRecord } from '$lib/ingest/record';
import { DEMO_FIRM_SHORT } from '$lib/profile/demo-firm';
import { CANCEL_INTENT_LINE } from '$lib/tenders/list';
import { buildTenderPage } from '$lib/tenders/tender-page';
import TenderPage from './TenderPage.svelte';

// DeadlineTime draws its label in the visitor's own zone once mounted, and these expectations are
// written in Central European Time, so the file pins that zone rather than taking the machine's
// (CI runs in UTC). Node applies a TZ assignment to the next Intl call; the component reads the
// zone only after mount.
process.env.TZ = 'Europe/Amsterdam';

const BEFORE = new Date('2026-09-20T10:00:00Z');
const AFTER = new Date('2028-01-01T00:00:00Z');
const CAPTURE = {
	capturedOn: '15 Sep 2026',
	fetchedAt: '2026-09-15T19:50:49.157Z',
	firstPublished: '1 Sep 2026'
};

function recordOf(role: RoleName, which = 0): NoticeRecord {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	return result.record;
}

function renderPage(record: NoticeRecord, now = BEFORE, variant?: 'tenders' | 'example') {
	const tender = buildTenderPage(record, now);
	return render(TenderPage, { props: { data: { tender, capture: CAPTURE }, variant } });
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

// Each fact row as "term: detail", from the list its leaf's margin holds.
function factsOf(region: HTMLElement): Record<string, string> {
	const rows: Record<string, string> = {};
	for (const term of region.querySelectorAll('dt')) {
		rows[squash(term.textContent)] = squash(term.nextElementSibling?.textContent);
	}
	return rows;
}

describe('TenderPage', () => {
	it('lays out 609955-2026: one h1 with its lang, the tender facts, no lot index', () => {
		renderPage(recordOf('one-lot'));
		const heading = screen.getByRole('heading', { level: 1 });
		expect([heading.getAttribute('lang'), heading.hasAttribute('data-notice-text')]).toEqual([
			'de',
			true
		]);
		const facts = factsOf(screen.getByRole('complementary', { name: 'Tender facts' }));
		expect(facts).toMatchObject({
			Deadline: '6 Oct 2026, 10:30 CEST',
			'Time left': '15 days',
			'TED notice': '609955-2026',
			Country: 'Germany',
			Kind: 'Software packages, CPV 48921000Main CPV 45315700',
			'Estimated value': 'EUR 834,550.06'
		});
		expect(screen.queryByRole('navigation', { name: /Lots in this notice/ })).toBeNull();
	});

	it('never renders a fact row with an empty value', () => {
		const { container } = renderPage(recordOf('largest'));
		const empty = [...container.querySelectorAll('dd')].filter(
			(each) => squash(each.textContent) === ''
		);
		expect(empty).toEqual([]);
	});

	it('indexes the 17 lots of 600457-2026, each tab counting its own criteria', () => {
		const record = recordOf('largest');
		renderPage(record);
		const index = screen.getByRole('navigation', { name: 'Lots in this notice (17)' });
		const links = within(index).getAllByRole('link');
		expect(links.map((link) => link.getAttribute('href'))).toEqual(
			record.lots.map((_, position) => `#lot-${position + 1}`)
		);
		expect(squash(links[0].textContent)).toBe(`Lot 1: ${record.lots[0].title?.text}`);
		const tabs = record.lots.map((lot, position) =>
			screen.getByRole('link', {
				name: `Lot ${position + 1}, ${lot.criteria.length} ${lot.criteria.length === 1 ? 'criterion' : 'criteria'}`
			})
		);
		expect(tabs).toHaveLength(17);
		const shownCodes = record.lots.map((_, position) =>
			[
				...screen.getByRole('region', { name: `Lot ${position + 1}` }).querySelectorAll('ol > li')
			].map((row) => squash(row.querySelector('.mono')?.textContent))
		);
		expect(shownCodes).toEqual(record.lots.map((lot) => lot.criteria.map((each) => each.code)));
	});

	it('shows a closed notice as closed, with no time left', () => {
		renderPage(recordOf('one-lot'), AFTER);
		const facts = factsOf(screen.getByRole('complementary', { name: 'Tender facts' }));
		expect(facts.Deadline).toBe('Closed 6 Oct 2026, 10:30 CEST');
		expect(facts['Time left']).toBeUndefined();
	});

	it('shows a lot without a deadline period as In notice, and no time left', () => {
		renderPage(recordOf('neither-deadline'));
		const facts = factsOf(screen.getByRole('complementary', { name: 'Tender facts' }));
		expect([facts.Deadline, facts['Time left']]).toEqual(['In notice', undefined]);
		expect(factsOf(screen.getByRole('region', { name: 'Lot 1' })).Deadline).toBe('In notice');
	});

	it('says when the open lots of a notice have different deadlines', () => {
		renderPage(recordOf('lots-differ'));
		const facts = factsOf(screen.getByRole('complementary', { name: 'Tender facts' }));
		expect(facts.Deadline).toMatch(/Lots have different deadlines$/);
		const index = screen.getByRole('navigation', { name: 'Lots in this notice (2)' });
		expect(within(index).getAllByRole('listitem')).toHaveLength(2);
	});

	// lots-differ: lot 1 closes 5 Oct 2026 at 10:00 CEST, lot 2 a day later.
	it('marks the lot whose own deadline has passed as closed, in its leaf and in the lot index', () => {
		renderPage(recordOf('lots-differ'), new Date('2026-10-05T12:00:00Z'));
		const first = factsOf(screen.getByRole('region', { name: 'Lot 1' })).Deadline;
		const second = factsOf(screen.getByRole('region', { name: 'Lot 2' })).Deadline;
		expect([first, second]).toEqual([
			'Closed 5 Oct 2026, 10:00 CEST Tenders',
			'6 Oct 2026, 10:00 CEST Tenders'
		]);
		const index = screen.getByRole('navigation', { name: 'Lots in this notice (2)' });
		const entries = within(index)
			.getAllByRole('listitem')
			.map((item) => squash(item.querySelector('.sub')?.textContent));
		expect(entries).toEqual(['Closed 5 Oct 2026, 10:00 CEST', '6 Oct 2026, 10:00 CEST']);
	});

	it('shows a legal basis it has no name for as published, and a value under the floor as not published', () => {
		renderPage(recordOf('other-legal-basis', 0));
		const lot = factsOf(screen.getByRole('region', { name: 'Lot 1' }));
		expect(lot['Legal basis'].startsWith('32024R2509')).toBe(true);
		renderPage(recordOf('value-under-floor', 0));
		const facts = factsOf(screen.getAllByRole('complementary', { name: 'Tender facts' })[1]);
		expect(facts['Estimated value']).toBe('Value not published');
	});

	it('shows a reservation and a group legal form only where the notice publishes them', () => {
		renderPage(recordOf('reserved-participation'));
		const lot = screen.getByRole('region', { name: 'Lot 1' });
		expect(factsOf(lot)['Reserved participation']).toBe('res-ws');
		expect(within(lot).queryByRole('region', { name: 'Legal form for a group' })).toBeNull();

		const record = recordOf('group-legal-form');
		renderPage(record);
		const form = screen.getAllByRole('region', { name: 'Legal form for a group' })[0];
		const text = record.lots[0].groupLegalForm?.description;
		expect(form.querySelector('[data-notice-text]')?.getAttribute('lang')).toBe(text?.lang);
		expect(
			factsOf(screen.getAllByRole('region', { name: 'Lot 1' })[1])['Reserved participation']
		).toBeUndefined();
	});

	it('says a lot that states no reservation code does not state one, never that it is not reserved', () => {
		const record = recordOf('one-lot');
		const lot = { ...record.lots[0] };
		delete lot.reserved;
		renderPage({ ...record, lots: [lot] });
		const facts = factsOf(screen.getByRole('region', { name: 'Lot 1' }));
		expect(facts['Reserved participation']).toBe('Not stated in the notice');
	});

	it("shows the lot's own note under its label, with its lang", () => {
		const record = recordOf('one-lot');
		renderPage(record);
		const note = screen.getByRole('region', { name: 'Note on this lot' });
		expect(note.querySelector('[data-notice-text]')?.getAttribute('lang')).toBe('de');
		expect(screen.queryByRole('region', { name: 'Note on the procedure' })).toBeNull();
	});

	it('says so when a lot publishes no criteria in the notice', () => {
		renderPage(recordOf('documents-only', 0));
		expect(
			screen.getByText('This lot publishes no selection criteria in the notice.')
		).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Lot 1, 0 criteria' })).toBeTruthy();
	});

	it('labels the first tab Example on the example run', () => {
		renderPage(recordOf('one-lot'), BEFORE, 'example');
		expect(screen.getByRole('link', { name: 'Example' }).getAttribute('href')).toBe('#tender');
	});

	// Months after the capture a bare "Time left: 15 days" would read as days left today.
	it('counts the example time left at the capture time, and says so', () => {
		renderPage(recordOf('one-lot'), BEFORE, 'example');
		const facts = factsOf(screen.getByRole('complementary', { name: 'Tender facts' }));
		expect(facts['Time left at the capture time']).toBe('15 days');
		expect(facts['Time left']).toBeUndefined();
	});

	// CI runs no browser driver, so this is the footnote's only check there.
	it('names the capture day and the demo firm under the example tender page', () => {
		const { container } = renderPage(recordOf('one-lot'), BEFORE, 'example');
		expect(
			[...container.querySelectorAll('.demo-note')].map((note) => squash(note.textContent))
		).toEqual([
			`Example run from a snapshot captured on 15 Sep 2026. ${DEMO_FIRM_SHORT} is a demo firm with invented figures. Not legal advice.`
		]);
	});

	it('shows no demo footnote on a live tender page', () => {
		const { container } = renderPage(recordOf('one-lot'));
		expect(container.querySelector('.demo-note')).toBeNull();
	});

	it('states the cancel-intent sentence after the title and before the unread strip', () => {
		const record = recordOf('cancel-intent-notice');
		expect(buildTenderPage(record, BEFORE).cancelIntent).toBe(true);
		const { container } = renderPage(record);
		const marks = [...container.querySelectorAll('[data-cancel-intent]')];
		expect(marks.map((mark) => [mark.tagName, squash(mark.textContent)])).toEqual([
			['P', CANCEL_INTENT_LINE]
		]);
		const [mark] = marks;
		const title = screen.getByRole('heading', { level: 1 });
		const strip = container.querySelector('.unread-strip');
		expect(title.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(
			strip && mark.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		expect(mark.closest('[aria-hidden], .visually-hidden')).toBeNull();
	});

	it('shows no cancel-intent sentence on 600017-2026, the notice it was derived from', () => {
		const record = recordOf('change-notice', 1);
		expect([record.noticeNumber, buildTenderPage(record, BEFORE).cancelIntent]).toEqual([
			'600017-2026',
			false
		]);
		const { container } = renderPage(record);
		expect(container.querySelector('[data-cancel-intent]')).toBeNull();
	});
});
