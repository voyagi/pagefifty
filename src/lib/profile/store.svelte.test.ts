import { describe, expect, it, vi } from 'vitest';
import { canonicalStoredJson } from './canonical';
import { emptyProfile, type Profile, type StoredProfile } from './schema';
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

	it("applies a one-field change to what storage holds now, keeping another tab's newer field", () => {
		const storage = new CountingStorage();
		const here = createProfileStore(storage);
		const there = createProfileStore(storage);
		here.load();
		there.load();
		const withYears = { ...emptyProfile(), completedFinancialYears: 6 };
		expect(there.saveProfile(withYears, FIRST)).toBe('saved');
		const setStaff = (current: Profile) => ({ ...current, staff: { ...current.staff, total: 19 } });
		expect(here.updateProfile(setStaff, LATER)).toBe('saved');
		const kept = JSON.parse(storage.getItem(PROFILE_KEY) ?? 'null').profile;
		expect([kept.completedFinancialYears, kept.staff.total]).toEqual([6, 19]);
	});

	it('refuses a one-field change that breaks the schema, writing nothing', () => {
		const storage = new CountingStorage();
		const store = createProfileStore(storage);
		store.load();
		const repeatYear = (current: Profile) => ({
			...current,
			turnover: [
				{ year: 2024, generalNet: 1, specific: [] },
				{ year: 2024, generalNet: 2, specific: [] }
			]
		});
		expect(store.updateProfile(repeatYear, FIRST)).toBe('invalid');
		expect(storage.setCalls).toBe(0);
	});

	it('answers unchanged to a one-field change while the demo firm is shown', () => {
		const storage = new CountingStorage();
		const store = createProfileStore(storage);
		store.load();
		store.useDemo();
		const change = (current: Profile) => ({ ...current, completedFinancialYears: 3 });
		expect(store.updateProfile(change, FIRST)).toBe('unchanged');
		expect(storage.getItem(PROFILE_KEY)).toBeNull();
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

	it('saves again once the newer profile is gone from storage', () => {
		const storage = new CountingStorage();
		storage.values.set(PROFILE_KEY, JSON.stringify({ schemaVersion: 2, profile: {} }));
		const store = createProfileStore(storage);
		store.load();
		expect(store.saveProfile(withStaff(19), FIRST)).toBe('newer-version');
		storage.values.delete(PROFILE_KEY);
		expect(store.saveProfile(withStaff(19), LATER)).toBe('saved');
		expect(store.newerVersion).toBeNull();
		expect(JSON.parse(storage.getItem(PROFILE_KEY) ?? 'null').profile.staff.total).toBe(19);
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
		expect(store.saveProfile(withStaff(-1), FIRST)).toBe('invalid');
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

class KeyLoggingStorage extends CountingStorage {
	readonly writtenKeys: string[] = [];
	setItem(key: string, value: string) {
		this.writtenKeys.push(key);
		super.setItem(key, value);
	}
}

class WriteBlockedStorage extends CountingStorage {
	setItem(): void {
		throw new DOMException('full', 'QuotaExceededError');
	}
}

const storedOf = (profile: Profile, savedAt = FIRST): StoredProfile => ({
	schemaVersion: 1,
	savedAt: savedAt.toISOString(),
	lastExportedAt: null,
	profile
});

function savedStore() {
	const storage = new KeyLoggingStorage();
	const store = createProfileStore(storage);
	store.load();
	store.saveProfile(withStaff(19), FIRST);
	return { storage, store };
}

function storageEvent(key: string | null, newValue: string | null) {
	return new StorageEvent('storage', { key, newValue });
}

// What another tab's write looks like from here: storage holds the value first, then the event
// arrives. A null value removes the key, and a null key is a clear, which empties storage.
function otherTabWrites(
	storage: CountingStorage,
	target: EventTarget,
	key: string | null,
	newValue: string | null
) {
	if (key === null) storage.values.clear();
	else if (newValue === null) storage.values.delete(key);
	else storage.values.set(key, newValue);
	target.dispatchEvent(storageEvent(key, newValue));
}

describe('the demo firm slot', () => {
	it('starts on the own firm with nothing stored', () => {
		const store = createProfileStore(new CountingStorage());
		store.load();
		expect(store.activeFirm).toBe('own');
	});

	it('reads the stored active firm on load', () => {
		const storage = new CountingStorage();
		storage.values.set(ACTIVE_FIRM_KEY, 'demo');
		const store = createProfileStore(storage);
		store.load();
		expect(store.activeFirm).toBe('demo');
	});

	it('reads an unknown active firm value as own', () => {
		const storage = new CountingStorage();
		storage.values.set(ACTIVE_FIRM_KEY, 'Demo');
		const store = createProfileStore(storage);
		store.load();
		expect(store.activeFirm).toBe('own');
	});

	it('writes only the active-firm key, and the own profile keeps its bytes through a demo and back', () => {
		const { storage, store } = savedStore();
		const before = storage.getItem(PROFILE_KEY);
		storage.writtenKeys.length = 0;
		store.useDemo();
		expect(store.activeFirm).toBe('demo');
		expect(storage.getItem(ACTIVE_FIRM_KEY)).toBe('demo');
		store.backToOwn();
		expect(store.activeFirm).toBe('own');
		expect(storage.getItem(ACTIVE_FIRM_KEY)).toBe('own');
		expect(storage.writtenKeys).toEqual([ACTIVE_FIRM_KEY, ACTIVE_FIRM_KEY]);
		expect(storage.getItem(PROFILE_KEY)).toBe(before);
	});

	it('switches in memory, without throwing, when storage refuses the write', () => {
		const store = createProfileStore(new BlockedStorage());
		store.load();
		expect(() => store.useDemo()).not.toThrow();
		expect(store.activeFirm).toBe('demo');
		expect(() => store.backToOwn()).not.toThrow();
		expect(store.activeFirm).toBe('own');
	});

	it('never writes the own profile from a save made while the demo firm is active', () => {
		const { storage, store } = savedStore();
		const before = storage.getItem(PROFILE_KEY);
		store.useDemo();
		expect(store.saveProfile(withStaff(99), LATER)).toBe('unchanged');
		expect(storage.getItem(PROFILE_KEY)).toBe(before);
	});
});

describe('markExported', () => {
	it('stamps lastExportedAt with one write', () => {
		const { storage, store } = savedStore();
		const writes = storage.setCalls;
		expect(store.markExported(LATER)).toBe('saved');
		expect(storage.setCalls).toBe(writes + 1);
		expect(store.stored?.lastExportedAt).toBe(LATER.toISOString());
		expect(JSON.parse(storage.getItem(PROFILE_KEY) ?? 'null').lastExportedAt).toBe(
			LATER.toISOString()
		);
		expect(store.stored?.savedAt).toBe(FIRST.toISOString());
	});

	it('does nothing while the demo firm is active', () => {
		const { storage, store } = savedStore();
		store.useDemo();
		const writes = storage.setCalls;
		expect(store.markExported(LATER)).toBe('unchanged');
		expect(storage.setCalls).toBe(writes);
		expect(store.stored?.lastExportedAt).toBeNull();
	});

	it('does nothing when no profile is saved', () => {
		const storage = new CountingStorage();
		const store = createProfileStore(storage);
		store.load();
		expect(store.markExported(LATER)).toBe('unchanged');
		expect(storage.setCalls).toBe(0);
	});

	it('never stamps a profile saved by a newer schema version', () => {
		const storage = new CountingStorage();
		const newer = JSON.stringify({ schemaVersion: 2, profile: {} });
		storage.values.set(PROFILE_KEY, newer);
		const store = createProfileStore(storage);
		store.load();
		expect(store.markExported(LATER)).toBe('newer-version');
		expect(storage.getItem(PROFILE_KEY)).toBe(newer);
	});

	it('reports a refused write as failed, without throwing', () => {
		const storage = new WriteBlockedStorage();
		storage.values.set(PROFILE_KEY, JSON.stringify(storedOf(withStaff(19))));
		const store = createProfileStore(storage);
		store.load();
		expect(store.markExported(LATER)).toBe('failed');
		expect(store.stored?.lastExportedAt).toBeNull();
	});
});

describe('replaceFromImport', () => {
	it('replaces the stored profile whole with one write of the canonical bytes', () => {
		const { storage, store } = savedStore();
		const writes = storage.setCalls;
		const imported = storedOf(
			{ ...emptyProfile(), certificates: [{ standard: 'ISO 9001' }], languages: ['de'] },
			LATER
		);
		expect(store.replaceFromImport(imported)).toBe('saved');
		expect(storage.setCalls).toBe(writes + 1);
		expect(storage.getItem(PROFILE_KEY)).toBe(canonicalStoredJson(imported));
		expect(store.stored).toEqual(imported);
		expect(store.stored?.profile.staff.total).toBeUndefined();
	});

	it('still replaces the own profile when the read ends after a switch to the demo, keeping the demo shown', () => {
		const { storage, store } = savedStore();
		store.useDemo();
		const imported = storedOf(withStaff(42), LATER);
		expect(store.replaceFromImport(imported)).toBe('saved');
		expect(storage.getItem(PROFILE_KEY)).toBe(canonicalStoredJson(imported));
		expect(store.stored).toEqual(imported);
		expect([store.activeFirm, storage.getItem(ACTIVE_FIRM_KEY)]).toEqual(['demo', 'demo']);
	});

	it('refuses a value that is not a valid stored profile and writes nothing', () => {
		const { storage, store } = savedStore();
		const before = storage.getItem(PROFILE_KEY);
		const broken = { ...storedOf(withStaff(19)), extra: true } as unknown as StoredProfile;
		expect(store.replaceFromImport(broken)).toBe('invalid');
		expect(storage.getItem(PROFILE_KEY)).toBe(before);
	});

	it('never writes over a profile saved by a newer schema version', () => {
		const storage = new CountingStorage();
		const newer = JSON.stringify({ schemaVersion: 2, profile: {} });
		storage.values.set(PROFILE_KEY, newer);
		const store = createProfileStore(storage);
		store.load();
		expect(store.replaceFromImport(storedOf(withStaff(19)))).toBe('newer-version');
		expect(storage.getItem(PROFILE_KEY)).toBe(newer);
	});

	it('reports a refused write as failed, without throwing', () => {
		const store = createProfileStore(new BlockedStorage());
		store.load();
		expect(store.replaceFromImport(storedOf(withStaff(19)))).toBe('failed');
		expect(store.stored).toBeNull();
	});
});

describe('listen', () => {
	it('takes a valid profile another tab stored', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		const other = storedOf(withStaff(42), LATER);
		otherTabWrites(storage, target, PROFILE_KEY, canonicalStoredJson(other));
		expect(store.stored).toEqual(other);
	});

	// The next save builds on what storage holds, so the page shows what a reload would read: junk,
	// an invalid envelope or a removal leaves nothing saved, never a profile only this page still has.
	it.each([
		['junk', '{'],
		['an invalid envelope', JSON.stringify(storedOf(withStaff(-1)))],
		['a removed profile', null]
	])('reads %s from another tab as nothing saved, as a reload would', (_what, newValue) => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		otherTabWrites(storage, target, PROFILE_KEY, newValue);
		expect(store.stored).toBeNull();
		expect(createProfileStore(storage).load()).toBeNull();
	});

	it('never brings back a profile another tab removed when this page saves a field', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		otherTabWrites(storage, target, PROFILE_KEY, null);
		const setYears = (current: Profile) => ({ ...current, completedFinancialYears: 3 });
		expect(store.updateProfile(setYears, LATER)).toBe('saved');
		const kept = JSON.parse(storage.getItem(PROFILE_KEY) ?? 'null').profile;
		expect([kept.completedFinancialYears, kept.staff.total]).toEqual([3, undefined]);
		expect(store.stored?.profile).toEqual(kept);
	});

	it('clears the newer-version note once another tab removes that profile', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		otherTabWrites(storage, target, PROFILE_KEY, JSON.stringify({ schemaVersion: 3 }));
		otherTabWrites(storage, target, PROFILE_KEY, null);
		expect([store.newerVersion, store.stored]).toEqual([null, null]);
	});

	it('ignores an event for another key', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		const before = store.stored;
		const other = canonicalStoredJson(storedOf(withStaff(42), LATER));
		otherTabWrites(storage, target, 'pagefifty-profile-copy', other);
		expect(store.stored).toBe(before);
		expect(store.activeFirm).toBe('own');
	});

	it('follows a storage another tab cleared: nothing saved, and back on the own firm', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		store.useDemo();
		otherTabWrites(storage, target, null, null);
		expect([store.stored, store.activeFirm]).toEqual([null, 'own']);
	});

	it('notes a newer schema version another tab stored, keeping the profile it has', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		const before = store.stored;
		otherTabWrites(storage, target, PROFILE_KEY, JSON.stringify({ schemaVersion: 3 }));
		expect(store.newerVersion).toBe(3);
		expect(store.stored).toBe(before);
	});

	it('drops the newer-version note once another tab stores a profile this page reads', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		otherTabWrites(storage, target, PROFILE_KEY, JSON.stringify({ schemaVersion: 3 }));
		const other = storedOf(withStaff(42), LATER);
		otherTabWrites(storage, target, PROFILE_KEY, canonicalStoredJson(other));
		expect([store.newerVersion, store.stored]).toEqual([null, other]);
	});

	it('follows the active firm another tab picked, unknown values reading as own', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		otherTabWrites(storage, target, ACTIVE_FIRM_KEY, 'demo');
		expect(store.activeFirm).toBe('demo');
		otherTabWrites(storage, target, ACTIVE_FIRM_KEY, 'junk');
		expect(store.activeFirm).toBe('own');
	});

	it('stops following once the returned function is called', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		const stop = store.listen(target);
		stop();
		const before = store.stored;
		otherTabWrites(storage, target, PROFILE_KEY, canonicalStoredJson(storedOf(withStaff(42))));
		expect(store.stored).toBe(before);
	});

	// A storage event reports a write that may already be overtaken: this page can read that value
	// and save its own over it before the event is delivered.
	it('keeps its own later save when the event for an earlier write from another tab arrives after it', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		const earlier = canonicalStoredJson(storedOf(withStaff(42), FIRST));
		storage.values.set(PROFILE_KEY, earlier);
		expect(store.saveProfile(withStaff(20), LATER)).toBe('saved');
		target.dispatchEvent(storageEvent(PROFILE_KEY, earlier));
		expect(store.stored?.profile.staff.total).toBe(20);
	});

	it('keeps the firm this page switched to when the event for an earlier pick arrives after it', () => {
		const { storage, store } = savedStore();
		const target = new EventTarget();
		store.listen(target);
		storage.values.set(ACTIVE_FIRM_KEY, 'demo');
		store.backToOwn();
		target.dispatchEvent(storageEvent(ACTIVE_FIRM_KEY, 'demo'));
		expect(store.activeFirm).toBe('own');
	});
});

