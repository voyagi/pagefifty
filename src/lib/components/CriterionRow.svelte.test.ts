import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '$lib/ingest/read-notice';
import type { NoticeRecord } from '$lib/ingest/record';
import { buildTenderPage, type CriterionView } from '$lib/tenders/tender-page';
import CriterionRow from './CriterionRow.svelte';

const NOW = new Date('2026-09-20T10:00:00Z');
// Word's Symbol-font bullets as published, written as code points so no invisible character sits
// in this file.
const SYMBOL_BULLETS = [0xf0a7, 0xf0d8].map((point) => String.fromCodePoint(point));
const BULLET = String.fromCodePoint(0x2022);

function recordOf(role: RoleName, which = 0): NoticeRecord {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	return result.record;
}

function renderRow(criterion: CriterionView) {
	return render(CriterionRow, { props: { criterion } });
}

const countOf = (text: string, part: string) => text.split(part).length - 1;

describe('CriterionRow', () => {
	it('heads a criterion with its EU code-list label, then its code and place in Mono', () => {
		const [criterion] = buildTenderPage(recordOf('one-lot'), NOW).lots[0].criteria;
		const { container } = renderRow(criterion);
		expect(screen.getByRole('heading', { level: 3 }).textContent?.trim()).toBe(
			'Other economic or financial requirements'
		);
		const mono = [...container.querySelectorAll('.mono')].map((each) => each.textContent?.trim());
		expect(mono).toEqual(['slc-stand-other', 'Criterion 1 of 6']);
	});

	it('shows a code the EU code list does not hold in Mono, and says it has no label', () => {
		const { container } = renderRow({
			code: 'slc-not-in-the-list',
			position: 2,
			of: 3,
			descriptions: [{ text: 'Nachweis', lang: 'de', language: 'German' }]
		});
		const heading = screen.getByRole('heading', { level: 3 });
		expect(heading.querySelector('.mono')?.textContent).toBe('slc-not-in-the-list');
		expect(screen.getByText('No English label in the EU code list for this code.')).toBeTruthy();
		expect(container.textContent).toContain('Criterion 2 of 3');
	});

	it('renders one quote per published language, French then Dutch, each with its lang', () => {
		const [criterion] = buildTenderPage(recordOf('multilingual-criterion'), NOW).lots[0].criteria;
		const { container } = renderRow(criterion);
		const quotes = [...container.querySelectorAll('blockquote')];
		expect(quotes.map((quote) => quote.getAttribute('lang'))).toEqual(['fr', 'nl']);
		expect(quotes.every((quote) => quote.hasAttribute('data-notice-text'))).toBe(true);
		const labels = [...container.querySelectorAll('.quote-block')].map((block) =>
			block.firstElementChild?.textContent?.trim()
		);
		expect(labels).toEqual(['French', 'Dutch']);
	});

	it('draws the Symbol-font bullets of 600779-2026 as a bullet the page fonts hold, leaving the record as published', () => {
		const record = recordOf('same-code-in-two-lots');
		const criterion = buildTenderPage(record, NOW)
			.lots.flatMap((lot) => lot.criteria)
			.find((each) => SYMBOL_BULLETS.some((mark) => each.descriptions[0].text.includes(mark)));
		if (criterion === undefined) throw new Error('600779-2026 holds no Symbol-font bullet');
		const published = criterion.descriptions[0].text;
		const marks = SYMBOL_BULLETS.reduce((total, mark) => total + countOf(published, mark), 0);
		const { container } = renderRow(criterion);
		const shown = container.querySelector('blockquote')?.textContent ?? '';
		expect(SYMBOL_BULLETS.map((mark) => countOf(shown, mark))).toEqual([0, 0]);
		expect(countOf(shown, BULLET) - countOf(published, BULLET)).toBe(marks);
		expect(marks).toBeGreaterThan(0);
		expect(criterion.descriptions[0].text).toBe(published);
	});

	it('keeps the line breaks of the published text', () => {
		const [criterion] = buildTenderPage(recordOf('one-lot'), NOW).lots[0].criteria;
		const { container } = renderRow(criterion);
		const shown = container.querySelector('blockquote')?.textContent ?? '';
		expect(shown).toBe(criterion.descriptions[0].text.trim());
		expect(shown).toContain('\n');
	});
});
