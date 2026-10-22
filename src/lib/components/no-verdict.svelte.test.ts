import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/svelte';
import { fc } from '@fast-check/vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FilterState } from '$lib/core/filters';
import { VERDICT_LABELS } from '$lib/core/verdict';
import { readNotice } from '$lib/ingest/read-notice';
import type { NoticeRecord } from '$lib/ingest/record';
import { EU_EEA_COUNTRIES, EU_LANGUAGES } from '$lib/profile/codes';
import { emptyProfile, ProfileSchema, type Profile } from '$lib/profile/schema';
import {
	NoticeRecordSchema,
	SnapshotIndexSchema,
	toIndexRow,
	type IndexRow
} from '$lib/snapshot/index-row';
import { NoticeReadingsSchema, type NoticeReadings } from '$lib/snapshot/readings';
import { buildTenderList, captureFacts, type TenderListData } from '$lib/tenders/list';
import { buildTenderPage, type TenderPageData } from '$lib/tenders/tender-page';
import { readFixture } from '../../test/fixtures/node';
import { SPREAD_FIGURE } from '../../test/home-figure';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import NoVerdictHarness from '../../test/NoVerdictHarness.svelte';
import PlantedVerdict from '../../test/PlantedVerdict.svelte';
import {
	checkedText,
	findVerdictWords,
	verdictRegionWords,
	VERDICT_WORDS
} from '../../test/verdict-words';
import { ACTIVE_FIRM_KEY, PROFILE_KEY, resetProfileStore } from '$lib/profile/store.svelte';
import EntryPage from '../../routes/+page.svelte';
import ProfilePage from '../../routes/profile/+page.svelte';

// SPEC R3 as R6 keeps it: a verdict word shows only inside a [data-verdict] region of the tender
// page of a notice the capture's readings list, for any notice and any stored profile, and never on
// a list row. Every capture notice, with the readings the records build wrote for it, and every
// synthetic fixture that reads is rendered as a list row and as a tender page, under the header
// whose firm slot is profile-dependent text too.

// DeadlineTime re-renders dates in the visitor's zone once mounted; pinned so the run is the same
// on a machine in UTC.
process.env.TZ = 'Europe/Amsterdam';

const CAPTURE_DIR = join('src', 'lib', 'snapshot', 'generated', '2026-09-15');
const index = SnapshotIndexSchema.parse(
	JSON.parse(readFileSync(join(CAPTURE_DIR, 'index.json'), 'utf8'))
);
// The example's "now": the capture instant, so the capture's open and closed groups both render.
const NOW = new Date(index.capture.fetchedAt);
const CAPTURE = captureFacts(index.capture);
const NO_FILTERS: FilterState = { countries: [], cpv: [] };

interface Subject {
	name: string;
	row: IndexRow;
	record: NoticeRecord;
	readings?: NoticeReadings;
}

function storedReadings(notice: string): NoticeReadings | undefined {
	const path = join(CAPTURE_DIR, 'readings', `${notice}.json`);
	return existsSync(path)
		? NoticeReadingsSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
		: undefined;
}

const captured: Subject[] = index.rows.map((row) => ({
	name: row.noticeNumber,
	row,
	record: NoticeRecordSchema.parse(
		JSON.parse(readFileSync(join(CAPTURE_DIR, 'records', `${row.noticeNumber}.json`), 'utf8'))
	),
	readings: storedReadings(row.noticeNumber)
}));

const SYNTHETIC_ROLES = (Object.keys(FIXTURE_ROLES) as RoleName[]).filter(
	(role) => FIXTURE_ROLES[role].kind === 'synthetic'
);
const synthetic: Subject[] = [];
const refused: Record<string, string> = {};
for (const role of SYNTHETIC_ROLES) {
	const entry = FIXTURE_ROLES[role];
	if (entry.kind !== 'synthetic') continue;
	const result = readNotice(new TextEncoder().encode(readFixture(role)), {
		noticeNumber: entry.derivedFrom
	});
	if (result.ok)
		synthetic.push({ name: role, row: toIndexRow(result.record), record: result.record });
	else refused[role] = result.kind;
}
const subjects = [...captured, ...synthetic];

const listData = (subject: Subject): TenderListData => ({
	list: buildTenderList({ rows: [subject.row] }, NO_FILTERS, NOW),
	filters: NO_FILTERS,
	dropped: false,
	capture: CAPTURE
});
const pageData = (subject: Subject): TenderPageData => ({
	tender: buildTenderPage(subject.record, NOW, subject.readings),
	capture: CAPTURE
});

