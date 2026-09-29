import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '../ingest/read-notice';
import type { NoticeRecord } from '../ingest/record';
import { buildTenderPage, legalBasisName, workKind } from './tender-page';

const BEFORE_DEADLINES = new Date('2026-09-20T10:00:00Z');
const AFTER_DEADLINES = new Date('2028-01-01T00:00:00Z');

function recordOf(role: RoleName, which = 0): NoticeRecord {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	return result.record;
}

const codesOf = (lot: NoticeRecord['lots'][number]) => lot.criteria.map((each) => each.code);

describe('legalBasisName', () => {
	it.each([
		['32014L0024', 'Directive 2014/24/EU'],
		['32014L0025', 'Directive 2014/25/EU'],
		['32014L0023', 'Directive 2014/23/EU'],
		['32009L0081', 'Directive 2009/81/EC']
	])('names %s as %s', (code, name) => {
		expect(legalBasisName(code)).toBe(name);
	});

	it('leaves a code it has no name for to be shown as published', () => {
		expect([legalBasisName('32024R2509'), legalBasisName('other')]).toEqual([undefined, undefined]);
	});

	// A code comes from the notice, so it may name a key every plain object inherits.
	it.each(['constructor', '__proto__', 'toString'])('has no name for %s', (code) => {
		expect(legalBasisName(code)).toBeUndefined();
	});
});

describe('workKind', () => {
	it('takes the kind from the first IT code and names a main code outside the IT groups', () => {
		expect(workKind({ main: ['45315700'], additional: ['48921000'] })).toEqual({
			label: 'Software packages',
			code: '48921000',
			main: '45315700'
		});
	});

	it('names no separate main code when the main code is the IT code', () => {
		expect(workKind({ main: ['72000000'], additional: ['48000000'] })).toEqual({
			label: 'IT services',
			code: '72000000'
		});
	});

	it('has no kind for a notice with no IT code', () => {
		expect(workKind({ main: ['45000000'], additional: [] })).toBeUndefined();
	});
});

describe('buildTenderPage on 609955-2026, one lot with criteria in the notice', () => {
	const record = recordOf('one-lot');
	const page = buildTenderPage(record, BEFORE_DEADLINES);
	const [lot] = page.lots;

	it('carries the notice facts from the record', () => {
		expect(page.noticeNumber).toBe('609955-2026');
		expect(page.title).toEqual(record.title);
		expect(page.buyers).toEqual(record.buyers.map((buyer) => buyer.name));
		expect(page.countries).toEqual(['Germany']);
		expect(page.kind).toEqual({ label: 'Software packages', code: '48921000', main: '45315700' });
		expect(page.value).toBe('EUR 834,550.06');
		expect(page.tedUrl).toBe('https://ted.europa.eu/en/notice/-/detail/609955-2026');
		expect(page.documents).toEqual(record.lots[0].documents);
	});

	it('shows the tender deadline and the whole days left against the given now', () => {
		expect(page.deadline.shown).toEqual({ kind: 'tender', instant: '2026-10-06T10:30:00+02:00' });
		expect(page.timeLeft).toBe('15 days');
		expect(lot.deadline).toEqual(page.deadline.shown);
		expect(lot.deadlineKind).toBe('Tenders');
	});

	it('shows no time left once the deadline has passed', () => {
		const closed = buildTenderPage(record, AFTER_DEADLINES);
		expect([closed.deadline.open, closed.timeLeft]).toEqual([false, undefined]);
	});

	it('gives the lot its source, legal basis, legislation and published texts', () => {
		expect(lot.criteriaSource).toBe('In the notice');
		expect(lot.legalBasis).toEqual({ code: '32014L0024', name: 'Directive 2014/24/EU' });
		expect(lot.legislation).toEqual(record.nationalLegislation);
		expect(lot.reserved).toBeUndefined();
		expect(lot.notes).toEqual(record.lots[0].notes);
		expect(lot.value).toBe('EUR 834,550.06');
	});

	it('lists the criteria in publication order with their position among the lot', () => {
		expect(lot.criteria.map((each) => each.code)).toEqual(codesOf(record.lots[0]));
		expect(lot.criteria.map((each) => [each.position, each.of])).toEqual(
			[1, 2, 3, 4, 5, 6].map((position) => [position, 6])
		);
		expect(lot.criteria[0].descriptions[0]).toMatchObject({ lang: 'de', language: 'German' });
	});

	it('has no lot index for one lot, and marks the documents unread from its pointing criteria', () => {
		expect(page.lotIndex).toEqual([]);
		expect(page.documentsUnread).toBe(true);
		expect(lot.coverage.map((line) => `${line.status}: ${line.text}`)).toEqual([
			'Read: 6 selection criteria published in the notice for this lot.',
			'Not read: the documents a criterion refers to.',
			"Not assessed: exclusion grounds, registration or authorisation, declarations the notice demands, and the buyer's shortlisting.",
			'Not compared: your firm profile. This version shows criteria as published.'
		]);
	});
});

