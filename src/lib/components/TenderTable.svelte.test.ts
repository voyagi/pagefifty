import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import type { FilterState } from '$lib/core/filters';
import { readNotice } from '$lib/ingest/read-notice';
import { toIndexRow, type IndexRow } from '$lib/snapshot/index-row';
import { buildTenderList, CANCEL_INTENT_LINE } from '$lib/tenders/list';
import TenderTable from './TenderTable.svelte';

const NOW = new Date('2026-09-15T19:50:49Z');
const NO_FILTER: FilterState = { countries: [], cpv: [] };
const MARKED = '600017-2026';
const UNMARKED = '609955-2026';

function indexRowOf(role: RoleName): IndexRow {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[0].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	return toIndexRow(result.record);
}

// The same reader, index row and list model every served notice goes through: 600017-2026 as the
// synthetic cancel-intent notice beside the one-lot notice 609955-2026, which carries no mark.
function renderTable() {
	const list = buildTenderList(
		{ rows: [indexRowOf('cancel-intent-notice'), indexRowOf('one-lot')] },
		NO_FILTER,
		NOW
	);
	return render(TenderTable, {
		props: { rows: [...list.open, ...list.closed], caption: 'Tenders', basePath: '/tenders' }
	});
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function marksIn(container: HTMLElement, notice: string): Element[] {
	const row = container.querySelector(`li[data-notice="${notice}"]`);
	if (row === null) throw new Error(`no row for ${notice}`);
	return [...row.querySelectorAll('[data-cancel-intent]')];
}

describe('TenderTable and a buyer that intends to cancel', () => {
	it('words the cancel-intent sentence as a plain fact', () => {
		expect(CANCEL_INTENT_LINE).toBe(
			'The buyer has announced that it intends to cancel this procedure.'
		);
	});

	it('states the sentence once in a marked row', () => {
		const { container } = renderTable();
		const marks = marksIn(container, MARKED);
		expect(marks.map((mark) => squash(mark.textContent))).toEqual([CANCEL_INTENT_LINE]);
	});

	it('shows no cancel-intent sentence on a row without the mark', () => {
		const { container } = renderTable();
		expect(marksIn(container, UNMARKED)).toEqual([]);
		expect(container.querySelectorAll('[data-cancel-intent]')).toHaveLength(1);
	});

	it('keeps the sentence visible: no aria-hidden and no visually-hidden class on it or above it', () => {
		const { container } = renderTable();
		const [mark] = marksIn(container, MARKED);
		expect(mark).toBeDefined();
		const hidden: string[] = [];
		for (let node: Element | null = mark; node !== null; node = node.parentElement) {
			if (node.hasAttribute('aria-hidden')) hidden.push(`${node.tagName} aria-hidden`);
			if (node.classList.contains('visually-hidden'))
				hidden.push(`${node.tagName} visually-hidden`);
		}
		expect(hidden).toEqual([]);
	});
});

// A separator drawn before a fact can start a wrapped line, so the reading status, the fact most
// likely to wrap, is its own line and never one of the separated facts.
describe('TenderTable row facts', () => {
	it('sets the reading status on a line of its own, outside the separated facts', () => {
		const { container } = renderTable();
		const rows = [...container.querySelectorAll('li[data-notice]')];
		expect(rows.length).toBe(2);
		for (const row of rows) {
			const status = row.querySelector('p.status');
			expect(squash(status?.textContent)).not.toBe('');
			expect(status?.closest('.meta')).toBeNull();
			expect(row.querySelector('.meta .facts .fact .tag, .meta .facts .fact .reading')).toBeNull();
			expect(row.querySelectorAll('.meta .facts > .fact').length).toBeGreaterThan(1);
		}
	});
});