const LISTED = ['610242-2026', '634398-2026'];

const stored = (profile: Profile, lastExportedAt: string | null) =>
	JSON.stringify({
		schemaVersion: 1,
		savedAt: '2026-09-20T10:00:00.000Z',
		lastExportedAt,
		profile
	});

// Every field of the v1 schema holds a value.
const MAXIMAL: Profile = ProfileSchema.parse({
	registration: { country: 'NL', register: 'Kamer van Koophandel' },
	authorisations: [{ name: 'Telecom provider licence', register: 'ACM register' }],
	reservedOperator: true,
	securityClearances: [{ country: 'DE', level: 'VS-NfD' }],
	completedFinancialYears: 12,
	turnover: [2023, 2024, 2025].map((year) => ({
		year,
		generalNet: 900000000,
		specific: [{ businessLine: 'Software development', net: 450000000 }]
	})),
	staff: {
		total: 4800,
		byRole: [{ role: 'Developers', domain: 'Java', count: 2100 }],
		yearlyAverages: [{ year: 2025, average: 4712.5 }]
	},
	insurance: [{ kind: 'Professional liability', coverEuros: 50000000, validUntil: '2030-12-31' }],
	certificates: [{ standard: 'ISO 27001', scope: 'All sites', validUntil: '2029-03-31' }],
	references: [
		{
			client: 'A national tax authority',
			clientType: 'public',
			start: '2020-01-01',
			completion: '2024-12-31',
			valueNet: 25000000,
			categories: ['Case management', 'Hosting'],
			performedByFirm: true
		}
	],
	countries: EU_EEA_COUNTRIES.map((country) => country.code),
	languages: EU_LANGUAGES.map((language) => language.code)
});

const EMPTY_STORED = stored(emptyProfile(), null);
const MAXIMAL_STORED = stored(MAXIMAL, '2026-09-21T08:00:00.000Z');

interface Context {
	label: string;
	stored: string | null;
	active: 'own' | 'demo';
	variant: 'tenders' | 'example';
}

// The empty and the maximal profile each in both modes; the variants alternate so both are drawn
// with both profiles and both modes across the four.
const CONTEXTS: Context[] = [
	{ label: 'empty, own, tenders', stored: EMPTY_STORED, active: 'own', variant: 'tenders' },
	{ label: 'empty, demo, example', stored: EMPTY_STORED, active: 'demo', variant: 'example' },
	{ label: 'maximal, own, example', stored: MAXIMAL_STORED, active: 'own', variant: 'example' },
	{ label: 'maximal, demo, tenders', stored: MAXIMAL_STORED, active: 'demo', variant: 'tenders' }
];

interface Words {
	outside: string[];
	inside: string[];
}

// What breaks the property: a verdict word outside every verdict region, or one inside a region
// anywhere but the tender page of a listed notice.
function breaches(subject: Subject, kind: 'list' | 'tender', words: Words): string[] {
	const allowed = kind === 'tender' && subject.readings !== undefined;
	return [...words.outside, ...(allowed ? [] : words.inside.map((word) => `in a region: ${word}`))];
}

const wordsOf = (container: Element): Words => ({
	outside: findVerdictWords(container, { outsideVerdict: true }),
	inside: verdictRegionWords(container)
});

// The firm slot fills after mount, once its store has loaded; the words are read only then, so the
// header's profile-dependent text is inside what is checked.
async function renderedWords(
	subject: Subject,
	kind: 'list' | 'tender',
	context: Omit<Context, 'label'>
): Promise<Words> {
	const page =
		kind === 'list'
			? ({ kind, data: listData(subject) } as const)
			: ({ kind, data: pageData(subject) } as const);
	const { container } = render(NoVerdictHarness, { props: { page, ...context } });
	await vi.waitFor(
		() => expect(container.querySelector('a[data-firm-slot] strong')).not.toBeNull(),
		{ interval: 1, timeout: 5000 }
	);
	const words = wordsOf(container);
	cleanup();
	return words;
}

const text = fc.string({ minLength: 1, maxLength: 30 }).filter((value) => value.trim() !== '');
const day = fc
	.date({
		min: new Date('2000-01-01T00:00:00Z'),
		max: new Date('2040-12-31T00:00:00Z'),
		noInvalidDate: true
	})
	.map((date) => date.toISOString().slice(0, 10));
const whole = fc.nat();
const country = fc.constantFrom(...EU_EEA_COUNTRIES.map((each) => each.code));
const language = fc.constantFrom(...EU_LANGUAGES.map((each) => each.code));
const years = fc.uniqueArray(fc.integer({ min: 1990, max: 2030 }), { maxLength: 4 });

