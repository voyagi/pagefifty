import { describe, expect, it } from 'vitest';
import type { NoticeRecord } from '../ingest/record';
import {
	CaptureLineSchema,
	NOTICE_NUMBER,
	NoticeRecordSchema,
	SnapshotIndexSchema,
	captureDay,
	toIndexRow
} from './index-row';

const GERMAN = (text: string) => ({ text, lang: 'de', rawLang: 'DEU' });

const RECORD: NoticeRecord = {
	noticeNumber: '609955-2026',
	notice: {
		id: '38c19032-e327-4ae0-b618-31b349376b36',
		version: '01',
		procedure: 'd3ec00fd-56a4-4251-8674-8297cf1736d8',
		changes: []
	},
	sdkVersion: 'eforms-sdk-1.13',
	noticeSubtype: '16',
	legalBasis: '32014L0024',
	nationalLegislation: [{ id: 'vgv', description: GERMAN('EU-VOB/A') }],
	title: GERMAN('Gebäudeautomation'),
	buyers: [{ name: GERMAN('Burgenlandkreis'), country: 'DEU' }],
	procedureNotes: [],
	estimatedValue: { amount: '834550.06', currency: 'EUR' },
	cpv: { main: ['45315700'], additional: ['48921000'] },
	changeReasons: [],
	lots: [
		{
			id: 'LOT-0000',
			title: GERMAN('Los 4-09'),
			deadlines: { tender: '2026-10-06T10:30:00+02:00' },
			criteria: [
				{
					code: 'slc-stand-ins',
					descriptions: [GERMAN('Nachweis über Betriebshaftpflichtversicherung')],
					parameters: [{ listName: 'number-weight', code: 'ord-imp', value: '1' }],
					pointsToDocuments: false
				}
			],
			criteriaSources: ['epo-notice'],
			reserved: 'none',
			notes: [GERMAN('#Besonders auch geeignet für:selbst#')],
			groupLegalForm: { required: 'true', description: GERMAN('Bietergemeinschaft zulässig') },
			estimatedValue: { amount: '834550.06', currency: 'EUR' },
			documents: {
				published: 'https://www.evergabe-online.de/tenderdocuments.html?id=887787',
				href: 'https://www.evergabe-online.de/tenderdocuments.html?id=887787'
			}
		}
	]
};

const BARE_LOT = { id: 'LOT-0000', deadlines: {}, criteria: [], criteriaSources: [], notes: [] };

const index = (rows: unknown[]) => ({
	capture: {
		id: '2026-09-15',
		fetchedAt: '2026-09-15T19:50:49.157Z',
		total: rows.length,
		query: 'q'
	},
	leftOut: [],
	rows
});

// Every live page formats the query's first publication day, where an impossible month throws and
// 30 February reads as 2 March, so the line that carries such a day is refused where the build
// reads it.
describe('CaptureLineSchema', () => {
	const line = (query: string) => ({
		id: '2026-09-15',
		fetchedAt: '2026-09-15T19:50:49.157Z',
		total: 1,
		query
	});

	it.each([
		['a real first day', 'buyer-country IN (NLD) AND publication-date>=20260901'],
		['29 February in a leap year', 'publication-date>=20280229'],
		['no first day', 'buyer-country IN (NLD)']
	])('accepts a query with %s', (_label, query) => {
		expect(CaptureLineSchema.safeParse(line(query)).success).toBe(true);
	});

	it.each([
		['month 13', 'publication-date>=20261340'],
		['30 February', 'publication-date>=20260230'],
		['29 February in a common year', 'publication-date>=20270229']
	])('refuses a query whose first day is %s, naming the day', (_label, query) => {
		const result = CaptureLineSchema.safeParse(line(query));
		expect(result.success).toBe(false);
		expect(result.error?.message).toContain('publication-date>= names no calendar day');
	});

	// The live pages never choose such a folder, so the build refuses it rather than write a capture
	// no page would serve.
	it.each([
		['30 February', '2026-02-30'],
		['month 13', '2026-13-01'],
		['a day written without its zeros', '2026-9-15']
	])('refuses a capture named %s', (_label, id) => {
		const result = CaptureLineSchema.safeParse({ ...line('buyer-country IN (NLD)'), id });
		expect(result.success).toBe(false);
		expect(result.error?.message).toContain('a capture is named by a calendar day');
	});

	it('accepts a capture named 29 February in a leap year', () => {
		expect(
			CaptureLineSchema.safeParse({ ...line('buyer-country IN (NLD)'), id: '2028-02-29' }).success
		).toBe(true);
	});
});

describe('captureDay', () => {
	it('writes the capture day as "15 Sep 2026", never "Sept"', () => {
		expect(captureDay('2026-09-15T19:50:49.157Z')).toBe('15 Sep 2026');
	});

	it('counts the day in Central European Time', () => {
		expect(captureDay('2026-09-15T22:30:00Z')).toBe('16 Sep 2026');
		expect(captureDay('2026-12-31T22:59:59Z')).toBe('31 Dec 2026');
		expect(captureDay('2026-12-31T23:00:00Z')).toBe('1 Jan 2027');
	});
});

