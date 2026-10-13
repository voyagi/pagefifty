import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { selectLatest } from './latest';
import { readNotice } from './read-notice';
import type { NoticeIdentity, NoticeRecord } from './record';

function readRole(role: RoleName, which = 0): NoticeRecord {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	return result.record;
}

const LATEST = readRole('superseded-pair', 0);
const SUPERSEDED = readRole('superseded-pair', 1);
const CANCEL = readRole('cancel-notice');
const BASE = readRole('one-lot');

// A real record under another publication number, with only the named parts of its identity
// changed, for the cases the capture does not hold.
function variant(
	noticeNumber: string,
	notice: Partial<NoticeIdentity>,
	changeReasons: string[] = []
): NoticeRecord {
	return { ...BASE, noticeNumber, notice: { ...BASE.notice, ...notice }, changeReasons };
}

const numbers = (records: readonly NoticeRecord[]) => records.map((record) => record.noticeNumber);

describe('selectLatest', () => {
	it.each([
		['newer first', [LATEST, SUPERSEDED]],
		['older first', [SUPERSEDED, LATEST]]
	])('keeps the greatest VersionID of one notice identifier, listed %s', (_order, records) => {
		const { kept, leftOut, sameProcedure } = selectLatest(records);
		expect(numbers(kept)).toEqual(['600367-2026']);
		expect(leftOut).toEqual([{ notice: '601147-2026', reason: 'superseded by 600367-2026' }]);
		expect(sameProcedure).toEqual([]);
	});

	it('versions compare as integers, so 10 beats 9', () => {
		const ten = variant('600001-2026', { id: 'shared-id', version: '10' });
		const nine = variant('600002-2026', { id: 'shared-id', version: '9' });
		const { kept, leftOut } = selectLatest([nine, ten]);
		expect(numbers(kept)).toEqual(['600001-2026']);
		expect(leftOut).toEqual([{ notice: '600002-2026', reason: 'superseded by 600001-2026' }]);
	});

	it('treats VersionID 01 and 1 as one version, so the higher publication number is kept', () => {
		const padded = variant('600002-2026', { id: 'shared-id', version: '01' });
		const plain = variant('600001-2026', { id: 'shared-id', version: '1' });
		const { kept, leftOut } = selectLatest([padded, plain]);
		expect(numbers(kept)).toEqual(['600002-2026']);
		expect(leftOut).toEqual([{ notice: '600001-2026', reason: 'duplicate of 600002-2026' }]);
	});

	it('keeps the higher publication number of two with the same identifier and version (override: number)', () => {
		const first = variant('600001-2026', { id: 'shared-id', version: '02' });
		const second = variant('600010-2026', { id: 'shared-id', version: '02' });
		const { kept, leftOut } = selectLatest([second, first]);
		expect(numbers(kept)).toEqual(['600010-2026']);
		expect(leftOut).toEqual([{ notice: '600001-2026', reason: 'duplicate of 600010-2026' }]);
	});

	it('leaves out a notice another names in its ChangedNoticeIdentifier (override: notice block)', () => {
		const earlier = variant('600001-2026', { id: 'a1b2-c3d4-e5', version: '03', procedure: 'p1' });
		const change = variant('600002-2026', {
			id: 'f6a7-b8c9',
			version: '01',
			procedure: 'p2',
			changes: ['a1b2-c3d4-e5-03']
		});
		const { kept, leftOut } = selectLatest([change, earlier]);
		expect(numbers(kept)).toEqual(['600002-2026']);
		expect(leftOut).toEqual([{ notice: '600001-2026', reason: 'superseded by 600002-2026' }]);
	});

	it('reads the whole identifier of a successor link, so a hyphen inside it never splits it (override: notice block)', () => {
		const earlier = variant('600001-2026', { id: 'a1b2-c3d4-e5', version: '03', procedure: 'p1' });
		const elsewhere = variant('600002-2026', {
			id: 'f6a7',
			version: '01',
			procedure: 'p2',
			changes: ['c3d4-e5-03', 'a1b2-c3d4-03', 'a1b2-c3d4-e5-02']
		});
		const { kept, leftOut } = selectLatest([earlier, elsewhere]);
		expect(numbers(kept)).toEqual(['600001-2026', '600002-2026']);
		expect(leftOut).toEqual([]);
	});

	it('reads the VersionID in a successor link as an integer, so -3 names VersionID 03 (override: notice block)', () => {
		const earlier = variant('600001-2026', { id: 'a1b2-c3d4-e5', version: '03', procedure: 'p1' });
		const change = variant('600002-2026', {
			id: 'f6a7',
			version: '01',
			procedure: 'p2',
			changes: ['a1b2-c3d4-e5-3']
		});
		const { kept, leftOut } = selectLatest([earlier, change]);
		expect(numbers(kept)).toEqual(['600002-2026']);
		expect(leftOut).toEqual([{ notice: '600001-2026', reason: 'superseded by 600002-2026' }]);
	});

	it('names no notice with a successor link that has no digits after its last hyphen (override: notice block)', () => {
		const earlier = variant('600001-2026', { id: 'a1b2-c3d4-e5', version: '03', procedure: 'p1' });
		const change = variant('600002-2026', {
			id: 'f6a7',
			version: '01',
			procedure: 'p2',
			changes: ['a1b2-c3d4-e5', 'a1b2-c3d4-e5-', 'a1b2-c3d4-e5-v3']
		});
		const { kept, leftOut } = selectLatest([earlier, change]);
		expect(numbers(kept)).toEqual(['600001-2026', '600002-2026']);
		expect(leftOut).toEqual([]);
	});

	it('never leaves out a notice for naming its own version as the one it changes (override: notice block)', () => {
		const record = variant('600001-2026', { id: 'own-id', version: '02', changes: ['own-id-02'] });
		expect(selectLatest([record])).toEqual({ kept: [record], leftOut: [], sameProcedure: [] });
	});

	it('leaves out a notice whose change reasons include cancel as cancelled', () => {
		const { kept, leftOut } = selectLatest([CANCEL]);
		expect(kept).toEqual([]);
		expect(leftOut).toEqual([{ notice: '600017-2026', reason: 'cancelled' }]);
	});

	it('drops both a cancelling change notice and the version it names (override: notice block)', () => {
		const predecessor = variant('599990-2026', {
			id: '54426929-1700-4c06-bc98-4f41506ab64f',
			version: '01'
		});
		const { kept, leftOut } = selectLatest([CANCEL, predecessor]);
		expect(kept).toEqual([]);
		expect(leftOut).toEqual([
			{ notice: '599990-2026', reason: 'superseded by 600017-2026' },
			{ notice: '600017-2026', reason: 'cancelled' }
		]);
	});

	it('gives a notice left out by two rules the first reason: superseded, then duplicate, then cancelled (override: changeReasons)', () => {
		const older = variant('600001-2026', { id: 'shared-id', version: '01' }, ['cancel']);
		const twin = variant('600002-2026', { id: 'shared-id', version: '02' }, ['cancel']);
		const newest = variant('600003-2026', { id: 'shared-id', version: '02' });
		const { kept, leftOut } = selectLatest([older, twin, newest]);
		expect(numbers(kept)).toEqual(['600003-2026']);
		expect(leftOut).toEqual([
			{ notice: '600001-2026', reason: 'superseded by 600003-2026' },
			{ notice: '600002-2026', reason: 'duplicate of 600003-2026' }
		]);
	});

	it('keeps a change notice that gives no change reason', () => {
		const record = readRole('change-no-reason');
		expect(record.changeReasons).toEqual([]);
		expect(record.notice.changes).toHaveLength(1);
		expect(numbers(selectLatest([record]).kept)).toEqual(['600017-2026']);
	});

	it('keeps a susp-review notice with no mark (override: changeReasons)', () => {
		const record = variant('600001-2026', {}, ['susp-review']);
		expect(selectLatest([record])).toEqual({ kept: [record], leftOut: [], sameProcedure: [] });
	});

	it('keeps the cancel-intent notice, whose mark belongs to the list', () => {
		const record = readRole('cancel-intent-notice');
		expect(record.changeReasons).toEqual(['cancel-intent']);
		expect(selectLatest([record])).toEqual({ kept: [record], leftOut: [], sameProcedure: [] });
	});

	it('keeps notices that share a procedure and reports each group in sameProcedure (override: notice block)', () => {
		const a = variant('600009-2026', { id: 'id-a', procedure: 'shared-procedure' });
		const b = variant('600002-2026', { id: 'id-b', procedure: 'shared-procedure' });
		const c = variant('600003-2026', { id: 'id-c', procedure: 'own-procedure' });
		const { kept, leftOut, sameProcedure } = selectLatest([a, b, c]);
		expect(numbers(kept)).toEqual(['600002-2026', '600003-2026', '600009-2026']);
		expect(leftOut).toEqual([]);
		expect(sameProcedure).toEqual([['600002-2026', '600009-2026']]);
	});

	it('lists kept notices by year, then by running number as a number (override: number)', () => {
		const records = ['10-2027', '600000-2026', '9-2027', '99999-2026'].map((number, at) =>
			variant(number, { id: `id-${at}`, procedure: `procedure-${at}` })
		);
		expect(numbers(selectLatest(records).kept)).toEqual([
			'99999-2026',
			'600000-2026',
			'9-2027',
			'10-2027'
		]);
	});

	const ORDER_SET = [
		LATEST,
		SUPERSEDED,
		variant('600001-2026', { id: 'shared-id', version: '02' }),
		variant('600010-2026', { id: 'shared-id', version: '02' }),
		CANCEL,
		variant('599990-2026', { id: '54426929-1700-4c06-bc98-4f41506ab64f', version: '01' }),
		variant('600020-2026', { id: 'id-a', procedure: 'shared-procedure' }),
		variant('600021-2026', { id: 'id-b', procedure: 'shared-procedure' })
	];

	test.prop([fc.shuffledSubarray(ORDER_SET, { minLength: ORDER_SET.length })])(
		'the kept set does not depend on input order',
		(shuffled) => {
			expect(selectLatest(shuffled)).toEqual(selectLatest(ORDER_SET));
		}
	);
});
