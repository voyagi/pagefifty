// A profile file chosen by the user is untrusted: it may be huge, not JSON, from a future
// Pagefifty or hand-edited. It is read in one order (size, text, JSON, version, migrate, strict
// schema) and either passes every step whole or is refused whole with the reason and, for schema
// errors, every field with the value found. Nothing here writes: the caller stores a passed file.
import type { ZodError } from 'zod';
import { migrateToCurrent, type VersionedDocument } from './migrate';
import { PROFILE_SCHEMA_VERSION, StoredProfileSchema, type StoredProfile } from './schema';

// An exported profile is a few KB; the cap stops a mistaken pick of a large file before the
// browser reads it all into memory.
export const IMPORT_MAX_BYTES = 262_144;

// The part of a browser File this module reads.
export interface ProfileFile {
	readonly name: string;
	readonly size: number;
	text(): Promise<string>;
}

type FieldPath = (string | number)[];

interface FieldIssue {
	path: FieldPath;
	// The zod issue code, for example too_small or unrecognized_keys; the page words it.
	problem: string;
	found: unknown;
}

type ImportRefusalReason =
	'too-large' | 'unreadable' | 'not-json' | 'no-version' | 'newer-version' | 'invalid';

export interface ImportRefusal {
	ok: false;
	reason: ImportRefusalReason;
	fileName: string;
	version?: number;
	// Every schema problem; absent for an invalid file a migration step could not read.
	fields?: FieldIssue[];
}

export type ImportResult = { ok: true; stored: StoredProfile } | ImportRefusal;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Own properties only: a JSON file can carry a __proto__ key, and the value reported must be the
// one in the file, never something inherited.
function valueAt(root: unknown, path: FieldPath): unknown {
	let node = root;
	for (const key of path) {
		if (typeof node !== 'object' || node === null) return undefined;
		if (!Object.prototype.hasOwnProperty.call(node, key)) return undefined;
		node = (node as Record<string | number, unknown>)[key];
	}
	return node;
}

function fieldIssues(issues: ZodError['issues'], doc: unknown): FieldIssue[] {
	return issues.flatMap((issue) => {
		const path = issue.path.map((key) => (typeof key === 'number' ? key : String(key)));
		const keys = issue.code === 'unrecognized_keys' ? issue.keys : [undefined];
		return keys.map((key) => {
			const at = key === undefined ? path : [...path, key];
			return { path: at, problem: issue.code, found: valueAt(doc, at) };
		});
	});
}

function refuse(
	file: ProfileFile,
	reason: ImportRefusalReason,
	detail: Pick<ImportRefusal, 'version' | 'fields'> = {}
): ImportRefusal {
	return { ok: false, reason, fileName: file.name, ...detail };
}

export async function importProfileFile(
	file: ProfileFile,
	migrate: (doc: VersionedDocument) => VersionedDocument = migrateToCurrent
): Promise<ImportResult> {
	if (file.size > IMPORT_MAX_BYTES) return refuse(file, 'too-large');
	let text: string;
	try {
		text = await file.text();
	} catch {
		return refuse(file, 'unreadable');
	}
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return refuse(file, 'not-json');
	}
	const version = isRecord(value) ? value.schemaVersion : undefined;
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		return refuse(file, 'no-version');
	}
	if (version > PROFILE_SCHEMA_VERSION) return refuse(file, 'newer-version', { version });
	// A step reads an older file before the strict schema has checked it, so a step that throws on a
	// malformed file refuses that file (with no field list) instead of rejecting the import.
	let migrated: VersionedDocument;
	try {
		migrated = migrate(value as VersionedDocument);
	} catch {
		return refuse(file, 'invalid');
	}
	const parsed = StoredProfileSchema.safeParse(migrated);
	if (!parsed.success) {
		return refuse(file, 'invalid', { fields: fieldIssues(parsed.error.issues, migrated) });
	}
	return { ok: true, stored: parsed.data };
}

// A file that passed every step, with what apply answered for it: the store can still refuse the
// write (storage full, a newer version stored), and a refused write is never an import.
type QueuedImport<T> = { ok: true; stored: StoredProfile; applied: T } | ImportRefusal;

// Every read starts at once, but results are applied in the order the imports were started: each
// waits for the one before it. Of two files picked back to back, the second is what stays stored
// even when the first takes longer to read, and a refused file never touches what is stored.
export function createImportQueue<T>(apply: (stored: StoredProfile) => T) {
	let previous: Promise<unknown> = Promise.resolve();
	return (file: ProfileFile): Promise<QueuedImport<T>> => {
		const reading = importProfileFile(file);
		const applied = previous
			.then(() => reading)
			.then((result): QueuedImport<T> =>
				result.ok ? { ...result, applied: apply(result.stored) } : result
			);
		previous = applied.catch(() => undefined);
		return applied;
	};
}