describe('NOTICE_NUMBER', () => {
	// 12345-2025 is a real notice, published by TED on 9 January 2025.
	it.each(['1-2027', '12345-2025', '609955-2026', '12345678-2026'])('accepts %j', (notice) => {
		expect(NOTICE_NUMBER.test(notice)).toBe(true);
	});

	it.each([
		'00609955-2026',
		'0-2026',
		'123456789-2026',
		'609955-26',
		'609955-20266',
		'x609955-2026',
		'609955-2026x',
		'609955_2026',
		''
	])('refuses %j', (notice) => {
		expect(NOTICE_NUMBER.test(notice)).toBe(false);
	});
});

describe('toIndexRow and the index schema', () => {
	it('projects number, title, buyers, countries, CPV codes, value, lot deadlines and coverage only', () => {
		expect(toIndexRow(RECORD)).toEqual({
			noticeNumber: '609955-2026',
			title: RECORD.title,
			buyers: RECORD.buyers,
			country: ['DEU'],
			cpvCodes: ['45315700', '48921000'],
			estimatedValue: { amount: '834550.06', currency: 'EUR' },
			lots: [
				{
					id: 'LOT-0000',
					deadlines: { tender: '2026-10-06T10:30:00+02:00' },
					coverage: { criteriaCount: 1, sources: ['epo-notice'], pointsToDocuments: false }
				}
			]
		});
	});

	it('refuses a lot row without its coverage input, or a criterion without its label', () => {
		const row = toIndexRow(RECORD);
		const bare = { id: row.lots[0].id, deadlines: row.lots[0].deadlines };
		expect(SnapshotIndexSchema.safeParse(index([{ ...row, lots: [bare] }])).success).toBe(false);
		const [{ code, descriptions, parameters }] = RECORD.lots[0].criteria;
		const lot = { ...RECORD.lots[0], criteria: [{ code, descriptions, parameters }] };
		expect(NoticeRecordSchema.safeParse({ ...RECORD, lots: [lot] }).success).toBe(false);
		expect(NoticeRecordSchema.safeParse(RECORD).success).toBe(true);
	});

	it("lists every buyer's country once, in the order the buyers are published", () => {
		const buyer = (country: string) => ({ name: GERMAN(`Auftraggeber ${country}`), country });
		const record = { ...RECORD, buyers: ['NLD', 'DEU', 'NLD', 'BEL'].map(buyer) };
		expect(toIndexRow(record).country).toEqual(['NLD', 'DEU', 'BEL']);
	});

	it('lists main codes before additional ones, each code once', () => {
		const record = {
			...RECORD,
			cpv: { main: ['72000000', '48000000'], additional: ['48000000', '72212000', '72000000'] }
		};
		expect(toIndexRow(record).cpvCodes).toEqual(['72000000', '48000000', '72212000']);
	});

	it('leaves the value out of a row whose notice publishes none', () => {
		const withoutValue: NoticeRecord = { ...RECORD, lots: [{ ...BARE_LOT }] };
		delete withoutValue.estimatedValue;
		const row = toIndexRow(withoutValue);
		expect(row).not.toHaveProperty('estimatedValue');
		expect(SnapshotIndexSchema.safeParse(index([row])).success).toBe(true);
	});

	// 623488-2026 publishes its 1,650,000 EUR only on its one lot, which is the whole procedure.
	it("gives a one-lot notice its lot's value when the procedure publishes none", () => {
		const lotValue = { amount: '1650000', currency: 'EUR' };
		const record: NoticeRecord = { ...RECORD, lots: [{ ...BARE_LOT, estimatedValue: lotValue }] };
		delete record.estimatedValue;
		expect(toIndexRow(record).estimatedValue).toEqual(lotValue);
	});

	// D-09: lot values can overlap, so several of them never become the card's one value.
	it('gives no value when several lots carry one and the procedure publishes none', () => {
		const lot = (id: string) => ({
			...BARE_LOT,
			id,
			estimatedValue: { amount: '9375000', currency: 'EUR' }
		});
		const record: NoticeRecord = { ...RECORD, lots: [lot('LOT-0001'), lot('LOT-0002')] };
		delete record.estimatedValue;
		expect(toIndexRow(record)).not.toHaveProperty('estimatedValue');
	});

	it('keeps the procedure value over a different value on its one lot', () => {
		const lotValue = { amount: '700000', currency: 'EUR' };
		const record: NoticeRecord = { ...RECORD, lots: [{ ...BARE_LOT, estimatedValue: lotValue }] };
		expect(toIndexRow(record).estimatedValue).toEqual({ amount: '834550.06', currency: 'EUR' });
	});

	it('refuses a value given as a number', () => {
		const row = { ...toIndexRow(RECORD), estimatedValue: { amount: 834550.06, currency: 'EUR' } };
		const result = SnapshotIndexSchema.safeParse(index([row]));
		expect(result.success).toBe(false);
		expect(result.error?.issues[0].path).toEqual(['rows', 0, 'estimatedValue', 'amount']);
	});

	it('parses an index built from its own rows', () => {
		expect(SnapshotIndexSchema.safeParse(index([toIndexRow(RECORD)])).success).toBe(true);
	});

	it('refuses a row with a field the schema does not name', () => {
		const row = { ...toIndexRow(RECORD), value: '834550.06' };
		const result = SnapshotIndexSchema.safeParse(index([row]));
		expect(result.success).toBe(false);
		expect(result.error?.issues[0].path).toEqual(['rows', 0]);
	});

	it('parses a whole record, lot titles included, and refuses a field it does not name', () => {
		expect(NoticeRecordSchema.parse(RECORD)).toEqual(RECORD);
		const extra = NoticeRecordSchema.safeParse({ ...RECORD, value: '834550.06' });
		expect(extra.success).toBe(false);
		const lotWithout = { ...RECORD, lots: [BARE_LOT] };
		expect(NoticeRecordSchema.parse(lotWithout)).toEqual(lotWithout);
	});

	// The reader's bound: versions are compared as integers, which stay exact to 15 digits.
	it('takes a version of 15 digits and refuses one of 16, as the reader does', () => {
		const withVersion = (version: string) => ({ ...RECORD, notice: { ...RECORD.notice, version } });
		expect(NoticeRecordSchema.safeParse(withVersion('123456789012345')).success).toBe(true);
		expect(NoticeRecordSchema.safeParse(withVersion('1234567890123456')).success).toBe(false);
	});

	it.each([
		[
			'a criterion',
			(lot: object) => ({ ...lot, criteria: [{ ...RECORD.lots[0].criteria[0], x: 1 }] })
		],
		['a documents link', (lot: object) => ({ ...lot, documents: { published: 'a', target: 'b' } })],
		['a legal form', (lot: object) => ({ ...lot, groupLegalForm: { required: 'true', x: 1 } })]
	])('refuses a field it does not name inside %s', (_where, edit) => {
		const record = { ...RECORD, lots: [edit(RECORD.lots[0])] };
		expect(NoticeRecordSchema.safeParse(record).success).toBe(false);
	});

	it('refuses a criterion parameter given as a number', () => {
		const [criterion] = RECORD.lots[0].criteria;
		const parameters = [{ listName: 'number-weight', code: 'ord-imp', value: 1 }];
		const lot = { ...RECORD.lots[0], criteria: [{ ...criterion, parameters }] };
		expect(NoticeRecordSchema.safeParse({ ...RECORD, lots: [lot] }).success).toBe(false);
	});

	it('takes a documents link marked restricted, and refuses the mark written as false', () => {
		const withDocuments = (documents: object) => ({
			...RECORD,
			lots: [{ ...RECORD.lots[0], documents }]
		});
		const link = { published: 'https://example.org/closed', href: 'https://example.org/closed' };
		expect(NoticeRecordSchema.safeParse(withDocuments({ ...link, restricted: true })).success).toBe(
			true
		);
		expect(
			NoticeRecordSchema.safeParse(withDocuments({ ...link, restricted: false })).success
		).toBe(false);
	});

	it('refuses a row whose notice number the loader could not serve', () => {
		const row = { ...toIndexRow(RECORD), noticeNumber: '../index' };
		const result = SnapshotIndexSchema.safeParse(index([row]));
		expect(result.success).toBe(false);
		expect(result.error?.issues[0].path).toEqual(['rows', 0, 'noticeNumber']);
	});

	// The build refuses a notice with no lot (record.ts), so a lotless row can only be a damaged file,
	// which would otherwise list as open with no deadline and no criteria.
	it('refuses a row or a record with no lot', () => {
		const row = { ...toIndexRow(RECORD), lots: [] };
		const result = SnapshotIndexSchema.safeParse(index([row]));
		expect(result.success).toBe(false);
		expect(result.error?.issues[0].path).toEqual(['rows', 0, 'lots']);
		const record = NoticeRecordSchema.safeParse({ ...RECORD, lots: [] });
		expect(record.success).toBe(false);
		expect(record.error?.issues[0].path).toEqual(['lots']);
	});

	it('refuses a deadline without its offset', () => {
		const good = toIndexRow(RECORD);
		const row = {
			...good,
			lots: [{ ...good.lots[0], deadlines: { tender: '2026-10-06T10:30:00' } }]
		};
		expect(SnapshotIndexSchema.safeParse(index([good])).success).toBe(true);
		expect(SnapshotIndexSchema.safeParse(index([row])).success).toBe(false);
	});
});
