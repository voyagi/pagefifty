import { describe, expect, it } from 'vitest';
import type { NoticeRecord } from '../ingest/record';
import {
	NOTICE_NUMBER,
	NoticeRecordSchema,
	SnapshotIndexSchema,
	captureDay,
	toIndexRow
} from './index-row';

const RECORD: NoticeRecord = {
	noticeNumber: '609955-2026',
	sdkVersion: 'eforms-sdk-1.13',
	title: { text: 'Gebäudeautomation', lang: 'de', rawLang: 'DEU' },
	buyers: [{ name: { text: 'Burgenlandkreis', lang: 'de', rawLang: 'DEU' }, country: 'DEU' }],
	lots: [
		{
			id: 'LOT-0000',
			title: { text: 'Los 4-09', lang: 'de', rawLang: 'DEU' },
			deadlines: { tender: '2026-10-06T10:30:00+02:00' }
		}
	]
};

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
	it('projects number, title, buyers and lot deadlines, and drops lot titles', () => {
		expect(toIndexRow(RECORD)).toEqual({
			noticeNumber: '609955-2026',
			title: RECORD.title,
			buyers: RECORD.buyers,
			lots: [{ id: 'LOT-0000', deadlines: { tender: '2026-10-06T10:30:00+02:00' } }]
		});
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
		const lotWithout = { ...RECORD, lots: [{ id: 'LOT-0000', deadlines: {} }] };
		expect(NoticeRecordSchema.parse(lotWithout)).toEqual(lotWithout);
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
