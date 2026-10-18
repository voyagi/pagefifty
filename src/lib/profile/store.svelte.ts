// The firm profile as this browser holds it. Nothing here touches storage at import time: the page
// creates the store after mount with browserStorage(), so a server render never reads or writes a
// profile. Every storage call is wrapped, because a browser can block storage or refuse a write.
import { canonicalStoredJson } from './canonical';
import {
	PROFILE_SCHEMA_VERSION,
	ProfileSchema,
	StoredProfileSchema,
	emptyProfile,
	type Profile,
	type StoredProfile
} from './schema';

export const PROFILE_KEY = 'pagefifty-profile';
export const ACTIVE_FIRM_KEY = 'pagefifty-active-firm';

// failed: the browser refused the write. invalid: the profile schema refused the change, so nothing
// was written; a page must never word it as the browser refusing.
export type SaveResult = 'saved' | 'unchanged' | 'failed' | 'invalid' | 'newer-version';
export type ActiveFirm = 'own' | 'demo';
export type RemoveResult = 'removed' | 'nothing-stored' | 'failed';

// The part of navigator this store uses; absent where the browser has no Storage API manager.
export interface PersistCapableNavigator {
	readonly storage?: { persist?: () => Promise<boolean> };
}

// window in the page; any EventTarget in tests.
export interface StorageEventSource {
	addEventListener(type: 'storage', listener: (event: Event) => void): void;
	removeEventListener(type: 'storage', listener: (event: Event) => void): void;
}

type StoredRead =
	{ kind: 'none' } | { kind: 'read'; stored: StoredProfile } | { kind: 'newer'; version: number };

// A missing, unreadable or invalid stored value reads as nothing saved, never a partial profile.
// One written by a newer schema version is set apart: this page cannot read it, and a save would
// destroy a profile a newer Pagefifty can, so the store refuses to write over it.
function parseStored(raw: string | null): StoredRead {
	if (raw === null) return { kind: 'none' };
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { kind: 'none' };
	}
	const parsed = StoredProfileSchema.safeParse(value);
	if (parsed.success) return { kind: 'read', stored: parsed.data };
	const version = isNode(value) ? value.schemaVersion : undefined;
	return typeof version === 'number' &&
		Number.isInteger(version) &&
		version > PROFILE_SCHEMA_VERSION
		? { kind: 'newer', version }
		: { kind: 'none' };
}