describe('buildTenderPage on several lots', () => {
	it('indexes the 17 lots of 600457-2026 in document order', () => {
		const record = recordOf('largest');
		const page = buildTenderPage(record, BEFORE_DEADLINES);
		expect(page.lots).toHaveLength(17);
		expect(page.lotIndex.map((entry) => entry.anchor)).toEqual(
			Array.from({ length: 17 }, (_, index) => `lot-${index + 1}`)
		);
		expect(page.lotIndex.map((entry) => entry.title)).toEqual(record.lots.map((lot) => lot.title));
		expect(page.lots.map((lot) => lot.id)).toEqual(record.lots.map((lot) => lot.id));
	});

	// lots-differ: lot 1 closes 5 Oct 2026 at 10:00 CEST, lot 2 a day later.
	it('marks a lot closed once its own deadline has passed while another lot keeps the notice open', () => {
		const record = recordOf('lots-differ');
		const between = buildTenderPage(record, new Date('2026-10-05T12:00:00Z'));
		expect(between.deadline.open).toBe(true);
		expect(between.lots.map((lot) => lot.closed)).toEqual([true, false]);
		expect(between.lotIndex.map((entry) => entry.closed)).toEqual([true, false]);
		expect(buildTenderPage(record, BEFORE_DEADLINES).lots.map((lot) => lot.closed)).toEqual([
			false,
			false
		]);
		expect(buildTenderPage(record, AFTER_DEADLINES).lots.map((lot) => lot.closed)).toEqual([
			true,
			true
		]);
	});

	it('never marks a lot without a deadline period closed', () => {
		const page = buildTenderPage(recordOf('neither-deadline'), AFTER_DEADLINES);
		expect(page.lots.map((lot) => lot.closed)).toEqual([false]);
	});

	it('keeps a code published in both lots of 600779-2026 attached to each lot', () => {
		const record = recordOf('same-code-in-two-lots');
		const page = buildTenderPage(record, BEFORE_DEADLINES);
		expect(page.lots.map((lot) => lot.criteria.map((each) => each.code))).toEqual(
			record.lots.map(codesOf)
		);
		for (const lot of page.lots) {
			expect(lot.criteria.map((each) => each.code)).toContain('slc-stand-other');
			expect(lot.criteria.every((each) => each.of === lot.criteria.length)).toBe(true);
		}
	});
});

describe('buildTenderPage on 601156-2026, no criteria and the ESPD as the source', () => {
	const page = buildTenderPage(recordOf('espd-only'), BEFORE_DEADLINES);
	const [lot] = page.lots;

	it('shows the lot with no criteria and says what was not read', () => {
		expect(lot.criteria).toEqual([]);
		expect(lot.criteriaSource).toBe('In the ESPD');
		expect(lot.coverage.map((line) => `${line.status}: ${line.text}`).slice(0, 2)).toEqual([
			'Read: the notice, which publishes no selection criteria for this lot.',
			'Not read: the ESPD, which the buyer names as a source of criteria.'
		]);
		expect(page.documentsUnread).toBe(true);
	});
});

describe('buildTenderPage on a criterion published in two languages', () => {
	it('keeps both descriptions in publication order, each named in English', () => {
		const page = buildTenderPage(recordOf('multilingual-criterion'), BEFORE_DEADLINES);
		const [criterion] = page.lots[0].criteria;
		expect(criterion.descriptions.map((each) => [each.lang, each.language])).toEqual([
			['fr', 'French'],
			['nl', 'Dutch']
		]);
	});
});