const profileArbitrary: fc.Arbitrary<Profile> = fc
	.record(
		{
			registration: fc.record({ country, register: text }, { requiredKeys: [] }),
			authorisations: fc.array(
				fc.record({ name: text, register: text }, { requiredKeys: ['name'] }),
				{
					maxLength: 2
				}
			),
			reservedOperator: fc.boolean(),
			securityClearances: fc.array(fc.record({ country, level: text }), { maxLength: 2 }),
			completedFinancialYears: whole,
			turnover: years.chain((list) =>
				fc.tuple(
					...list.map((year) =>
						fc.record(
							{
								year: fc.constant(year),
								generalNet: whole,
								specific: fc.array(
									fc.record({ businessLine: text, net: whole }, { requiredKeys: ['businessLine'] }),
									{ maxLength: 2 }
								)
							},
							{ requiredKeys: ['year', 'specific'] }
						)
					)
				)
			),
			staff: fc.record(
				{
					total: whole,
					byRole: fc.array(
						fc.record({ role: text, domain: text, count: whole }, { requiredKeys: ['role'] }),
						{ maxLength: 3 }
					),
					yearlyAverages: years.chain((list) =>
						fc.tuple(
							...list.map((year) =>
								fc.record(
									{
										year: fc.constant(year),
										average: fc.double({ min: 0, max: 1e6, noNaN: true })
									},
									{ requiredKeys: ['year'] }
								)
							)
						)
					)
				},
				{ requiredKeys: ['byRole', 'yearlyAverages'] }
			),
			insurance: fc.array(
				fc.record({ kind: text, coverEuros: whole, validUntil: day }, { requiredKeys: ['kind'] }),
				{ maxLength: 2 }
			),
			// One row per certificate, as the schema reads the name: trimmed.
			certificates: fc.uniqueArray(
				fc.record({ standard: text, scope: text, validUntil: day }, { requiredKeys: ['standard'] }),
				{ maxLength: 4, selector: (certificate) => certificate.standard.trim() }
			),
			references: fc.array(
				fc.record(
					{
						client: text,
						clientType: fc.constantFrom('public' as const, 'private' as const),
						start: day,
						completion: day,
						valueNet: whole,
						categories: fc.array(text, { maxLength: 3 }),
						performedByFirm: fc.boolean()
					},
					{ requiredKeys: ['client', 'categories'] }
				),
				{ maxLength: 2 }
			),
			countries: fc.uniqueArray(country, { maxLength: 5 }),
			languages: fc.uniqueArray(language, { maxLength: 5 })
		},
		{
			requiredKeys: [
				'registration',
				'authorisations',
				'securityClearances',
				'turnover',
				'staff',
				'insurance',
				'certificates',
				'references',
				'countries',
				'languages'
			]
		}
	)
	.map((profile) => ProfileSchema.parse(profile));

afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe('findVerdictWords', () => {
	const mount = (html: string) => {
		const root = document.createElement('div');
		root.innerHTML = html;
		return root;
	};

	it('names exactly the four verdicts, their labels and the UI-SPEC extras, and no reason label', () => {
		expect(VERDICT_WORDS).toEqual([
			'NO-GO',
			'PARTNER NEEDED',
			'ASK FIRST',
			'GO',
			'Go',
			'Not met alone',
			'Ask first',
			'No-go',
			'Partner needed',
			'Out alone'
		]);
	});

	it.each(VERDICT_WORDS.map((word) => [word]))('finds "%s" in the page\'s own text', (word) => {
		expect(findVerdictWords(mount(`<p>Lot 1: ${word}.</p>`))).toEqual([word]);
	});

	it('leaves out text marked as the notice\'s own words, where "Go-Live" is a word like any other', () => {
		expect(
			findVerdictWords(mount('<h1 data-notice-text>Go-Live und NO-GO Kriterien</h1><p>Read</p>'))
		).toEqual([]);
	});

	it('matches whole words in their case only: Google, going, go and NO-GO-Liste are not verdicts', () => {
		expect(findVerdictWords(mount('<p>Google going go NO-GO-Liste GOAL Ago</p>'))).toEqual([]);
	});

	it('reads a hyphenated verdict as one word, not as GO inside it', () => {
		expect(findVerdictWords(mount('<p>NO-GO</p>'))).toEqual(['NO-GO']);
	});

	// A page may join the two halves with a hyphen that never breaks a line (U+2011); the verdict is
	// still on the page, so the finder must still name one.
	it('still flags a verdict joined by a non-breaking hyphen', () => {
		expect(findVerdictWords(mount('<p>NO‑GO</p>'))).toEqual(['GO']);
	});

	it('reads the accessible names the page gives, not only its visible text', () => {
		expect(findVerdictWords(mount('<a aria-label="Ask first" href="/x"></a>'))).toEqual([
			'Ask first'
		]);
		expect(
			findVerdictWords(mount('<img alt="No-go" src="x.png"><span title="GO">?</span>'))
		).toEqual(['No-go', 'GO']);
		// An empty field shows its placeholder as text on the page.
		expect(findVerdictWords(mount('<input placeholder="GO" aria-label="Staff">'))).toEqual(['GO']);
	});

	// Elements sit side by side with no space between them in the markup; a word in one is still a
	// word, never the tail of the text before it ("Lot 1GO").
	it('finds a verdict word set right against the text of the element before or after it', () => {
		expect(
			findVerdictWords(mount('<p><strong>Lot 1</strong><span>GO</span><em>met</em></p>'))
		).toEqual(['GO']);
	});
});

