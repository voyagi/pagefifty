import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '$lib/ingest/read-notice';
import type { NoticeRecord } from '$lib/ingest/record';
import { buildTenderPage } from '$lib/tenders/tender-page';
import type { LotVerdictView } from '$lib/tenders/verdict-view';
import ExampleCard from './ExampleCard.svelte';

const NOW = new Date('2026-09-20T10:00:00Z');

function recordOf(role: RoleName, which = 0): NoticeRecord {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	return result.record;
}

// The card reads only these fields of the verdict; the verdict logic has its own tests.
function viewOf(deciding: number, decidingQuotes: number[]): LotVerdictView {
	return {
		decision: { verdict: 'GO' },
		label: 'Go',
		mark: 'met',
		gloss: 'Meets every published criterion that was read.',
		next: 'Read the documents.',
		reason: 'Every criterion read was met.',
		link: null,
		criteria: [],
		shortfalls: [],
		article63: null,
		deciding,
		decidingQuotes,
		decidedBy: 'Decided by code.'
	};
}

describe('ExampleCard', () => {
	// The criterion is published in French and Dutch; its first reading is Dutch and does not
	// decide, so the clause shown must be the French one the deciding reading was found in.
	it('shows the clause in the language of the first quote the verdict rests on', () => {
		const tender = buildTenderPage(recordOf('multilingual-criterion'), NOW);
		const [lot] = tender.lots;
		const [criterion] = lot.criteria;
		const french = criterion.descriptions[0].text.trim();
		const quote = french.slice(0, 40).trim();
		const decided = {
			...lot,
			criteria: [
				{
					...criterion,
					requirements: [
						{
							quote: 'Een lijst van de belangrijkste leveringen',
							lang: 'nl',
							reading: 'Dutch.',
							model: 'm'
						},
						{ quote, lang: 'fr', reading: 'The French reading.', model: 'm' }
					]
				},
				...lot.criteria.slice(1)
			]
		};
		const { container } = render(ExampleCard, {
			props: { tender, lot: decided, view: viewOf(criterion.position, [1]) }
		});
		const excerpt = container.querySelector('.excerpt blockquote');
		expect(excerpt?.getAttribute('lang')).toBe('fr');
		expect(excerpt?.querySelector('mark.decides')).not.toBeNull();
		expect(container.querySelector('.reading [data-ai-generated]')?.textContent).toBe(
			'The French reading.'
		);
	});

	// Code verified this quote against the clause's two descriptions joined and finds it in neither
	// alone (display-text.test.ts), so the card cuts it at their edge: the excerpt, the sentence its
	// first piece sits in, marks that piece beside its reading, and the whole clause holds both
	// descriptions, each piece marked.
	it('shows a deciding quote that runs across two descriptions, cut at their edge', () => {
		const tender = buildTenderPage(recordOf('multilingual-criterion'), NOW);
		const [lot] = tender.lots;
		const [criterion] = lot.criteria;
		const across = 'mindestens 1.000.000 EUR netto Umsatz in each of the last two';
		const decided = {
			...lot,
			criteria: [
				{
					...criterion,
					descriptions: [
						{
							text: 'Referenzzeitraum drei Jahre. Jährlich mindestens 1.000.000 EUR netto Umsatz',
							lang: 'de',
							language: 'German'
						},
						{ text: 'in each of the last two financial years.', lang: 'en', language: 'English' }
					],
					requirements: [{ quote: across, lang: 'de', reading: 'The turnover floor.', model: 'm' }]
				},
				...lot.criteria.slice(1)
			]
		};
		const { container } = render(ExampleCard, {
			props: { tender, lot: decided, view: viewOf(criterion.position, [0]) }
		});
		const marked = (root: Element | null) => root?.querySelector('mark.decides')?.textContent;
		const excerpt = container.querySelector('.excerpt blockquote');
		expect(excerpt?.textContent).toBe('Jährlich mindestens 1.000.000 EUR netto Umsatz');
		expect(marked(excerpt)).toBe('mindestens 1.000.000 EUR netto Umsatz');
		expect(container.querySelector('.reading [data-ai-generated]')?.textContent).toBe(
			'The turnover floor.'
		);
		const whole = [...container.querySelectorAll('details.whole blockquote')];
		expect(whole.map(marked)).toEqual([
			'mindestens 1.000.000 EUR netto Umsatz',
			'in each of the last two'
		]);
	});
});