describe('buildTenderPage on shapes the capture holds rarely or never', () => {
	const base = recordOf('one-lot');
	const withLot = (change: Partial<NoticeRecord['lots'][number]>): NoticeRecord => ({
		...base,
		lots: [{ ...base.lots[0], ...change }]
	});

	it('joins several declared sources, each once, in the order declared', () => {
		const record = withLot({
			criteriaSources: ['epo-notice', 'epo-procurement-document', 'epo-notice', 'epo-sub-espd']
		});
		expect(buildTenderPage(record, BEFORE_DEADLINES).lots[0].criteriaSource).toBe(
			'In the notice and in the procurement documents and in the ESPD'
		);
	});

	it('shows a source code it does not know as published, and names none when none is declared', () => {
		const unknown = buildTenderPage(withLot({ criteriaSources: ['epo-other'] }), BEFORE_DEADLINES);
		const none = buildTenderPage(withLot({ criteriaSources: [] }), BEFORE_DEADLINES);
		expect([unknown.lots[0].criteriaSource, none.lots[0].criteriaSource]).toEqual([
			'epo-other',
			undefined
		]);
	});

	it('shows a source code and a buyer country that name a built-in property as published', () => {
		const record: NoticeRecord = {
			...withLot({ criteriaSources: ['constructor', 'epo-notice', '__proto__'] }),
			buyers: [{ name: { text: 'Gemeente', lang: 'nl' }, country: '__proto__' }]
		};
		const page = buildTenderPage(record, BEFORE_DEADLINES);
		expect(page.lots[0].criteriaSource).toBe('constructor and in the notice and __proto__');
		expect(page.countries).toEqual(['__proto__']);
	});

	it('shows a reservation, and a group legal form only when its text is published', () => {
		const description = { text: 'Gesamtschuldnerisch haftende Bietergemeinschaft', lang: 'de' };
		const page = buildTenderPage(
			withLot({ reserved: 'res-ws', groupLegalForm: { required: 'true', description } }),
			BEFORE_DEADLINES
		);
		expect([page.lots[0].reserved, page.lots[0].groupLegalForm]).toEqual(['res-ws', description]);
		const bare = buildTenderPage(
			withLot({ groupLegalForm: { required: 'false' } }),
			BEFORE_DEADLINES
		);
		expect(bare.lots[0].groupLegalForm).toBeUndefined();
	});

	// 635218-2026 in the capture declares no reservation code on its lot: unknown, never "none".
	it('tells a lot that states no reservation code from one declared not reserved', () => {
		const lot = { ...base.lots[0] };
		delete lot.reserved;
		const unstated = buildTenderPage({ ...base, lots: [lot] }, BEFORE_DEADLINES).lots[0];
		const none = buildTenderPage(withLot({ reserved: 'none' }), BEFORE_DEADLINES).lots[0];
		expect([unstated.reserved, unstated.reservedUnstated]).toEqual([undefined, true]);
		expect([none.reserved, none.reservedUnstated]).toEqual([undefined, false]);
	});

	it('shows a note published on both the procedure and the lot once, as the procedure note', () => {
		const note = { text: 'Hinweis', lang: 'de' };
		const page = buildTenderPage(
			{ ...withLot({ notes: [note, { text: 'Los', lang: 'de' }] }), procedureNotes: [note] },
			BEFORE_DEADLINES
		);
		expect([page.lots[0].procedureNotes, page.lots[0].notes]).toEqual([
			[note],
			[{ text: 'Los', lang: 'de' }]
		]);
	});

	it('names a language TED wrote without a known tag by its published code', () => {
		const criteria = [
			{ ...base.lots[0].criteria[0], descriptions: [{ text: 'Tekst', rawLang: 'XXX' }] }
		];
		const [description] = buildTenderPage(withLot({ criteria }), BEFORE_DEADLINES).lots[0]
			.criteria[0].descriptions;
		expect(description.language).toBe('XXX');
	});

	it('says a description that carries no language code does not state its language', () => {
		const criteria = [{ ...base.lots[0].criteria[0], descriptions: [{ text: 'Tekst' }] }];
		const [description] = buildTenderPage(withLot({ criteria }), BEFORE_DEADLINES).lots[0]
			.criteria[0].descriptions;
		expect(description.language).toBe('Language not stated');
	});

	it('keeps a restricted documents link marked, so it is never shown as the open documents', () => {
		const documents = { published: 'https://app.example.test/dps/1', restricted: true as const };
		const page = buildTenderPage(withLot({ documents }), BEFORE_DEADLINES);
		expect(page.documents).toEqual(documents);
	});

	it('names no documents for the notice when its lots publish different links', () => {
		const record: NoticeRecord = {
			...base,
			lots: [
				{ ...base.lots[0], documents: { published: 'https://a.example.test/' } },
				{ ...base.lots[0], id: 'LOT-0001', documents: { published: 'https://b.example.test/' } }
			]
		};
		expect(buildTenderPage(record, BEFORE_DEADLINES).documents).toBeUndefined();
	});

	// One address, open on one lot and restricted on the other: the notice cannot word it either
	// way, so each lot's own coverage line carries its link.
	it('names no documents for the notice when its lots share an address but not the restriction', () => {
		const address = 'https://a.example.test/';
		const record: NoticeRecord = {
			...base,
			lots: [
				{ ...base.lots[0], documents: { published: address, href: address } },
				{
					...base.lots[0],
					id: 'LOT-0002',
					documents: { published: address, href: address, restricted: true }
				}
			]
		};
		expect(buildTenderPage(record, BEFORE_DEADLINES).documents).toBeUndefined();
	});
});
