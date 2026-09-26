// Profile files move forward one schema version at a time. MIGRATIONS[n] turns a version n
// document into version n + 1; it is empty while version 1 is the only one. A new schema version
// adds its step here and its sample file to migrate.test.ts, which runs every version forward.
import { PROFILE_SCHEMA_VERSION } from './schema';

export type VersionedDocument = { schemaVersion: number } & Record<string, unknown>;
export type MigrationStep = (doc: VersionedDocument) => VersionedDocument;
export type MigrationTable = Readonly<Record<number, MigrationStep>>;

export const MIGRATIONS: MigrationTable = {};

export function migrateWith(
	table: MigrationTable,
	doc: VersionedDocument,
	target: number
): VersionedDocument {
	let current = doc;
	for (let version = doc.schemaVersion; version < target; version += 1) {
		const step = table[version];
		if (!step) throw new Error(`No migration from profile schemaVersion ${version}.`);
		// The runner stamps the version, so a step cannot leave a document claiming the wrong one.
		current = { ...step(current), schemaVersion: version + 1 };
	}
	return current;
}

export function migrateToCurrent(doc: VersionedDocument): VersionedDocument {
	return migrateWith(MIGRATIONS, doc, PROFILE_SCHEMA_VERSION);
}
