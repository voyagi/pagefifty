import { describe, expect, it } from 'vitest';
import { hitVersion, outdatedByFailed } from './failed-versions.ts';

const PAIR_ID = 'ad28f539-52a7-4def-81b0-b09c8a77968a';

const hit = (fields: Record<string, unknown>) => ({
	'publication-number': '600367-2026',
	...fields
});

const kept = (noticeNumber: string, id: string, version: string) => ({
	noticeNumber,
	notice: { id, version }
});

const failed = (notice: string, fields: Record<string, unknown>) => ({
	notice,
	hit: { 'publication-number': notice, ...fields }
});

describe('hitVersion', () => {
	it('reads a version TED sends as a number', () => {
		expect(hitVersion(hit({ 'notice-identifier': PAIR_ID, 'notice-version': 2 }))).toEqual({
			id: PAIR_ID,
			version: 2
		});
	});

	it('reads a version TED sends as a digit string, as an integer', () => {
		expect(hitVersion(hit({ 'notice-identifier': PAIR_ID, 'notice-version': '02' }))).toEqual({
			id: PAIR_ID,
			version: 2
		});
	});

	it.each([undefined, null, '', 'two', -1, '-1', 1.5, '1.5', [2], ' 2'])(
		'reads no version from notice-version %j',
		(value) => {
			expect(hitVersion(hit({ 'notice-identifier': PAIR_ID, 'notice-version': value }))).toBe(
				undefined
			);
		}
	);

	it.each([undefined, '', 7])('reads no version without a notice identifier (%j)', (value) => {
		expect(hitVersion(hit({ 'notice-identifier': value, 'notice-version': 2 }))).toBe(undefined);
	});
});

describe('outdatedByFailed', () => {
	it('leaves out a kept notice whose newer version failed, naming that version', () => {
		expect(
			outdatedByFailed(
				[kept('600457-2026', 'other', '01'), kept('601147-2026', PAIR_ID, '01')],
				[failed('600367-2026', { 'notice-identifier': PAIR_ID, 'notice-version': 2 })]
			)
		).toEqual([
			{ notice: '601147-2026', reason: 'a newer version (600367-2026, version 2) failed' }
		]);
	});

	it.each([1, '01', 0])(
		'changes nothing for a failed hit of the same or a lower version (%j)',
		(version) => {
			expect(
				outdatedByFailed(
					[kept('601147-2026', PAIR_ID, '01')],
					[failed('600367-2026', { 'notice-identifier': PAIR_ID, 'notice-version': version })]
				)
			).toEqual([]);
		}
	);

	it('compares versions as integers, so version 10 is newer than version 9', () => {
		expect(
			outdatedByFailed(
				[kept('601147-2026', PAIR_ID, '9')],
				[failed('600367-2026', { 'notice-identifier': PAIR_ID, 'notice-version': '10' })]
			)
		).toEqual([
			{ notice: '601147-2026', reason: 'a newer version (600367-2026, version 10) failed' }
		]);
	});

	it('changes nothing for a failed hit of another notice', () => {
		expect(
			outdatedByFailed(
				[kept('601147-2026', PAIR_ID, '01')],
				[failed('600367-2026', { 'notice-identifier': 'another', 'notice-version': 5 })]
			)
		).toEqual([]);
	});

	it('changes nothing for a failed hit with no usable identifier or version', () => {
		expect(
			outdatedByFailed(
				[kept('601147-2026', PAIR_ID, '01')],
				[
					failed('600367-2026', { 'notice-identifier': PAIR_ID }),
					failed('600368-2026', { 'notice-version': 3 }),
					failed('600369-2026', { 'notice-identifier': PAIR_ID, 'notice-version': 'three' })
				]
			)
		).toEqual([]);
	});

	it('names the newest of several failed versions', () => {
		expect(
			outdatedByFailed(
				[kept('601147-2026', PAIR_ID, '01')],
				[
					failed('600367-2026', { 'notice-identifier': PAIR_ID, 'notice-version': 2 }),
					failed('600999-2026', { 'notice-identifier': PAIR_ID, 'notice-version': 3 })
				]
			)
		).toEqual([
			{ notice: '601147-2026', reason: 'a newer version (600999-2026, version 3) failed' }
		]);
	});
});