function isNode(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const readFirm = (raw: string | null): ActiveFirm => (raw === 'demo' ? 'demo' : 'own');

function readKey(storage: Storage, key: string): string | null {
	try {
		return storage.getItem(key);
	} catch {
		return null;
	}
}

export function createProfileStore(storage: Storage) {
	let stored = $state<StoredProfile | null>(null);
	let newerVersion = $state<number | null>(null);
	let activeFirm = $state<ActiveFirm>('own');
	let hasSaved = false;
	let persistRequested = false;

	// Another tab can write after this page loaded (a newer Pagefifty left open across a release, or
	// the same page open twice), so every write first reads what storage holds now.
	function readCurrent(): StoredRead {
		const current = parseStored(readKey(storage, PROFILE_KEY));
		newerVersion = current.kind === 'newer' ? current.version : null;
		return current;
	}

	function write(next: StoredProfile): SaveResult {
		try {
			storage.setItem(PROFILE_KEY, canonicalStoredJson(next));
		} catch {
			return 'failed';
		}
		stored = next;
		hasSaved = true;
		return 'saved';
	}

	function load(): StoredProfile | null {
		const read = readCurrent();
		stored = read.kind === 'read' ? read.stored : null;
		activeFirm = readFirm(readKey(storage, ACTIVE_FIRM_KEY));
		return stored;
	}

	// Writes only when the profile itself changed, so savedAt means the last real change and an
	// unchanged save leaves the stored bytes alone. While the demo firm is shown nothing the page
	// saves may reach the own profile, whatever called it. The change is applied to the profile
	// storage holds now, never to this page's copy of it.
	function saveChange(change: (current: Profile) => Profile, now: Date): SaveResult {
		if (activeFirm === 'demo') return 'unchanged';
		const current = readCurrent();
		if (current.kind === 'newer') return 'newer-version';
		const base = current.kind === 'read' ? current.stored.profile : emptyProfile();
		stored = current.kind === 'read' ? current.stored : null;
		const parsed = ProfileSchema.safeParse(change(base));
		if (!parsed.success) return 'invalid';
		if (
			stored &&
			canonicalStoredJson({ ...stored, profile: parsed.data }) === canonicalStoredJson(stored)
		) {
			return 'unchanged';
		}
		return write({
			schemaVersion: PROFILE_SCHEMA_VERSION,
			savedAt: now.toISOString(),
			lastExportedAt: stored?.lastExportedAt ?? null,
			profile: parsed.data
		});
	}

	// The whole profile as given, whatever storage holds.
	function saveProfile(profile: Profile, now: Date): SaveResult {
		return saveChange(() => profile, now);
	}

	// One field's change, applied to the profile storage holds at this moment, so a field another
	// tab saved before it is kept even when that tab's storage event has not arrived yet. Storage
	// cannot read and write as one step across tabs, so two tabs saving in the same instant can still
	// race, and the later write wins.
	function updateProfile(change: (current: Profile) => Profile, now: Date): SaveResult {
		return saveChange(change, now);
	}

	function markExported(now: Date): SaveResult {
		if (activeFirm === 'demo') return 'unchanged';
		const current = readCurrent();
		if (current.kind === 'newer') return 'newer-version';
		if (current.kind === 'none') return 'unchanged';
		return write({ ...current.stored, lastExportedAt: now.toISOString() });
	}

	// The whole stored profile is replaced in one write, never merged with what was there. Unlike a
	// save, it is not refused while the demo firm is shown: the file is the user's own profile, never
	// demo figures, and a read that finishes after a switch to the demo must not drop the file they
	// picked. The view stays on the demo until they go back. The file's savedAt is kept as it is (the
	// profile's last change, wherever that was), so a status built from savedAt after an import must
	// never call that time a save in this browser.
	function replaceFromImport(next: StoredProfile): SaveResult {
		const valid = StoredProfileSchema.safeParse(next);
		if (!valid.success) return 'invalid';
		if (readCurrent().kind === 'newer') return 'newer-version';
		return write(valid.data);
	}

	// The active firm is written only under its own key, so showing the demo firm can never touch
	// the stored own profile; with storage blocked the switch still holds for this page view.
	function setActiveFirm(firm: ActiveFirm) {
		activeFirm = firm;
		try {
			storage.setItem(ACTIVE_FIRM_KEY, firm);
		} catch {
			// Kept in memory only.
		}
	}

	// A storage event says a key changed in another tab, and it can arrive after this page has read
	// that change and written over it. So it is only a notice: the key is filtered exactly and read
	// again from storage. The profile shown is then what a reload would read, because the next save
	// builds on storage: a valid envelope replaces it, and junk, an invalid envelope or a removal
	// leave nothing saved rather than a profile only this page still holds. A newer version's profile
	// is noted and the one shown kept, since every save is refused while it is there. A null key is
	// another tab clearing the whole storage, which changes both keys.
	function onStorage(event: Event) {
		const { key } = event as StorageEvent;
		if (key === null || key === ACTIVE_FIRM_KEY) {
			activeFirm = readFirm(readKey(storage, ACTIVE_FIRM_KEY));
		}
		if (key !== null && key !== PROFILE_KEY) return;
		const read = parseStored(readKey(storage, PROFILE_KEY));
		if (read.kind === 'newer') {
			newerVersion = read.version;
			return;
		}
		stored = read.kind === 'read' ? read.stored : null;
		newerVersion = null;
	}

	function listen(target: StorageEventSource): () => void {
		target.addEventListener('storage', onStorage);
		return () => target.removeEventListener('storage', onStorage);
	}

	// Asked at most once per page, and only after this page has written the profile itself (plan
	// 01-08): a browser that grants it keeps the profile out of eviction. Firefox answers the request
	// with a permission popup (MDN, storage quotas and eviction criteria, read 2026-09-27), so it
	// follows the user's own save and a visit that only reads never asks. The page says the browser
	// may delete the profile whatever this resolves to.
	function requestPersistOnce(nav: PersistCapableNavigator | undefined) {
		const manager = nav?.storage;
		if (persistRequested || !hasSaved || typeof manager?.persist !== 'function') return;
		persistRequested = true;
		try {
			manager.persist().catch(() => undefined);
		} catch {
			// A browser that throws here simply keeps its default eviction.
		}
	}

	// Decided on what storage holds now, not on this page's copy, so a profile another tab saved after
	// this page loaded goes too. Only the profile key is touched: the active-firm choice stays, and it
	// works while the demo firm is shown, since it writes nothing and removes the user's own data.
	function removeProfile(): RemoveResult {
		if (readKey(storage, PROFILE_KEY) === null) return 'nothing-stored';
		try {
			storage.removeItem(PROFILE_KEY);
		} catch {
			return 'failed';
		}
		stored = null;
		newerVersion = null;
		return 'removed';
	}

	return {
		get stored() {
			return stored;
		},
		// The schema version of a stored profile this page cannot read, or null.
		get newerVersion() {
			return newerVersion;
		},
		get activeFirm() {
			return activeFirm;
		},
		load,
		saveProfile,
		updateProfile,
		markExported,
		replaceFromImport,
		removeProfile,
		useDemo: () => setActiveFirm('demo'),
		backToOwn: () => setActiveFirm('own'),
		listen,
		requestPersistOnce
	};
}

export type ProfileStore = ReturnType<typeof createProfileStore>;

interface SharedStore {
	readonly store: ProfileStore;
	// True when the browser blocks storage and the profile lives only in this page's memory.
	readonly keptInMemory: boolean;
}

let shared: (SharedStore & { readonly storage: Storage; readonly stop: () => void }) | null = null;

// One store for the whole page, so the header's firm slot and the profile form read the same
// profile and the same active firm. Created on first use in the browser, never during a server
// render, and it follows other tabs for as long as the page is open. A blocked storage keeps
// its memory stand-in for the page's lifetime, so what was entered is not lost between the two.
export function getProfileStore(source: Window = window): SharedStore {
	const storage = browserStorage(source);
	const same =
		shared !== null &&
		(storage === shared.storage || (isKeptInMemory(storage) && isKeptInMemory(shared.storage)));
	if (!same) {
		shared?.stop();
		const store = createProfileStore(storage);
		store.load();
		shared = { store, storage, keptInMemory: isKeptInMemory(storage), stop: store.listen(source) };
	}
	return shared as SharedStore;
}

// A fresh page for each component test; the app itself never drops the store.
export function resetProfileStore() {
	shared?.stop();
	shared = null;
}

class MemoryStorage implements Storage {
	readonly #values = new Map<string, string>();
	get length() {
		return this.#values.size;
	}
	clear() {
		this.#values.clear();
	}
	getItem(key: string) {
		return this.#values.get(key) ?? null;
	}
	key(index: number) {
		return [...this.#values.keys()][index] ?? null;
	}
	removeItem(key: string) {
		this.#values.delete(key);
	}
	setItem(key: string, value: string) {
		this.#values.set(key, value);
	}
}

// Some browsers throw on the mere read of window.localStorage when storage is blocked, and Firefox
// answers null when storage is switched off. The page then keeps the profile in memory for this
// view rather than failing.
export function browserStorage(source: { readonly localStorage: Storage } = window): Storage {
	try {
		return (source.localStorage as Storage | null) ?? new MemoryStorage();
	} catch {
		return new MemoryStorage();
	}
}

// True for the stand-in above: a save there lasts only while the page is open, so the page must
// never call it saved in this browser.
export function isKeptInMemory(storage: Storage): boolean {
	return storage instanceof MemoryStorage;
}
