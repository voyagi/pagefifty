import { cleanup, render } from '@testing-library/svelte';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criterionLabel } from '$lib/codelists/labels';
import type { ReadLotDecision } from '$lib/core/compare';
import { decideLot } from '$lib/core/verdict';
import type { Criterion, NoticeRecord } from '$lib/ingest/record';
import { ACTIVE_FIRM_KEY, PROFILE_KEY, resetProfileStore } from '$lib/profile/store.svelte';
import { emptyProfile, ProfileSchema, type Profile } from '$lib/profile/schema';
import { CaptureLineSchema, NoticeRecordSchema } from '$lib/snapshot/index-row';
import { NoticeReadingsSchema, type NoticeReadings, type ReplyItem } from '$lib/snapshot/readings';
import { CANCEL_INTENT_LINE, captureFacts } from '$lib/tenders/list';
import { buildTenderPage, type TenderPageData } from '$lib/tenders/tender-page';
import {
	ARTICLE_63_LINE,
	REASON_LINES,
	STATE_LABELS,
	comparedLine,
	verdictView
} from '$lib/tenders/verdict-view';
import LotVerdict from './LotVerdict.svelte';
import TenderPage from './TenderPage.svelte';

// The example capture as the records build wrote it: globalSetup ran scripts/build-records.mjs.
const BUILT = join('src', 'lib', 'snapshot', 'generated', '2026-09-15');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function storedReadings(notice: string): NoticeReadings | undefined {
	const path = join(BUILT, 'readings', `${notice}.json`);
	return existsSync(path) ? NoticeReadingsSchema.parse(readJson(path)) : undefined;
}

const builtRecord = (notice: string): NoticeRecord =>
	NoticeRecordSchema.parse(readJson(join(BUILT, 'records', `${notice}.json`)));

function pageOf(record: NoticeRecord, readings: NoticeReadings | undefined): TenderPageData {
	const line = CaptureLineSchema.parse(readJson(join(BUILT, 'capture.json')));
	return {
		tender: buildTenderPage(record, new Date(line.fetchedAt), readings),
		capture: captureFacts(line),
		readingRun: null
	};
}

const examplePage = (notice: string) => pageOf(builtRecord(notice), storedReadings(notice));

const textOf = (element: Element | null | undefined) =>
	element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function verdictOf(container: Element, anchor: string): Element | null {
	return container.querySelector(`#${anchor} [data-verdict]`);
}

// A reason line is a whole sentence; the check fails on a missing or empty one before the page is
// searched for it.
function line(key: keyof typeof REASON_LINES): string {
	const sentence = REASON_LINES[key];
	expect(sentence).toMatch(/^[A-Z].{20,}\.$/);
	return sentence;
}

const BANNED = [
	'a partner is enough',
	'partner is sufficient',
	'partner suffices',
	'you should',
	'we recommend',
	'you will qualify',
	'you will be invited',
	'guarantee',
	'apply now'
];

const TURNOVER = (floor: string) =>
	`Mindestjahresumsatz von mindestens ${floor} Euro netto pro Jahr in den letzten drei Geschäftsjahren.`;
const TURNOVER_QUOTE = (floor: string) =>
	`mindestens ${floor} Euro netto pro Jahr in den letzten drei Geschäftsjahren`;

const criterion = (code: string, text: string): Criterion => ({
	code,
	descriptions: [{ lang: 'de', text }],
	parameters: [],
	pointsToDocuments: false
});

const item = (
	criterionAt: number,
	kind: ReplyItem['kind'],
	quote: string,
	numberText = ''
): ReplyItem => ({
	criterion: criterionAt,
	kind,
	quote,
	reading: 'A plain reading of the clause.',
	numberText,
	period: numberText === '' ? '' : 'pro Jahr',
	mandatory: true
});

const turnoverCriterion = (floor: string) => criterion('slc-stand-to-gen', TURNOVER(floor));
const turnoverItem = (at: number, floor: string) =>
	item(at, 'turnover-general', TURNOVER_QUOTE(floor), `${floor} Euro`);

interface SyntheticLot {
	criteria: Criterion[];
	items?: ReplyItem[];
	sources?: string[];
	deadlines?: NoticeRecord['lots'][number]['deadlines'];
}

