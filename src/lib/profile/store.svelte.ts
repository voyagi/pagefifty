// The firm profile as this browser holds it. Nothing here touches storage at import time: the page
// creates the store after mount with browserStorage(), so a server render never reads or writes a
// profile. Every storage call is wrapped, because a browser can block storage or refuse a write.
import { canonicalStoredJson } from './canonical';
import {
	PROFILE_SCHEMA_VERSION,
	ProfileSchema,
	StoredProfileSchema,
	type Profile,
	type StoredProfile
} from './schema';

export const PROFILE_KEY = 'pagefifty-profile';
export const ACTIVE_FIRM_KEY = 'pagefifty-active-firm';

export type SaveResult = 'saved' | 'unchanged' | 'failed' | 'newer-version';

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

function readRaw(storage: Storage): string | null {
	try {
		return storage.getItem(PROFILE_KEY);
	} catch {
		return null;
	}
}

export function createProfileStore(storage: Storage) {
	let stored = $state<StoredProfile | null>(null);
	let newerVersion = $state<number | null>(null);

	function load(): StoredProfile | null {
		const read = parseStored(readRaw(storage));
		stored = read.kind === 'read' ? read.stored : null;
		newerVersion = read.kind === 'newer' ? read.version : null;
		return stored;
	}

	// Writes only when the profile itself changed, so savedAt means the last real change and an
	// unchanged save leaves the stored bytes alone. Another tab can write after this page loaded (a
	// newer Pagefifty left open across a release, or the same page open twice), so the stored value
	// is read again first and the save is compared with what storage holds now.
	function saveProfile(profile: Profile, now: Date): SaveResult {
		const current = parseStored(readRaw(storage));
		newerVersion = current.kind === 'newer' ? current.version : null;
		if (newerVersion !== null) return 'newer-version';
		stored = current.kind === 'read' ? current.stored : null;
		const parsed = ProfileSchema.safeParse(profile);
		if (!parsed.success) return 'failed';
		if (
			stored &&
			canonicalStoredJson({ ...stored, profile: parsed.data }) === canonicalStoredJson(stored)
		) {
			return 'unchanged';
		}
		const next: StoredProfile = {
			schemaVersion: PROFILE_SCHEMA_VERSION,
			savedAt: now.toISOString(),
			lastExportedAt: stored?.lastExportedAt ?? null,
			profile: parsed.data
		};
		try {
			storage.setItem(PROFILE_KEY, canonicalStoredJson(next));
		} catch {
			return 'failed';
		}
		stored = next;
		return 'saved';
	}

	return {
		get stored() {
			return stored;
		},
		// The schema version of a stored profile this page cannot read, or null.
		get newerVersion() {
			return newerVersion;
		},
		load,
		saveProfile
	};
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
