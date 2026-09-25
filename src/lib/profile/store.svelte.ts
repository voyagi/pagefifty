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

export type SaveResult = 'saved' | 'unchanged' | 'failed';

// A missing, unreadable or invalid stored value reads as nothing saved, never a partial profile.
function parseStored(raw: string | null): StoredProfile | null {
	if (raw === null) return null;
	try {
		const parsed = StoredProfileSchema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
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

	function load(): StoredProfile | null {
		stored = parseStored(readRaw(storage));
		return stored;
	}

	// Writes only when the profile itself changed, so savedAt means the last real change and an
	// unchanged save leaves the stored bytes alone.
	function saveProfile(profile: Profile, now: Date): SaveResult {
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

// Some browsers throw on the mere read of window.localStorage when storage is blocked. The page
// then keeps the profile in memory for this view rather than failing.
export function browserStorage(source: { readonly localStorage: Storage } = window): Storage {
	try {
		return source.localStorage;
	} catch {
		return new MemoryStorage();
	}
}
