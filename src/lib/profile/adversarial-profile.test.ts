// Hostile profile files at the import boundary and the verdict model's edges. A profile file is
// the firm's own, but it is read as untrusted, and a figure it smuggles past the schema would be
// compared as if the firm had reported it.
import { describe, expect, it } from 'vitest';
import { combineAll, combineAny, decideLot } from '../core/verdict';
import { createImportQueue, importProfileFile } from './import';
import { emptyProfile, PROFILE_SCHEMA_VERSION } from './schema';

const fileOf = (text: string) => ({
	name: 'profile.json',
	size: text.length,
	text: async () => text
});

const stored = (profile: unknown) =>
	JSON.stringify({
		schemaVersion: PROFILE_SCHEMA_VERSION,
		savedAt: '2026-10-22T18:00:00.000Z',
		lastExportedAt: null,
		profile
	});

describe('a profile file that smuggles a figure', () => {
	it('a yearly staff average of 1e999 (Infinity once parsed) is refused', async () => {
		const profile = emptyProfile();
		const text = stored(profile).replace(
			'"yearlyAverages":[]',
			'"yearlyAverages":[{"year":2025,"average":1e999}]'
		);
		expect(text).toContain('1e999');
		const result = await importProfileFile(fileOf(text));
		expect(result.ok).toBe(false);
	});

	it('a turnover of 1e999 is refused', async () => {
		const text = stored(emptyProfile()).replace(
			'"turnover":[]',
			'"turnover":[{"year":2025,"generalNet":1e999,"specific":[]}]'
		);
		expect((await importProfileFile(fileOf(text))).ok).toBe(false);
	});

	it.each([['2026-02-30'], ['2026-13-01'], ['2026-1-01']])(
		'a certificate valid until %s, no real day, is refused',
		async (day) => {
			const profile = {
				...emptyProfile(),
				certificates: [{ standard: 'ISO 9001', validUntil: day }]
			};
			expect((await importProfileFile(fileOf(stored(profile)))).ok).toBe(false);
		}
	);

	it('a __proto__ key is named, never applied', async () => {
		const text = stored(emptyProfile()).replace(
			'"countries":[]',
			'"countries":[],"__proto__":{"x":1}'
		);
		expect(text).toContain('__proto__');
		const result = await importProfileFile(fileOf(text));
		expect(result.ok).toBe(false);
	});

	it('a year listed twice is refused', async () => {
		const profile = {
			...emptyProfile(),
			turnover: [
				{ year: 2025, generalNet: 10, specific: [] },
				{ year: 2025, generalNet: 9_000_000, specific: [] }
			]
		};
		expect((await importProfileFile(fileOf(stored(profile)))).ok).toBe(false);
	});
});

describe('ESCALATION: two files picked back to back', () => {
	it('the second file stays stored even when the first reads slower', async () => {
		const applied: string[] = [];
		const queue = createImportQueue((profile) => applied.push(profile.savedAt));
		let release: () => void = () => {};
		const slowText = stored(emptyProfile());
		const slow = {
			name: 'slow.json',
			size: slowText.length,
			text: () =>
				new Promise<string>((resolve) => {
					release = () => resolve(slowText);
				})
		};
		const fastText = stored(emptyProfile()).replace(
			'2026-10-22T18:00:00.000Z',
			'2026-10-22T18:05:00.000Z'
		);
		const first = queue(slow);
		const second = queue(fileOf(fastText));
		await Promise.resolve();
		release();
		await Promise.all([first, second]);
		expect(applied).toEqual(['2026-10-22T18:00:00.000Z', '2026-10-22T18:05:00.000Z']);
	});

	it('a refused first file never blocks the second', async () => {
		const applied: string[] = [];
		const queue = createImportQueue((profile) => applied.push(profile.savedAt));
		const [first, second] = await Promise.all([
			queue(fileOf('{not json')),
			queue(fileOf(stored(emptyProfile())))
		]);
		expect(first.ok).toBe(false);
		expect(second.ok).toBe(true);
		expect(applied).toHaveLength(1);
	});
});

describe('the verdict model at its edges', () => {
	it('a lot with no criterion read never goes', () => {
		const lot = { states: [], facts: [], noticeIsOnlySource: true, pointsToDocuments: false };
		expect(decideLot(lot)).toEqual({ verdict: 'ASK FIRST', reason: 'no-criteria-in-notice' });
	});

	it('a clause with nothing to combine is not read, under either join', () => {
		expect(combineAll([])).toBe('NOT_READ');
		expect(combineAny([])).toBe('NOT_READ');
	});

	it('one shortfall outranks every reason except an intent to cancel', () => {
		const lot = {
			states: ['MET', 'SHORT_BORROWABLE', 'NOT_READ'] as const,
			facts: ['SOURCE_UNREAD'] as const,
			noticeIsOnlySource: false,
			pointsToDocuments: true,
			notCompared: true
		};
		expect(decideLot(lot)).toEqual({ verdict: 'PARTNER NEEDED' });
		expect(decideLot({ ...lot, cancelIntent: true })).toEqual({
			verdict: 'ASK FIRST',
			reason: 'cancel-intent'
		});
	});
});
