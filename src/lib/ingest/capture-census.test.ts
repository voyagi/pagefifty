import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { capturePath } from '../../test/fixtures/node';
import { CAPTURE_ID } from '../../test/fixtures/roles';
import { readNotice, type NoticeResult } from './read-notice';
import type { NoticeRecord } from './record';

const CENSUS_MS = 30_000;
// TED writes a business-term comment before an element in some notices, so one may sit between
// the lot's start tag and its id.
const LOT_ID_FIRST = /^(?:\s|<!--[\s\S]*?-->)*<cbc:ID schemeName="Lot">/;

const listing = JSON.parse(readFileSync(join('examples', CAPTURE_ID, 'notices.json'), 'utf8')) as {
	total: number;
	notices: { 'publication-number': string }[];
};
const numbers = listing.notices.map((notice) => notice['publication-number']);

interface Entry {
	noticeNumber: string;
	lotBlocks: number;
	lotIdBlocks: number;
	result: NoticeResult;
}

let census: Entry[] = [];
let records: NoticeRecord[] = [];

// Read once for every test below; the lot counts come from the text itself, not from the reader.
beforeAll(() => {
	census = numbers.map((noticeNumber) => {
		const bytes = readFileSync(capturePath(noticeNumber));
		const blocks = bytes.toString('utf8').split('<cac:ProcurementProjectLot>').slice(1);
		return {
			noticeNumber,
			lotBlocks: blocks.length,
			lotIdBlocks: blocks.filter((block) => LOT_ID_FIRST.test(block)).length,
			result: readNotice(new Uint8Array(bytes), { noticeNumber })
		};
	});
	records = census.flatMap(({ result }) => (result.ok ? [result.record] : []));
}, CENSUS_MS);

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const lotsOf = (list: NoticeRecord[]) => list.flatMap((record) => record.lots);

describe(`the whole capture of ${CAPTURE_ID}`, () => {
	it(
		'reads every listed notice without a failure',
		() => {
			expect(numbers).toHaveLength(listing.total);
			const failures = census.flatMap(({ noticeNumber, result }) =>
				result.ok ? [] : [`${noticeNumber}: ${result.kind}: ${result.detail}`]
			);
			expect(failures).toEqual([]);
			expect(records).toHaveLength(363);
		},
		CENSUS_MS
	);

	it(
		'reads as many lots as the text holds lot blocks, each with the Lot id scheme',
		() => {
			const rawLots = sum(census.map((entry) => entry.lotBlocks));
			expect(rawLots).toBeGreaterThan(363);
			expect(sum(census.map((entry) => entry.lotIdBlocks))).toBe(rawLots);
			expect(lotsOf(records)).toHaveLength(rawLots);
		},
		CENSUS_MS
	);

	it(
		'finds every declared reserved code to be none, and one lot that declares none at all',
		() => {
			const lots = lotsOf(records);
			const declared = new Set(
				lots.flatMap((lot) => (lot.reserved === undefined ? [] : [lot.reserved]))
			);
			expect([...declared]).toEqual(['none']);
			const undeclared = records.filter((record) => record.lots.some((lot) => !lot.reserved));
			expect(undeclared.map((record) => record.noticeNumber)).toEqual(['635218-2026']);
		},
		CENSUS_MS
	);

	it(
		'keeps every parameter and value a string',
		() => {
			const lots = lotsOf(records);
			const parameters = lots.flatMap((lot) => lot.criteria.flatMap((c) => c.parameters));
			expect(parameters.length).toBeGreaterThan(0);
			for (const { code, value } of parameters) {
				expect([typeof code, typeof value]).toEqual(['string', 'string']);
			}
			const amounts = [...records, ...lots].flatMap((each) =>
				each.estimatedValue ? [each.estimatedValue.amount] : []
			);
			expect(amounts.length).toBeGreaterThan(0);
			expect(amounts.every((amount) => typeof amount === 'string')).toBe(true);
		},
		CENSUS_MS
	);
});
