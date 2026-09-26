import { describe, expect, it } from 'vitest';
import { emptyProfile, type Profile } from './schema';
import {
	ACTIVE_FIRM_KEY,
	PROFILE_KEY,
	browserStorage,
	createProfileStore,
	isKeptInMemory
} from './store.svelte';

class CountingStorage implements Storage {
	readonly values = new Map<string, string>();
	setCalls = 0;
	get length() {
		return this.values.size;
	}
	clear() {
		this.values.clear();
	}
	getItem(key: string) {
		return this.values.get(key) ?? null;
	}
	key(index: number) {
		return [...this.values.keys()][index] ?? null;
	}
	removeItem(key: string) {
		this.values.delete(key);
	}
	setItem(key: string, value: string) {
		this.setCalls += 1;
		this.values.set(key, value);
	}
}

class BlockedStorage extends CountingStorage {
	getItem(): string | null {
		throw new DOMException('blocked', 'SecurityError');
	}
	setItem(): void {
		throw new DOMException('full', 'QuotaExceededError');
	}
}

const withStaff = (total: number | undefined): Profile => ({
	...emptyProfile(),
	staff: { ...emptyProfile().staff, total }
});

const FIRST = new Date('2026-09-25T10:00:00.000Z');
const LATER = new Date('2026-09-25T11:30:00.000Z');

describe('createProfileStore', () => {
	it('uses the hyphenated storage keys', () => {
		expect(PROFILE_KEY).toBe('pagefifty-profile');
		expect(ACTIVE_FIRM_KEY).toBe('pagefifty-active-firm');
	});

	it('reads nothing saved from empty storage', () => {
		const store = createProfileStore(new CountingStorage());
		expect(store.load()).toBeNull();
		expect(store.stored).toBeNull();
	});

	it('saves a profile as schema version 1 under the profile key', () => {
		const storage = new CountingStorage();
		const store = createProfileStore(storage);
		store.load();
		expect(store.saveProfile(withStaff(19), FIRST)).toBe('saved');
		const saved = JSON.parse(storage.getItem(PROFILE_KEY) ?? 'null');
		expect(saved).toMatchObject({
			schemaVersion: 1,
			savedAt: FIRST.toISOString(),
			lastExportedAt: null,
			profile: { staff: { total: 19 } }
		});
		expect(store.stored?.profile.staff.total).toBe(19);
	});

	it('writes once for two identical saves, byte-identical, keeping savedAt', () => {
		const storage = new CountingStorage();
		const store = createProfileStore(storage);
		store.load();
		store.saveProfile(withStaff(19), FIRST);
		const first = storage.getItem(PROFILE_KEY);
		expect(store.saveProfile(withStaff(19), LATER)).toBe('unchanged');
		expect(storage.setCalls).toBe(1);
		expect(storage.getItem(PROFILE_KEY)).toBe(first);
		expect(store.stored?.savedAt).toBe(FIRST.toISOString());
	});

	it('writes again and bumps savedAt when the profile changes', () => {
		const storage = new CountingStorage();
		const store = createProfileStore(storage);
		store.load();
		store.saveProfile(withStaff(19), FIRST);
		expect(store.saveProfile(withStaff(20), LATER)).toBe('saved');
		expect(storage.setCalls).toBe(2);
		expect(store.stored?.savedAt).toBe(LATER.toISOString());
	});

	it('reads back what an earlier page saved', () => {
		const storage = new CountingStorage();
		const writer = createProfileStore(storage);
		writer.load();
		writer.saveProfile(withStaff(19), FIRST);
		const reader = createProfileStore(storage);
		expect(reader.load()?.profile.staff.total).toBe(19);
		expect(reader.saveProfile(withStaff(19), LATER)).toBe('unchanged');
		expect(storage.setCalls).toBe(1);
	});

	it.each([
		['not JSON', '{'],
		[
			'another schema version',
			'{"schemaVersion":2,"savedAt":"2026-09-25T10:00:00.000Z","lastExportedAt":null,"profile":{}}'
		],
		[
			'an invalid profile',
			JSON.stringify({
				schemaVersion: 1,
				savedAt: FIRST.toISOString(),
				lastExportedAt: null,
				profile: { staff: { total: -1 } }
			})
		]
	])('reads %s as nothing saved', (_what, raw) => {
		const storage = new CountingStorage();
		storage.values.set(PROFILE_KEY, raw);
		expect(createProfileStore(storage).load()).toBeNull();
	});

	it('never writes over a profile saved by a newer schema version', () => {
		const storage = new CountingStorage();
		const newer = JSON.stringify({ schemaVersion: 2, savedAt: FIRST.toISOString(), profile: {} });
		storage.values.set(PROFILE_KEY, newer);
		const store = createProfileStore(storage);
		expect(store.load()).toBeNull();
		expect(store.newerVersion).toBe(2);
		expect(store.saveProfile(withStaff(19), LATER)).toBe('newer-version');
		expect(storage.setCalls).toBe(0);
		expect(storage.getItem(PROFILE_KEY)).toBe(newer);
	});

	it('compares a save with what storage holds now, not with what this page last wrote', () => {
		const storage = new CountingStorage();
		const first = createProfileStore(storage);
		const second = createProfileStore(storage);
		first.load();
		second.load();
		expect(first.saveProfile(withStaff(19), FIRST)).toBe('saved');
		expect(second.saveProfile(withStaff(20), LATER)).toBe('saved');
		expect(first.saveProfile(withStaff(19), LATER)).toBe('saved');
		expect(JSON.parse(storage.getItem(PROFILE_KEY) ?? 'null').profile.staff.total).toBe(19);
		expect(first.stored?.savedAt).toBe(LATER.toISOString());
	});

	it('never writes over a newer profile another tab saved after this page loaded', () => {
		const storage = new CountingStorage();
		const store = createProfileStore(storage);
		store.load();
		expect(store.saveProfile(withStaff(19), FIRST)).toBe('saved');
		const newer = JSON.stringify({ schemaVersion: 2, savedAt: LATER.toISOString(), profile: {} });
		storage.values.set(PROFILE_KEY, newer);
		expect(store.saveProfile(withStaff(19), LATER)).toBe('newer-version');
		expect(store.saveProfile(withStaff(20), LATER)).toBe('newer-version');
		expect(store.newerVersion).toBe(2);
		expect(storage.setCalls).toBe(1);
		expect(storage.getItem(PROFILE_KEY)).toBe(newer);
	});

	it.each([
		['not JSON', '{'],
		['JSON null', 'null'],
		['a list', '[2]'],
		['a version that is not a whole number', '{"schemaVersion":1.5,"profile":{}}'],
		['a version written as text', '{"schemaVersion":"2","profile":{}}'],
		['an invalid version 1 profile', '{"schemaVersion":1,"profile":{"staff":{"total":-1}}}']
	])('replaces %s on the first save, which no version can read', (_what, raw) => {
		const storage = new CountingStorage();
		storage.values.set(PROFILE_KEY, raw);
		const store = createProfileStore(storage);
		expect(store.load()).toBeNull();
		expect(store.newerVersion).toBeNull();
		expect(store.saveProfile(withStaff(19), FIRST)).toBe('saved');
		expect(JSON.parse(storage.getItem(PROFILE_KEY) ?? 'null').profile.staff.total).toBe(19);
	});

	it('reads a stored value carrying a __proto__ key as nothing saved, and pollutes nothing', () => {
		const storage = new CountingStorage();
		storage.values.set(
			PROFILE_KEY,
			`{"__proto__":{"polluted":"yes"},"schemaVersion":1,"savedAt":"${FIRST.toISOString()}","lastExportedAt":null,"profile":${JSON.stringify(emptyProfile())}}`
		);
		const store = createProfileStore(storage);
		expect(store.load()).toBeNull();
		expect(store.newerVersion).toBeNull();
		expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
	});

	it('refuses to save an invalid profile and writes nothing', () => {
		const storage = new CountingStorage();
		const store = createProfileStore(storage);
		store.load();
		expect(store.saveProfile(withStaff(-1), FIRST)).toBe('failed');
		expect(storage.setCalls).toBe(0);
	});

	it('reports a failed save over storage that throws, and never throws', () => {
		const store = createProfileStore(new BlockedStorage());
		expect(() => store.load()).not.toThrow();
		expect(store.load()).toBeNull();
		expect(store.saveProfile(withStaff(19), FIRST)).toBe('failed');
		expect(store.stored).toBeNull();
	});
});

