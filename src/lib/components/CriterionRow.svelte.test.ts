import { render, screen } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '$lib/ingest/read-notice';
import type { NoticeRecord } from '$lib/ingest/record';
import { CaptureLineSchema, NoticeRecordSchema } from '$lib/snapshot/index-row';
import { NoticeReadingsSchema } from '$lib/snapshot/readings';
import { buildTenderPage, type CriterionView } from '$lib/tenders/tender-page';
import CriterionRow from './CriterionRow.svelte';

const NOW = new Date('2026-09-20T10:00:00Z');
// The 2026-10-22 capture as the records build wrote it: globalSetup ran scripts/build-records.mjs.
const BUILT_1022 = join('src', 'lib', 'snapshot', 'generated', '2026-10-22');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
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

function renderRow(criterion: CriterionView, notice: string) {
	return render(CriterionRow, { props: { criterion, notice } });
}

const countOf = (text: string, part: string) => text.split(part).length - 1;

describe('CriterionRow', () => {
	it('heads a criterion with its EU code-list label, then its code and place in Mono', () => {
		const [criterion] = buildTenderPage(recordOf('one-lot'), NOW).lots[0].criteria;
		const { container } = renderRow(criterion, '609955-2026');
		expect(screen.getByRole('heading', { level: 3 }).textContent?.trim()).toBe(
			'Other economic or financial requirements'
		);
		const mono = [...container.querySelectorAll('.mono')].map((each) => each.textContent?.trim());
		expect(mono).toEqual(['slc-stand-other', 'Criterion 1 of 6']);
		expect(container.querySelector('.parameters')).toBeNull();
	});

	// The source is named in words where the buyer's words begin, not only behind a link.
	it('names the TED notice the clause is quoted from above the quote', () => {
		const record = recordOf('one-lot');
		const [criterion] = buildTenderPage(record, NOW).lots[0].criteria;
		const { container } = renderRow(criterion, record.noticeNumber);
		const source = screen.getByText(`Quoted from TED notice ${record.noticeNumber}`);
		expect(
			source.compareDocumentPosition(container.querySelector('blockquote') as Node) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		expect(source.closest('a')).toBeNull();
	});

	it('lists each published parameter by its EU code-list name, or by its code in Mono', () => {
		const [criterion] = buildTenderPage(recordOf('one-lot'), NOW).lots[0].criteria;
		renderRow(
			{
				...criterion,
				parameters: [
					{ label: 'Weight (points, exact)', value: '70.0' },
					{ code: 'number-weight new-code', value: '3' }
				]
			},
			'609955-2026'
		);
		const list = screen.getByRole('list', { name: 'Parameters as published' });
		const items = [...list.querySelectorAll('li')].map((each) =>
			each.textContent?.replace(/\s+/g, ' ').trim()
		);
		expect(items).toEqual(['Weight (points, exact): 70.0', 'number-weight new-code: 3']);
		expect([...list.querySelectorAll('.mono')].map((each) => each.textContent)).toEqual([
			'70.0',
			'number-weight new-code',
			'3'
		]);
	});

	it('shows a code the EU code list does not hold in Mono, and says it has no label', () => {
		const { container } = renderRow(
			{
				code: 'slc-not-in-the-list',
				position: 2,
				of: 3,
				descriptions: [{ text: 'Nachweis', lang: 'de', language: 'German' }],
				parameters: []
			},
			'609955-2026'
		);
		const heading = screen.getByRole('heading', { level: 3 });
		expect(heading.querySelector('.mono')?.textContent).toBe('slc-not-in-the-list');
		expect(screen.getByText('No English label in the EU code list for this code.')).toBeTruthy();
		expect(container.textContent).toContain('Criterion 2 of 3');
	});

	it('renders one quote per published language, French then Dutch, each with its lang', () => {
		const record = recordOf('multilingual-criterion');
		const [criterion] = buildTenderPage(record, NOW).lots[0].criteria;
		const { container } = renderRow(criterion, record.noticeNumber);
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
		const { container } = renderRow(criterion, record.noticeNumber);
		const shown = container.querySelector('blockquote')?.textContent ?? '';
		expect(SYMBOL_BULLETS.map((mark) => countOf(shown, mark))).toEqual([0, 0]);
		expect(countOf(shown, BULLET) - countOf(published, BULLET)).toBe(marks);
		expect(marks).toBeGreaterThan(0);
		expect(criterion.descriptions[0].text).toBe(published);
	});

	// Code verified this quote against the clause as published, Symbol-font bullet and all, so the
	// clause drawn with a bullet in its place still marks it under its reading's number.
	it('numbers a verified quote holding a Symbol-font bullet in its clause (713597-2026, 2026-10-22)', () => {
		const notice = '713597-2026';
		const record = NoticeRecordSchema.parse(
			readJson(join(BUILT_1022, 'records', `${notice}.json`))
		);
		const readings = NoticeReadingsSchema.parse(
			readJson(join(BUILT_1022, 'readings', `${notice}.json`))
		);
		const { fetchedAt } = CaptureLineSchema.parse(readJson(join(BUILT_1022, 'capture.json')));
		const criterion = buildTenderPage(record, new Date(fetchedAt), readings).lots[0].criteria[1];
		const requirements = criterion.requirements ?? [];
		const bulleted = requirements.findIndex((each) =>
			SYMBOL_BULLETS.some((mark) => each.quote.includes(mark))
		);
		expect(bulleted).toBeGreaterThanOrEqual(0);
		const { container } = renderRow(criterion, notice);
		const numbered = [...container.querySelectorAll('mark[data-n]')].map((mark) =>
			mark.getAttribute('data-n')
		);
		expect(numbered).toContain(`${bulleted + 1}`);
		expect(new Set(numbered)).toEqual(new Set(requirements.map((_each, at) => `${at + 1}`)));
	});

	// Code verifies a quote against the descriptions joined, so one can run from the French
	// description into the Dutch one; each block marks its own piece, the reading's number once.
	it('marks a quote that runs from one description into the next in both blocks', () => {
		const record = recordOf('multilingual-criterion');
		const [criterion] = buildTenderPage(record, NOW).lots[0].criteria;
		const french = criterion.descriptions[0].text.trim();
		const quote = `${french.slice(-24)} Een lijst van de belangrijkste`;
		const { container } = renderRow(
			{
				...criterion,
				requirements: [{ quote, lang: 'fr', reading: 'A list of the main deliveries.', model: 'm' }]
			},
			record.noticeNumber
		);
		const marks = [...container.querySelectorAll('blockquote')].map((block) => [
			...block.querySelectorAll('mark')
		]);
		expect(marks.map((each) => each.length)).toEqual([1, 1]);
		const [[first], [second]] = marks;
		expect(first.getAttribute('data-n')).toBe('1');
		expect(second.hasAttribute('data-n')).toBe(false);
		expect(second.textContent).toBe('Een lijst van de belangrijkste');
		expect(first.textContent?.length).toBeGreaterThan(12);
		expect(french.endsWith(first.textContent ?? '')).toBe(true);
	});

	it('keeps the line breaks of the published text', () => {
		const [criterion] = buildTenderPage(recordOf('one-lot'), NOW).lots[0].criteria;
		const { container } = renderRow(criterion, '609955-2026');
		const shown = container.querySelector('blockquote')?.textContent ?? '';
		expect(shown).toBe(criterion.descriptions[0].text.trim());
		expect(shown).toContain('\n');
	});
});
