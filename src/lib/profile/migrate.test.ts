import { describe, expect, it, vi } from 'vitest';
import { MIGRATIONS, migrateToCurrent, migrateWith, type MigrationTable } from './migrate';
import { PROFILE_SCHEMA_VERSION, StoredProfileSchema, emptyProfile } from './schema';

const SAVED_AT = '2026-09-20T09:00:00.000Z';

const versionOne = () => ({
	schemaVersion: 1,
	savedAt: SAVED_AT,
	lastExportedAt: null,
	profile: emptyProfile()
});

// One sample file per schema version that ever existed, oldest first. A new version adds its
// sample here along with its step in MIGRATIONS.
const SAMPLES: Record<number, () => { schemaVersion: number } & Record<string, unknown>> = {
	1: versionOne
};

describe('MIGRATIONS', () => {
	it('holds one step for every version below the current one, and none beyond', () => {
		const expected = Array.from({ length: PROFILE_SCHEMA_VERSION - 1 }, (_, index) => index + 1);
		expect(Object.keys(MIGRATIONS).map(Number)).toEqual(expected);
	});

	it('has a sample file for every schema version up to the current one', () => {
		const expected = Array.from({ length: PROFILE_SCHEMA_VERSION }, (_, index) => index + 1);
		expect(Object.keys(SAMPLES).map(Number)).toEqual(expected);
	});

	it.each(Object.entries(SAMPLES))(
		'runs a version %s file forward to a valid current profile',
		(_version, sample) => {
			const migrated = migrateToCurrent(sample());
			expect(migrated.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
			expect(StoredProfileSchema.safeParse(migrated).success).toBe(true);
		}
	);
});

describe('migrateToCurrent', () => {
	it('returns a current-version document untouched, the same object', () => {
		const doc = versionOne();
		expect(migrateToCurrent(doc)).toBe(doc);
		expect(doc).toEqual(versionOne());
	});
});

describe('migrateWith', () => {
	it('calls no step when the document is already at the target version', () => {
		const step = vi.fn((doc) => doc);
		const doc = { schemaVersion: 3 };
		expect(migrateWith({ 1: step, 2: step }, doc, 3)).toBe(doc);
		expect(step).not.toHaveBeenCalled();
	});

	it('applies the steps in version order, each on the result of the one before', () => {
		const calls: number[] = [];
		const table: MigrationTable = {
			2: (doc) => {
				calls.push(2);
				return { ...doc, second: `after ${String(doc.first)}` };
			},
			1: (doc) => {
				calls.push(1);
				return { ...doc, first: 'one' };
			}
		};
		const result = migrateWith(table, { schemaVersion: 1 }, 3);
		expect(calls).toEqual([1, 2]);
		expect(result).toEqual({ schemaVersion: 3, first: 'one', second: 'after one' });
	});

	it('stamps each step with the version it produces, whatever the step returns', () => {
		const table: MigrationTable = { 1: (doc) => ({ ...doc, schemaVersion: 99 }) };
		expect(migrateWith(table, { schemaVersion: 1 }, 2).schemaVersion).toBe(2);
	});

	it('starts from the version the document declares, skipping older steps', () => {
		const older = vi.fn((doc) => doc);
		const newer = vi.fn((doc) => ({ ...doc, touched: true }));
		const result = migrateWith({ 1: older, 2: newer }, { schemaVersion: 2 }, 3);
		expect(older).not.toHaveBeenCalled();
		expect(newer).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ schemaVersion: 3, touched: true });
	});

	it('fails naming the version when a step is missing', () => {
		const table: MigrationTable = { 1: (doc) => doc };
		expect(() => migrateWith(table, { schemaVersion: 1 }, 3)).toThrow(/schemaVersion 2/);
	});
});