// 610242-2026 with its lots replaced: each lot with items is listed as read under its own text
// hash, each without as having no criteria. The facts the verdict reads (the legal basis
// 2014/24/EU, the deadline, reserved "none") stay the German notice's own.
function syntheticPage(lots: SyntheticLot[], patch: Partial<NoticeRecord> = {}): TenderPageData {
	const record = builtRecord('610242-2026');
	const stored = storedReadings('610242-2026');
	if (stored === undefined) throw new Error('no generated readings for 610242-2026');
	const [base] = record.lots;
	const hash = (index: number) => String(index + 1).repeat(64);
	return pageOf(
		{
			...record,
			...patch,
			lots: lots.map((each, index) => ({
				...base,
				id: `LOT-000${index}`,
				criteria: each.criteria,
				criteriaSources: each.sources ?? ['epo-notice'],
				deadlines: each.deadlines ?? base.deadlines
			}))
		},
		{
			notice: record.noticeNumber,
			lots: lots.map((each, index) =>
				each.items === undefined
					? { lot: `LOT-000${index}`, status: 'no-criteria' as const }
					: { lot: `LOT-000${index}`, status: 'read' as const, textSha256: hash(index) }
			),
			readings: lots.flatMap((each, index) =>
				each.items === undefined
					? []
					: [{ ...stored.readings[0], textSha256: hash(index), items: each.items }]
			)
		}
	);
}

const renderExample = (data: TenderPageData) =>
	render(TenderPage, { props: { data, variant: 'example' } }).container;

const storedProfile = (profile: Profile) =>
	JSON.stringify({
		schemaVersion: 1,
		savedAt: '2026-10-01T10:00:00.000Z',
		lastExportedAt: null,
		profile: ProfileSchema.parse(profile)
	});

// /tenders reads the firm from this browser's storage after mount, as the header does.
async function renderTenders(data: TenderPageData, stored: string | null) {
	resetProfileStore();
	localStorage.clear();
	if (stored !== null) localStorage.setItem(PROFILE_KEY, stored);
	localStorage.setItem(ACTIVE_FIRM_KEY, 'own');
	const { container } = render(TenderPage, { props: { data, variant: 'tenders' } });
	await vi.waitFor(() => expect(verdictOf(container, 'lot-1')).not.toBeNull(), { interval: 1 });
	return container;
}

const wordOf = (region: Element | null) => textOf(region?.querySelector('[data-verdict-word]'));

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	localStorage.clear();
	resetProfileStore();
});

describe('the lot verdict on the tender page', () => {
	it('the German example lot reads ASK FIRST for the demo firm with its reason', () => {
		const { container } = render(TenderPage, {
			props: { data: examplePage('610242-2026'), variant: 'example' }
		});
		const region = verdictOf(container, 'lot-1');
		expect(region).not.toBeNull();
		expect(textOf(region?.querySelector('[data-verdict-word]'))).toBe('Ask first');
		expect(textOf(region)).toContain(
			'Only the firm can judge whether its references, staff or line of business fit what the buyer names.'
		);
		expect(textOf(region)).toContain('Compared with the demo firm, Brink Data B.V.');
	});
});