describe('two tabs and the order of saves', () => {
	it('shows the later of two saves to a fresh load', () => {
		const storage = new CountingStorage();
		const first = createProfileStore(storage);
		const second = createProfileStore(storage);
		first.load();
		second.load();
		first.saveProfile(withStaff(19), FIRST);
		second.saveProfile(withStaff(23), LATER);
		expect(createProfileStore(storage).load()?.profile.staff.total).toBe(23);
	});

	it('keeps certificate and language entry order through save and load', () => {
		const storage = new CountingStorage();
		const store = createProfileStore(storage);
		store.load();
		store.saveProfile(
			{
				...emptyProfile(),
				certificates: [{ standard: 'NEN 7510' }, { standard: 'BSI C5' }, { standard: 'ISO 9001' }],
				languages: ['fr', 'nl', 'de']
			},
			FIRST
		);
		const loaded = createProfileStore(storage).load();
		expect(loaded?.profile.certificates.map((entry) => entry.standard)).toEqual([
			'NEN 7510',
			'BSI C5',
			'ISO 9001'
		]);
		expect(loaded?.profile.languages).toEqual(['fr', 'nl', 'de']);
	});
});

describe('requestPersistOnce', () => {
	const persistingNavigator = () => ({ storage: { persist: vi.fn(async () => true) } });

	it('asks for persistent storage exactly once, after the first successful save', () => {
		const nav = persistingNavigator();
		const store = createProfileStore(new CountingStorage());
		store.load();
		store.requestPersistOnce(nav);
		expect(nav.storage.persist).not.toHaveBeenCalled();
		expect(store.saveProfile(withStaff(19), FIRST)).toBe('saved');
		store.requestPersistOnce(nav);
		expect(store.saveProfile(withStaff(20), LATER)).toBe('saved');
		store.requestPersistOnce(nav);
		expect(nav.storage.persist).toHaveBeenCalledTimes(1);
	});

	it('does not ask after a save that failed', () => {
		const nav = persistingNavigator();
		const store = createProfileStore(new BlockedStorage());
		store.load();
		expect(store.saveProfile(withStaff(19), FIRST)).toBe('failed');
		store.requestPersistOnce(nav);
		expect(nav.storage.persist).not.toHaveBeenCalled();
	});

	it.each([
		['no navigator', undefined],
		['no storage manager', {}],
		['a storage manager without persist', { storage: {} }]
	])('does nothing and does not throw with %s', (_what, nav) => {
		const { store } = savedStore();
		expect(() => store.requestPersistOnce(nav)).not.toThrow();
	});

	it('swallows a refused persist request', async () => {
		const persist = vi.fn(() => Promise.reject(new Error('denied')));
		const { store } = savedStore();
		store.requestPersistOnce({ storage: { persist } });
		await Promise.resolve();
		expect(persist).toHaveBeenCalledTimes(1);
	});

	it('survives a persist that throws instead of returning a promise', () => {
		const persist = vi.fn(() => {
			throw new TypeError('Illegal invocation');
		});
		const { store } = savedStore();
		expect(() => store.requestPersistOnce({ storage: { persist } })).not.toThrow();
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