describe('the no-verdict property (SPEC R3)', () => {
	beforeAll(() => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
		);
		return () => vi.unstubAllGlobals();
	});

	it('renders all 362 served capture notices and every synthetic fixture the reader accepts', () => {
		expect(captured).toHaveLength(362);
		expect(refused).toEqual({
			'doctype-entity': 'doctype',
			truncated: 'malformed',
			oversize: 'too-large'
		});
		expect(synthetic).toHaveLength(SYNTHETIC_ROLES.length - 3);
		expect(synthetic.length).toBeGreaterThan(0);
		expect(subjects).toHaveLength(362 + SYNTHETIC_ROLES.length - 3);
	});

	it('checks the page copy: the rendered 609955-2026 page says "Not read:" outside notice text', async () => {
		const subject = captured.find((each) => each.name === '609955-2026');
		if (subject === undefined) throw new Error('609955-2026 is not in the capture');
		const { container } = render(NoVerdictHarness, {
			props: { page: { kind: 'tender', data: pageData(subject) }, ...CONTEXTS[0] }
		});
		await vi.waitFor(() => expect(checkedText(container)).toContain('Your firm'), {
			interval: 1
		});
		expect(checkedText(container)).toContain('Not read:');
		expect(checkedText(container)).not.toContain(subject.record.title.text.slice(0, 20));
	});

	// One notice per test keeps each test far inside the per-test limit; the file runs them all.
	it.each(subjects.map((subject) => [subject.name, subject] as const))(
		'%s: verdict words only in the verdict region of a listed tender page, empty or maximal, own or demo',
		async (_name, subject) => {
			const found: string[] = [];
			for (const { label, ...context } of CONTEXTS) {
				for (const kind of ['list', 'tender'] as const) {
					const words = breaches(subject, kind, await renderedWords(subject, kind, context));
					if (words.length > 0) found.push(`${kind}, ${label}: ${words.join(', ')}`);
				}
			}
			expect(found).toEqual([]);
		}
	);

	it('verdict words show only in the verdict region of listed notices', async () => {
		expect(subjects.filter((each) => each.readings !== undefined).map((each) => each.name)).toEqual(
			LISTED
		);
		for (const notice of LISTED) {
			const subject = captured.find((each) => each.name === notice);
			if (subject === undefined) throw new Error(`${notice} is not in the capture`);
			const words = await renderedWords(subject, 'tender', CONTEXTS[1]);
			expect(words).toEqual({ outside: [], inside: ['Ask first'] });
			expect(breaches(subject, 'tender', words)).toEqual([]);
			expect(breaches(subject, 'list', words)).toEqual(['in a region: Ask first']);
		}
		const unlisted = captured.find((each) => each.name === '609955-2026');
		if (unlisted === undefined) throw new Error('609955-2026 is not in the capture');
		expect(breaches(unlisted, 'tender', { outside: [], inside: ['Ask first'] })).toEqual([
			'in a region: Ask first'
		]);
	});

	it(
		'holds for arbitrary stored profiles, stored or not, in either mode',
		{ timeout: 120_000 },
		async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.constantFrom(...subjects),
					fc.option(profileArbitrary, { nil: null }),
					fc.constantFrom('own' as const, 'demo' as const),
					fc.constantFrom('tenders' as const, 'example' as const),
					fc.constantFrom('list' as const, 'tender' as const),
					async (subject, profile, active, variant, kind) => {
						const words = await renderedWords(subject, kind, {
							stored: profile === null ? null : stored(profile, null),
							active,
							variant
						});
						expect(breaches(subject, kind, words)).toEqual([]);
					}
				),
				{ numRuns: 60 }
			);
		}
	);
});