describe('every verdict and reason, worded', () => {
	it('a GO lot says it covers only the selection criteria read', () => {
		const container = renderExample(
			syntheticPage([
				{ criteria: [turnoverCriterion('500.000')], items: [turnoverItem(1, '500.000')] }
			])
		);
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Go');
		expect(line('GO')).toContain('covers only the selection criteria read');
		expect(textOf(region)).toContain(line('GO'));
		expect(region?.querySelector('.slip')).toBeNull();
	});

	it('a PARTNER NEEDED lot shows the Article 63 line and no partner brief', () => {
		const container = renderExample(
			syntheticPage([
				{ criteria: [turnoverCriterion('2.000.000')], items: [turnoverItem(1, '2.000.000')] }
			])
		);
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Not met alone');
		expect(textOf(region)).toContain(line('PARTNER NEEDED'));
		const slip = region?.querySelector('.slip');
		expect(textOf(slip)).toContain(criterionLabel('slc-stand-to-gen'));
		expect(textOf(slip)).toContain('EUR 2,000,000.00');
		expect(textOf(slip)).toContain('Criterion 1 of 1');
		expect(ARTICLE_63_LINE).toContain('Article 63');
		expect(textOf(region)).toContain(ARTICLE_63_LINE);
		const page = textOf(container);
		expect(page).not.toContain('Why a partner can close it');
		expect(page).not.toMatch(/partner brief|partner conditions|commitment to provide/i);
	});

	it('a NO-GO lot names its criterion on the slip and gives no advice', () => {
		const data = examplePage('610242-2026');
		const [lot] = data.tender.lots;
		const decided: ReadLotDecision = {
			decision: decideLot({
				states: ['MET', 'SHORT_FIXED'],
				facts: [],
				noticeIsOnlySource: true,
				pointsToDocuments: false
			}),
			criteria: lot.criteria.map((each) =>
				each.position === 3
					? {
							state: 'SHORT_FIXED',
							notCompared: false,
							requirements: [{ state: 'SHORT_FIXED', notCompared: false, why: 'short' }]
						}
					: {
							state: 'MET',
							notCompared: false,
							requirements: [{ state: 'MET', notCompared: false, why: 'met' }]
						}
			),
			reservation: null
		};
		const view = verdictView(decided, lot);
		const { container } = render(LotVerdict, { props: { view, compared: 'Compared here.' } });
		const region = container.querySelector('[data-verdict]');
		expect(wordOf(region)).toBe('No-go');
		expect(textOf(region)).toContain(line('NO-GO'));
		expect(textOf(region?.querySelector('.slip'))).toContain(criterionLabel('slc-stand-to-spec'));
		expect(textOf(region)).not.toContain(ARTICLE_63_LINE);
		for (const phrase of BANNED) expect(textOf(region).toLowerCase()).not.toContain(phrase);
	});

	it('a certificate not held as named reads ASK FIRST with the route not settled', () => {
		const text = 'Zertifizierung nach ISO/IEC 27001:2022 für den Rechenzentrumsbetrieb.';
		const container = renderExample(
			syntheticPage([
				{
					criteria: [criterion('slc-sche-qu-cert-indep', text)],
					items: [item(1, 'certificate', 'Zertifizierung nach ISO/IEC 27001:2022')]
				}
			])
		);
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Ask first');
		expect(textOf(region)).toContain(line('route-unsettled/not-held'));
		expect(region?.querySelector('.slip')).toBeNull();
	});

	it('a certificate held as named reads ASK FIRST and leaves its scope to the firm', () => {
		const text = 'Zertifizierung nach ISO 27001 für den Rechenzentrumsbetrieb.';
		const container = renderExample(
			syntheticPage([
				{
					criteria: [criterion('slc-sche-qu-cert-indep', text)],
					items: [item(1, 'certificate', 'Zertifizierung nach ISO 27001')]
				}
			])
		);
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Ask first');
		expect(textOf(region)).toContain(line('profile-field-missing/certificate-scope'));
	});

	it('an empty profile field reads ASK FIRST naming the empty figure', async () => {
		const container = await renderTenders(
			syntheticPage([
				{ criteria: [turnoverCriterion('2.000.000')], items: [turnoverItem(1, '2.000.000')] }
			]),
			storedProfile(emptyProfile())
		);
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Ask first');
		expect(textOf(region)).toContain(line('profile-field-missing/empty-field'));
		expect(textOf(region)).toContain(comparedLine({ kind: 'own' }));
	});

	it('fewer completed years than demanded reads ASK FIRST naming the years', async () => {
		const profile: Profile = {
			...emptyProfile(),
			completedFinancialYears: 1,
			turnover: [2023, 2024, 2025].map((year) => ({ year, generalNet: 3000000, specific: [] }))
		};
		const container = await renderTenders(
			syntheticPage([
				{ criteria: [turnoverCriterion('2.000.000')], items: [turnoverItem(1, '2.000.000')] }
			]),
			storedProfile(profile)
		);
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Ask first');
		expect(textOf(region)).toContain(line('profile-field-missing/fewer-years'));
	});

	it('no stored profile reads ASK FIRST with a link to the profile page', async () => {
		const container = await renderTenders(examplePage('610242-2026'), null);
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Ask first');
		expect(textOf(region)).toContain(line('profile-field-missing/no-profile'));
		expect(textOf(region)).toContain(comparedLine({ kind: 'none' }));
		expect(region?.querySelector('a[href="/profile"]')).not.toBeNull();
		expect(textOf(region)).not.toContain('Brink Data');
	});

	it('a requirement not read reads ASK FIRST not read', () => {
		const container = renderExample(
			syntheticPage([
				{
					criteria: [turnoverCriterion('2.000.000')],
					items: [item(1, 'turnover-general', 'Dieser Satz steht in keiner Klausel.', '1 Euro')]
				}
			])
		);
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Ask first');
		expect(textOf(region)).toContain(line('not-read'));
	});

	it('an insurance clause reads not compared in this version, never a missing profile field', () => {
		const container = renderExample(
			syntheticPage([
				{
					criteria: [
						turnoverCriterion('500.000'),
						criterion('slc-stand-ins', 'Nachweis einer Betriebshaftpflichtversicherung.')
					],
					items: [turnoverItem(1, '500.000')]
				}
			])
		);
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Ask first');
		expect(textOf(region)).toContain(line('not-compared/insurance'));
		expect(textOf(region)).not.toMatch(/profile (field|figure)|empty in the profile/i);
		const rows = container.querySelectorAll('#lot-1 .clause');
		expect(textOf(rows[1]?.querySelector('[data-verdict]'))).toBe(STATE_LABELS['not-compared']);
	});

	// The same floor read as mandatory is the PARTNER NEEDED lot above.
	it('a floor its reading marks optional reads not compared in this version, never short', () => {
		const optional = { ...turnoverItem(1, '2.000.000'), mandatory: false };
		const container = renderExample(
			syntheticPage([{ criteria: [turnoverCriterion('2.000.000')], items: [optional] }])
		);
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Ask first');
		expect(textOf(region)).toContain(line('not-compared/optional'));
		expect(region?.querySelector('.slip')).toBeNull();
		expect(textOf(region)).not.toContain(ARTICLE_63_LINE);
	});

	it.each([
		['Dutch', '604724-2026'],
		['Belgian', '601689-2026']
	])(
		'a %s lot whose criteria are in the procurement documents reads Documents not read yet with the documents link',
		(_country, notice) => {
			const record = builtRecord(notice);
			const container = renderExample(
				pageOf(record, {
					notice,
					lots: record.lots.map((lot) => ({ lot: lot.id, status: 'no-criteria' as const })),
					readings: []
				})
			);
			const region = verdictOf(container, 'lot-1');
			expect(wordOf(region)).toBe('Ask first');
			expect(line('criteria-in-documents/documents')).toMatch(/^Documents not read yet/);
			expect(textOf(region)).toContain(line('criteria-in-documents/documents'));
			const link = region?.querySelector('a[href^="https://"]');
			expect(link?.getAttribute('href')).toBe((record.lots[0].documents ?? record.documents)?.href);
			expect(link?.closest('[data-verdict]')).toBe(region);
		}
	);

	it('a lot naming no criteria source says the notice does not say where its criteria are published', () => {
		const container = renderExample(syntheticPage([{ criteria: [], sources: [] }]));
		const region = verdictOf(container, 'lot-1');
		expect(wordOf(region)).toBe('Ask first');
		expect(line('criteria-in-documents/unnamed')).toContain(
			'the notice does not say where its criteria are published'
		);
		expect(textOf(region)).toContain(line('criteria-in-documents/unnamed'));
	});

	it('every lot of a cancel-intent notice names the buyer intent to cancel', () => {
		const container = renderExample(
			syntheticPage(
				[
					{ criteria: [turnoverCriterion('500.000')], items: [turnoverItem(1, '500.000')] },
					{ criteria: [turnoverCriterion('2.000.000')], items: [turnoverItem(1, '2.000.000')] }
				],
				{ cancelIntent: true }
			)
		);
		for (const anchor of ['lot-1', 'lot-2']) {
			const region = verdictOf(container, anchor);
			expect(wordOf(region)).toBe('Ask first');
			expect(textOf(region)).toContain(CANCEL_INTENT_LINE);
			expect(region?.querySelector('.slip')).toBeNull();
		}
	});

	it('a notice with no criteria in any lot reads No criteria in the notice on each lot', () => {
		const container = renderExample(syntheticPage([{ criteria: [] }, { criteria: [] }]));
		for (const anchor of ['lot-1', 'lot-2']) {
			const region = verdictOf(container, anchor);
			expect(wordOf(region)).toBe('Ask first');
			expect(line('no-criteria-in-notice')).toMatch(/^No criteria in the notice/);
			expect(textOf(region)).toContain(line('no-criteria-in-notice'));
		}
	});
});

