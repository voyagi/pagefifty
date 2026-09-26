// Server-side loaders over the records scripts/build-records.mjs wrote. The records are emitted as
// static assets and read with read(), which reads the file in vite dev and goes through the ASSETS
// binding on the Worker, so no notice XML is parsed while a page is served.
import { read } from '$app/server';
import type { NoticeRecord } from '../ingest/record';
import {
	NOTICE_NUMBER,
	NoticeRecordSchema,
	SnapshotIndexSchema,
	type SnapshotIndex
} from '../snapshot/index-row';

export const DEFAULT_CAPTURE = '2026-09-15';

// The build names each record file after a notice number the index schema accepted, so the file
// name is read back as written and loadRecord checks the number itself before any lookup.
const INDEX_PATH = /\/generated\/(\d{4}-\d{2}-\d{2})\/index\.json$/;
const RECORD_PATH = /\/generated\/(\d{4}-\d{2}-\d{2})\/records\/([^/]+)\.json$/;

function byMatch(urls: Record<string, string>, pattern: RegExp): ReadonlyMap<string, string> {
	const found = new Map<string, string>();
	for (const [path, url] of Object.entries(urls)) {
		const match = pattern.exec(path);
		if (match) found.set(match.slice(1).join('/'), url);
	}
	return found;
}

// Glob keys are file paths, so the capture and notice number are read out of them once, here.
// Stryker disable all: Vite expands import.meta.glob only from literal arguments
const INDEX_URLS = byMatch(
	import.meta.glob('../snapshot/generated/*/index.json', {
		query: '?url',
		import: 'default',
		eager: true
	}),
	INDEX_PATH
);
const RECORD_URLS = byMatch(
	import.meta.glob('../snapshot/generated/*/records/*.json', {
		query: '?url',
		import: 'default',
		eager: true
	}),
	RECORD_PATH
);
// Stryker restore all

// A failed parse is a server error, never a partial list.
export async function loadIndex(capture: string): Promise<SnapshotIndex> {
	const url = INDEX_URLS.get(capture);
	if (url === undefined) throw new Error(`no built records for capture ${capture}`);
	const parsed = SnapshotIndexSchema.safeParse(await read(url).json());
	if (!parsed.success) {
		throw new Error(`the ${capture} index does not match its schema: ${parsed.error.message}`);
	}
	return parsed.data;
}

// An unknown or malformed notice number is answered before any read, so the tender page can 404.
// A record that does not match its schema is a server error, like an index that does not.
export async function loadRecord(
	capture: string,
	notice: string
): Promise<NoticeRecord | undefined> {
	if (!NOTICE_NUMBER.test(notice)) return undefined;
	const url = RECORD_URLS.get(`${capture}/${notice}`);
	if (url === undefined) return undefined;
	const parsed = NoticeRecordSchema.safeParse(await read(url).json());
	if (!parsed.success) {
		throw new Error(
			`the ${capture} record ${notice} does not match its schema: ${parsed.error.message}`
		);
	}
	return parsed.data;
}
