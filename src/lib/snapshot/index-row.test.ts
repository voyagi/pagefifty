import { describe, expect, it } from 'vitest';
import type { NoticeRecord } from '../ingest/record';
import {
	NOTICE_NUMBER,
	NoticeRecordSchema,
	SnapshotIndexSchema,
	captureDay,
	toIndexRow
} from './index-row';

const GERMAN = (text: string) => ({ text, lang: 'de', rawLang: 'DEU' });

const RECORD: NoticeRecord = {
	noticeNumber: '609955-2026',
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
					parameters: [{ listName: 'number-weight', code: 'ord-imp', value: '1' }]
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
	rows
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
	it('projects number, title, buyers, countries, CPV codes, value and lot deadlines only', () => {
		expect(toIndexRow(RECORD)).toEqual({
			noticeNumber: '609955-2026',
			title: RECORD.title,
			buyers: RECORD.buyers,
			country: ['DEU'],
			cpvCodes: ['45315700', '48921000'],
			estimatedValue: { amount: '834550.06', currency: 'EUR' },
			lots: [{ id: 'LOT-0000', deadlines: { tender: '2026-10-06T10:30:00+02:00' } }]
		});
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
		const withoutValue: NoticeRecord = { ...RECORD };
		delete withoutValue.estimatedValue;
		const row = toIndexRow(withoutValue);
		expect(row).not.toHaveProperty('estimatedValue');
		expect(SnapshotIndexSchema.safeParse(index([row])).success).toBe(true);
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

	it('refuses a deadline without its offset', () => {
		const row = {
			...toIndexRow(RECORD),
			lots: [{ id: 'LOT-0000', deadlines: { tender: '2026-10-06T10:30:00' } }]
		};
		expect(SnapshotIndexSchema.safeParse(index([row])).success).toBe(false);
	});
});
