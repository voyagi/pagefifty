// Server-side loaders over the records scripts/build-records.mjs wrote. The records are emitted as
// static assets and read with read(), which reads the file in vite dev and goes through the ASSETS
// binding on the Worker, so no notice XML is parsed while a page is served.
import { read } from '$app/server';
import type { NoticeRecord } from '../ingest/record';
import { newestCapture } from '../snapshot/capture-id';
import {
	CaptureLineSchema,
	NOTICE_NUMBER,
	NoticeRecordSchema,
	SnapshotIndexSchema,
	type SnapshotIndex
} from '../snapshot/index-row';
import { captureFacts, type CaptureFacts } from '../tenders/list';

// A page is judged against an instant: the real clock for /tenders, or "capture" for the moment
// the snapshot was taken, read from the index the page already loads, so the example reads no
// clock and no environment and stays the same page whenever a judge opens it (D-06).
export type Now = Date | 'capture';

export function instantOf(now: Now, index: SnapshotIndex): Date {
	return now === 'capture' ? new Date(index.capture.fetchedAt) : now;
}

// The build names each record file after a notice number the index schema accepted, so the file
// name is read back as written and loadRecord checks the number itself before any lookup.
const INDEX_PATH = /\/generated\/(\d{4}-\d{2}-\d{2})\/index\.json$/;
const CAPTURE_PATH = /\/generated\/(\d{4}-\d{2}-\d{2})\/capture\.json$/;
const RECORD_PATH = /\/generated\/(\d{4}-\d{2}-\d{2})\/records\/([^/]+)\.json$/;

function byMatch<T>(files: Record<string, T>, pattern: RegExp): ReadonlyMap<string, T> {
	const found = new Map<string, T>();
	for (const [path, file] of Object.entries(files)) {
		const match = pattern.exec(path);
		if (match) found.set(match.slice(1).join('/'), file);
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
// The capture lines themselves, a few hundred bytes each, are bundled rather than read, so a 404
// names its snapshot's days with no read at all. The index is too large to bundle this way: Vite
// inlines a JSON file over 10 kB whole, rows included.
const CAPTURE_LINES = byMatch(
	import.meta.glob<unknown>('../snapshot/generated/*/capture.json', {
		import: 'default',
		eager: true
	}),
	CAPTURE_PATH
);
// Stryker restore all

// Both are fixed when the module loads, from the glob the build already expanded, so no request
// ever chooses which capture it reads. The example stays on the capture its copy describes until
// the final capture replaces it (DEMO-04).
export const LATEST_CAPTURE = newestCapture(INDEX_URLS.keys());
export const EXAMPLE_CAPTURE = '2026-09-15';
export { newestCapture };

// SvelteKit's read() always answers status 200. On the Worker the adapter fetches the file through
// ASSETS while the body is read and throws there when ASSETS answers 404, and a path the manifest
// does not hold throws at once. So reading the body and parsing it are separate steps, and each
// failure names the file and the step.
async function readJson(url: string, what: string): Promise<unknown> {
	let text: string;
	try {
		text = await read(url).text();
	} catch (error) {
		throw new Error(`${what} could not be read: ${String(error)}`, { cause: error });
	}
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error(`${what} is not JSON: ${String(error)}`, { cause: error });
	}
}

// A failed parse is a server error, never a partial list.
export async function loadIndex(capture: string): Promise<SnapshotIndex> {
	const url = INDEX_URLS.get(capture);
	if (url === undefined) {
		throw new Error(
			`no built records for capture ${capture}: scripts/build-records.mjs writes them, and npm run dev, npm run build and the test run each call it first`
		);
	}
	const parsed = SnapshotIndexSchema.safeParse(await readJson(url, `the ${capture} index`));
	if (!parsed.success) {
		throw new Error(`the ${capture} index does not match its schema: ${parsed.error.message}`);
	}
	return parsed.data;
}

// The days a 404 names, from the bundled line of the capture the route reads, so a newer capture
// never leaves the page naming an older one's days. A missing or damaged line is a broken build
// and fails the page like a damaged index does.
export function snapshotDays(capture: string): CaptureFacts {
	const line = CAPTURE_LINES.get(capture);
	if (line === undefined) {
		throw new Error(
			`no built capture line for capture ${capture}: scripts/build-records.mjs writes it, and npm run dev, npm run build and the test run each call it first`
		);
	}
	const parsed = CaptureLineSchema.safeParse(line);
	if (!parsed.success) {
		throw new Error(
			`the ${capture} capture line does not match its schema: ${parsed.error.message}`
		);
	}
	return captureFacts(parsed.data);
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
	const parsed = NoticeRecordSchema.safeParse(
		await readJson(url, `the ${capture} record ${notice}`)
	);
	if (!parsed.success) {
		throw new Error(
			`the ${capture} record ${notice} does not match its schema: ${parsed.error.message}`
		);
	}
	return parsed.data;
}
