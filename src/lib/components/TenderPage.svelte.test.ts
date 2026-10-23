import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '$lib/ingest/read-notice';
import type { NoticeRecord } from '$lib/ingest/record';
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

// Each fact row as "term: detail", from the list its panel's facts column holds.
function factsOf(region: HTMLElement): Record<string, string> {
	const rows: Record<string, string> = {};
	for (const term of region.querySelectorAll('dt')) {
		rows[squash(term.textContent)] = squash(term.nextElementSibling?.textContent);
	}
	return rows;
}

describe('TenderPage', () => {
	// The facts row under the title holds the deadline, the time left, the value and the notice; the
	// buyer's country sits beside the buyer, and the kind of work under "About this tender".
	it('lays out 609955-2026: one h1 with its lang, the tender facts, no lot index', () => {
		const { container } = renderPage(recordOf('one-lot'));
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
			'Estimated value': 'EUR 834,550.06'
		});
		expect(squash(container.querySelector('#tender .where')?.textContent)).toBe('Germany');
		expect(factsOf(screen.getByRole('region', { name: 'About this tender' }))).toMatchObject({
			Kind: 'Software packages, CPV 48921000Main CPV 45315700'
		});
		expect(screen.queryByRole('navigation', { name: /Lots in this notice/ })).toBeNull();
	});

	// The notice number in the facts row is the way to the notice on TED.
	it('links the notice number in the facts to the notice on TED', () => {
		renderPage(recordOf('one-lot'));
		const facts = screen.getByRole('complementary', { name: 'Tender facts' });
		const link = within(facts).getByRole('link', { name: '609955-2026' });
		expect([link.getAttribute('href'), link.getAttribute('rel')]).toEqual([
			'https://ted.europa.eu/en/notice/-/detail/609955-2026',
			'external noreferrer'
		]);
	});

	// A joint procurement names its first buyer in the head and every buyer under its facts.
	it('counts the other buyers of a joint procurement in the head and names them all below', () => {
		const record = recordOf('one-lot');
		const second = { ...record.buyers[0], name: { text: 'Stadt Halle', lang: 'de' } };
		const { container } = renderPage({ ...record, buyers: [record.buyers[0], second] });
		expect(squash(container.querySelector('#tender .buyer-line')?.textContent)).toBe(
			`${record.buyers[0].name.text} and 1 other buyer`
		);
		const about = screen.getByRole('region', { name: 'About this tender' });
		expect(
			[...about.querySelectorAll('.buyers li')].map((item) => [
				item.textContent,
				item.getAttribute('lang'),
				item.hasAttribute('data-notice-text')
			])
		).toEqual([
			[record.buyers[0].name.text, record.buyers[0].name.lang, true],
			['Stadt Halle', 'de', true]
		]);
	});

	it('never renders a fact row with an empty value', () => {
		const { container } = renderPage(recordOf('largest'));
		const empty = [...container.querySelectorAll('dd')].filter(
			(each) => squash(each.textContent) === ''
		);
		expect(empty).toEqual([]);
	});

	it('indexes the 17 lots of 600457-2026, each lot showing its own criteria', () => {
		const record = recordOf('largest');
		renderPage(record);
		const index = screen.getByRole('navigation', { name: 'Lots in this notice (17)' });
		const links = within(index).getAllByRole('link');
		expect(links.map((link) => link.getAttribute('href'))).toEqual(
			record.lots.map((_, position) => `#lot-${position + 1}`)
		);
		expect(squash(links[0].textContent)).toBe(`Lot 1: ${record.lots[0].title?.text}`);
		// Each index link lands on the panel of its own lot.
		const targets = links.map((link) =>
			document.getElementById(link.getAttribute('href')?.slice(1) ?? '')
		);
		expect(targets).toEqual(
			record.lots.map((_, position) => screen.getByRole('region', { name: `Lot ${position + 1}` }))
		);
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
		expect(screen.getByRole('region', { name: 'Lot 1' })).toBeTruthy();
	});

	// Months after the capture a bare "Time left: 15 days" would read as days left today.
	it('counts the example time left at the capture time, and says so', () => {
		renderPage(recordOf('one-lot'), BEFORE, 'example');
		const facts = factsOf(screen.getByRole('complementary', { name: 'Tender facts' }));
		expect(facts['Time left at the capture time']).toBe('15 days');
		expect(facts['Time left']).toBeUndefined();
	});

	// The example's footnote is the list's, under the list and the tender together, so the tender
	// adds none of its own (TenderSplit's tests hold that the page shows it once).
	it('leaves the example footnote to the list it opens beside', () => {
		const { container } = renderPage(recordOf('one-lot'), BEFORE, 'example');
		expect(container.querySelector('.demo-note')).toBeNull();
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