describe('browserStorage', () => {
	it('returns the window storage when it can be read', () => {
		expect(browserStorage()).toBe(window.localStorage);
		expect(isKeptInMemory(browserStorage())).toBe(false);
	});

	it('returns a working in-memory stand-in when reading localStorage throws', () => {
		const blocked = {
			get localStorage(): Storage {
				throw new DOMException('blocked', 'SecurityError');
			}
		};
		const storage = browserStorage(blocked);
		expect(storage).not.toBe(window.localStorage);
		expect(isKeptInMemory(storage)).toBe(true);
		storage.setItem(PROFILE_KEY, 'x');
		expect(storage.getItem(PROFILE_KEY)).toBe('x');
		expect(storage.length).toBe(1);
		expect(storage.key(0)).toBe(PROFILE_KEY);
		storage.removeItem(PROFILE_KEY);
		expect(storage.getItem(PROFILE_KEY)).toBeNull();
		storage.setItem('a', '1');
		storage.clear();
		expect(storage.length).toBe(0);
	});

	// Firefox answers null rather than throwing when storage is switched off (dom.storage.enabled).
	it('returns the in-memory stand-in when localStorage reads as null', () => {
		const storage = browserStorage({ localStorage: null as unknown as Storage });
		expect(storage).not.toBeNull();
		expect(isKeptInMemory(storage)).toBe(true);
	});
});