describe('where the verdict shows', () => {
	it('each lot of a multi-lot notice shows its own verdict and the page shows none for the notice', () => {
		const container = renderExample(
			syntheticPage([
				{ criteria: [turnoverCriterion('500.000')], items: [turnoverItem(1, '500.000')] },
				{ criteria: [turnoverCriterion('2.000.000')], items: [turnoverItem(1, '2.000.000')] }
			])
		);
		const regions = [...container.querySelectorAll('[data-verdict-word]')];
		expect(regions.map((each) => textOf(each))).toEqual(['Go', 'Not met alone']);
		expect(regions.map((each) => each.closest('section[id^="lot-"]')?.id)).toEqual([
			'lot-1',
			'lot-2'
		]);
		expect(textOf(container.querySelector('#tender [data-verdict]'))).toBe('');
	});

	it('the criterion states are words inside the verdict region', () => {
		const container = renderExample(examplePage('610242-2026'));
		const rows = [...container.querySelectorAll('#lot-1 .clause')];
		expect(rows).toHaveLength(6);
		expect(rows.map((row) => textOf(row.querySelector('[data-verdict]')))).toEqual([
			STATE_LABELS['not-assessed'],
			STATE_LABELS['not-assessed'],
			STATE_LABELS['not-compared'],
			STATE_LABELS['not-compared'],
			STATE_LABELS.PROFILE_GAP,
			STATE_LABELS.PROFILE_GAP
		]);
	});

	it('the coverage list drops its Not compared line on a lot with a verdict and keeps it elsewhere', () => {
		const listed = renderExample(examplePage('610242-2026'));
		expect(textOf(listed.querySelector('#lot-1 .coverage'))).not.toContain('Not compared:');
		cleanup();
		const unlisted = renderExample(examplePage('609955-2026'));
		expect(textOf(unlisted.querySelector('#lot-1 .coverage'))).toContain('Not compared:');
		expect(unlisted.querySelector('[data-verdict]')).toBeNull();
	});

	it('the verdict reads the page instant, never the browser clock', () => {
		// No deadline in the notice, so the years counted end before the year of the instant: the
		// page's 2026 instant counts 2023 to 2025, which the demo firm meets; a 2024 clock would count
		// 2021 and 2022 too, which the firm holds no figure for, and the lot would ask first.
		const data = syntheticPage([
			{
				criteria: [turnoverCriterion('500.000')],
				items: [turnoverItem(1, '500.000')],
				deadlines: {}
			}
		]);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2024-06-01T12:00:00Z'));
		const container = renderExample(data);
		expect(wordOf(verdictOf(container, 'lot-1'))).toBe('Go');
	});

	it('lots render in published order', () => {
		const container = renderExample(
			syntheticPage([
				{ criteria: [] },
				{ criteria: [turnoverCriterion('2.000.000')], items: [turnoverItem(1, '2.000.000')] },
				{ criteria: [turnoverCriterion('500.000')], items: [turnoverItem(1, '500.000')] }
			])
		);
		expect(
			[...container.querySelectorAll('[data-verdict-word]')].map((each) => textOf(each))
		).toEqual(['Ask first', 'Not met alone', 'Go']);
	});

	it('a profile saved in another tab is read on the next page load, never half-read', async () => {
		const data = syntheticPage([
			{ criteria: [turnoverCriterion('2.000.000')], items: [turnoverItem(1, '2.000.000')] }
		]);
		const profile: Profile = {
			...emptyProfile(),
			completedFinancialYears: 5,
			turnover: [2023, 2024, 2025].map((year) => ({ year, generalNet: 3000000, specific: [] }))
		};
		const whole = await renderTenders(data, storedProfile(profile));
		expect(wordOf(verdictOf(whole, 'lot-1'))).toBe('Go');
		expect(textOf(verdictOf(whole, 'lot-1'))).toContain(comparedLine({ kind: 'own' }));
		cleanup();
		const half = storedProfile(profile).slice(0, 60);
		const broken = await renderTenders(data, half);
		expect(wordOf(verdictOf(broken, 'lot-1'))).toBe('Ask first');
		expect(textOf(verdictOf(broken, 'lot-1'))).toContain(line('profile-field-missing/no-profile'));
	});
});
