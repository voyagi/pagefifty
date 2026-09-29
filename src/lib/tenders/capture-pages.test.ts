import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { CAPTURE_ID } from '../../test/fixtures/roles';
import type { NoticeRecord } from '../ingest/record';
import { NoticeRecordSchema, SnapshotIndexSchema } from '../snapshot/index-row';
import { buildTenderList, countsLine, formatValue, type ListRow } from './list';
import { buildTenderPage } from './tender-page';

// The tender page and the list are built from two files (a record and the index row the build made
// from it) by two models, and a visitor clicks from one to the other. Over the whole capture and at
// several instants, the two must say the same thing about the same notice.
const folder = join('src', 'lib', 'snapshot', 'generated', CAPTURE_ID);
const index = SnapshotIndexSchema.parse(
	JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8'))
);
const records: NoticeRecord[] = readdirSync(join(folder, 'records')).map((file) =>
	NoticeRecordSchema.parse(JSON.parse(readFileSync(join(folder, 'records', file), 'utf8')))
);

// The capture instant, a day many lots close, the first day of judging, and after every deadline.
const INSTANTS = [
	index.capture.fetchedAt,
	'2026-10-06T08:30:00Z',
	'2026-12-01T00:00:00Z',
	'2028-01-01T00:00:00Z'
];
const NO_FILTER = { countries: [], cpv: [] };

describe(`the tender page and the list over every notice of the ${CAPTURE_ID} capture`, () => {
	it('holds one record per index row', () => {
		expect(records.map((record) => record.noticeNumber).sort()).toEqual(
			index.rows.map((row) => row.noticeNumber).sort()
		);
	});

	it.each(INSTANTS)('agree on every notice at %s', (instant) => {
		const now = new Date(instant);
		const list = buildTenderList(index, NO_FILTER, now);
		const rows = new Map<string, ListRow>(
			[...list.open, ...list.closed].map((row) => [row.noticeNumber, row])
		);
		const disagreements: string[] = [];
		const say = (notice: string, what: string) => disagreements.push(`${notice}: ${what}`);
		for (const record of records) {
			const notice = record.noticeNumber;
			const page = buildTenderPage(record, now);
			const row = rows.get(notice);
			if (!row) {
				say(notice, 'not on the list');
				continue;
			}
			if (JSON.stringify(page.deadline) !== JSON.stringify(row.deadline)) say(notice, 'deadline');
			if (page.value !== row.value) say(notice, `value ${page.value} against ${row.value}`);
			if (page.countries.join() !== row.countries.join()) say(notice, 'countries');
			// The list names the page's first buyer and counts the rest (a joint procurement).
			if (row.buyer?.text !== page.buyers[0]?.text || row.otherBuyers !== page.buyers.length - 1) {
				say(notice, `buyers: ${row.otherBuyers} others listed, ${page.buyers.length} on the page`);
			}
			if (page.documentsUnread !== (row.reading.tag === 'criteria-in-documents')) {
				say(notice, 'documents unread against the reading tag');
			}
			// A notice stays open while any lot is open (D-08), and every lot's own flag says which.
			if (page.deadline.open !== page.lots.some((lot) => !lot.closed)) say(notice, 'lot flags');
			const dated = page.deadline.shown.kind !== 'in-notice';
			if ((page.timeLeft !== undefined) !== (page.deadline.open && dated)) say(notice, 'time left');
			const expectedIndex =
				page.lots.length > 1
					? page.lots.map(({ number, anchor, closed, deadline }) => ({
							number,
							anchor,
							closed,
							deadline
						}))
					: [];
			const shownIndex = page.lotIndex.map(({ number, anchor, closed, deadline }) => ({
				number,
				anchor,
				closed,
				deadline
			}));
			if (JSON.stringify(shownIndex) !== JSON.stringify(expectedIndex)) say(notice, 'lot index');
			for (const lot of page.lots) {
				const positions = lot.criteria.map((criterion) => `${criterion.position}/${criterion.of}`);
				const counted = lot.criteria.map((_, i) => `${i + 1}/${lot.criteria.length}`);
				if (positions.join() !== counted.join()) say(notice, `${lot.anchor} criterion positions`);
				const tail = lot.coverage.slice(-2).map((line) => line.status);
				if (tail.join() !== 'Not assessed,Not compared') say(notice, `${lot.anchor} coverage tail`);
				if (lot.closed && lot.deadline.kind === 'in-notice') {
					say(notice, `${lot.anchor} closed with no deadline`);
				}
			}
		}
		expect(disagreements).toEqual([]);
	});

	// Every string the page prints from a lookup is a string: a table answering with a built-in
	// property would print "function Object() { [native code] }".
	it('prints only strings where a lookup names a country, a legal basis or a criteria source', () => {
		const printed = records.flatMap((record) => {
			const page = buildTenderPage(record, new Date(index.capture.fetchedAt));
			return [
				...page.countries,
				...page.lots.flatMap((lot) => [
					lot.legalBasis.name ?? lot.legalBasis.code,
					lot.criteriaSource ?? ''
				])
			];
		});
		expect(printed.filter((each) => typeof each !== 'string' || /native code/.test(each))).toEqual(
			[]
		);
	});
});

describe('formatValue against a whole-number oracle', () => {
	// The floor is EUR 1,000 on the published amount, so the whole part alone decides it.
	test.prop([fc.stringMatching(/^\d{1,16}(\.\d{1,6})?$/)])(
		'writes a value exactly when its whole part reaches 1,000, never rounded',
		(amount) => {
			const [whole, fraction = ''] = amount.split('.');
			const written = formatValue({ amount, currency: 'EUR' });
			if (BigInt(whole) < 1000n) {
				expect(written).toBeNull();
				return;
			}
			expect(written).not.toBeNull();
			const [digits, decimals = ''] = (written ?? '').replace('EUR ', '').split('.');
			expect(digits.replaceAll(',', '')).toBe(BigInt(whole).toString());
			expect(digits).toMatch(/^\d{1,3}(,\d{3})*$/);
			const kept = fraction.replace(/0+$/, '');
			expect(decimals).toBe(kept === '' ? '' : kept.padEnd(2, '0'));
		}
	);
});

describe('countsLine against its figures', () => {
	const count = fc.nat({ max: 5000 });
	test.prop([count, count, count, count, fc.boolean()])(
		'writes each figure as a number, in order, with the noun its total takes',
		(total, shown, open, closed, filtered) => {
			const line = countsLine({ total, shown, open, closed }, filtered);
			const figures = line.filter((part) => typeof part === 'number');
			expect(figures).toEqual(filtered ? [shown, total, open, closed] : [open, closed, total]);
			const text = line.join('');
			expect(text).toContain(total === 1 ? ' notice' : ' notices');
			expect(text).not.toContain('since the capture');
		}
	);
});