// The other phase 1 pages: the entry page, and the profile page in each mode, where the stored
// profile is drawn whole.
describe('the no-verdict property on the entry and profile pages (SPEC R3)', () => {
	beforeAll(() => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
		);
		return () => vi.unstubAllGlobals();
	});

	it('finds no verdict word on the entry page', () => {
		const { container } = render(EntryPage, {
			props: {
				data: {
					served: captured.length,
					total: captured.length,
					capturedOn: CAPTURE.capturedOn,
					figure: null
				}
			}
		});
		expect(checkedText(container)).toContain('Browse open tenders');
		expect(findVerdictWords(container)).toEqual([]);
	});

	// The finding names the verdicts it counts, so they may show inside the figure and nowhere else on
	// the page; with no figure the page shows none at all.
	it('the entry page shows verdict words only inside the figure', () => {
		const base = {
			served: captured.length,
			total: captured.length,
			capturedOn: CAPTURE.capturedOn
		};
		const without = render(EntryPage, { props: { data: { ...base, figure: null } } }).container;
		expect(without.querySelector('[data-figure]')).toBeNull();
		expect(findVerdictWords(without)).toEqual([]);
		cleanup();
		const shown = render(EntryPage, {
			props: { data: { ...base, figure: SPREAD_FIGURE } }
		}).container;
		const figure = shown.querySelector('[data-figure]');
		expect(figure).not.toBeNull();
		expect(findVerdictWords(shown, { outsideFigure: true })).toEqual([]);
		const inside = figure === null ? [] : findVerdictWords(figure);
		expect(new Set(inside)).toEqual(new Set(Object.values(VERDICT_LABELS)));
	});

	it.each([
		['own, nothing stored', null, 'own'],
		['own, the maximal profile', MAXIMAL_STORED, 'own'],
		['demo', MAXIMAL_STORED, 'demo']
	] as const)('finds no verdict word on the profile page, %s', async (_label, value, active) => {
		resetProfileStore();
		localStorage.clear();
		if (value !== null) localStorage.setItem(PROFILE_KEY, value);
		localStorage.setItem(ACTIVE_FIRM_KEY, active);
		const { container } = render(ProfilePage);
		// The leaves fill after mount, once the store has read storage.
		await vi.waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
		expect(checkedText(container)).toContain(active === 'demo' ? 'Brink Data B.V.' : 'Total staff');
		expect(findVerdictWords(container)).toEqual([]);
		resetProfileStore();
	});
});

describe('the planted verdict reader', () => {
	beforeAll(() => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
		);
		return () => vi.unstubAllGlobals();
	});

	// 630477-2026 asks for "1.000.000 Euro" of yearly turnover; the planted reader compares it with
	// the stored figure and prints a verdict, which is exactly what the property must catch.
	it('turns the property red: the finder names its verdict on 630477-2026', async () => {
		const subject = captured.find((each) => each.name === '630477-2026');
		if (subject === undefined) throw new Error('630477-2026 is not in the capture');
		const { container } = render(PlantedVerdict, {
			props: { data: pageData(subject), stored: EMPTY_STORED, active: 'own' }
		});
		await vi.waitFor(
			() => expect(container.querySelector('a[data-firm-slot] strong')).not.toBeNull(),
			{ interval: 1 }
		);
		expect(findVerdictWords(container)).toEqual(['No-go']);
		expect(breaches(subject, 'tender', wordsOf(container))).toEqual(['No-go']);
	});

	// The same verdict drawn inside a verdict region: a region is allowed only on a listed notice.
	it('turns the property red inside a verdict region on a notice the readings do not list', async () => {
		const subject = captured.find((each) => each.name === '630477-2026');
		if (subject === undefined) throw new Error('630477-2026 is not in the capture');
		expect(subject.readings).toBeUndefined();
		const { container } = render(PlantedVerdict, {
			props: { data: pageData(subject), stored: EMPTY_STORED, active: 'own', region: true }
		});
		await vi.waitFor(
			() => expect(container.querySelector('a[data-firm-slot] strong')).not.toBeNull(),
			{ interval: 1 }
		);
		expect(wordsOf(container)).toEqual({ outside: [], inside: ['No-go'] });
		expect(breaches(subject, 'tender', wordsOf(container))).toEqual(['in a region: No-go']);
	});
});
