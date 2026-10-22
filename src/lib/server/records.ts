// Server-side loaders over the records scripts/build-records.mjs wrote. The records are emitted as
// static assets and read with read(), which reads the file in vite dev and goes through the ASSETS
// binding on the Worker, so no notice XML is parsed while a page is served.
import { read } from '$app/server';
import type { NoticeRecord } from '../ingest/record';
import { exampleCaptureOf, newestCapture } from '../snapshot/capture-id';
import { FigureFileSchema, type FigureFile } from '../snapshot/figure';
import {
	CaptureLineSchema,
	NOTICE_NUMBER,
	NoticeRecordSchema,
	SnapshotIndexSchema,
	type SnapshotIndex
} from '../snapshot/index-row';
import {
	NoticeReadingsSchema,
	ReadingRunSchema,
	type NoticeReadings,
	type ReadingRun
} from '../snapshot/readings';
import { SearchRunSchema, type SearchRun } from '../snapshot/search-run';
import { NoticeSearchSchema, type NoticeSearch } from '../snapshot/searches';
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
const READING_PATH = /\/generated\/(\d{4}-\d{2}-\d{2})\/readings\/([^/]+)\.json$/;
const READING_RUN_PATH = /\/generated\/(\d{4}-\d{2}-\d{2})\/reading-run\.json$/;
const SEARCH_RUN_PATH = /\/generated\/(\d{4}-\d{2}-\d{2})\/search-run\.json$/;
const SEARCH_PATH = /\/generated\/(\d{4}-\d{2}-\d{2})\/searches\/([^/]+)\.json$/;
const FIGURE_PATH = /\/generated\/(\d{4}-\d{2}-\d{2})\/figure\.json$/;

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
const READING_URLS = byMatch(
	import.meta.glob('../snapshot/generated/*/readings/*.json', {
		query: '?url',
		import: 'default',
		eager: true
	}),
	READING_PATH
);
// A reading run is a few hundred bytes, like a capture line, so it is bundled the same way.
const READING_RUNS = byMatch(
	import.meta.glob<unknown>('../snapshot/generated/*/reading-run.json', {
		import: 'default',
		eager: true
	}),
	READING_RUN_PATH
);
// A search run is as small, and a capture that ran no buyer search has none.
const SEARCH_RUNS = byMatch(
	import.meta.glob<unknown>('../snapshot/generated/*/search-run.json', {
		import: 'default',
		eager: true
	}),
	SEARCH_RUN_PATH
);
const SEARCH_URLS = byMatch(
	import.meta.glob('../snapshot/generated/*/searches/*.json', {
		query: '?url',
		import: 'default',
		eager: true
	}),
	SEARCH_PATH
);
// The home figure is a few hundred bytes too, and only a capture the model read can hold one.
const FIGURES = byMatch(
	import.meta.glob<unknown>('../snapshot/generated/*/figure.json', {
		import: 'default',
		eager: true
	}),
	FIGURE_PATH
);
// Stryker restore all

// A missing or damaged line is a broken build and fails whatever reads it, like a damaged index.
function captureLine(capture: string): SnapshotIndex['capture'] {
	const line = CAPTURE_LINES.get(capture);
	if (line === undefined) {
		throw new Error(
			`no built capture line for capture ${capture}: scripts/build-records.mjs writes it from examples/${capture}/notices.json, and npm run dev, npm run build and the test run each call it first`
		);
	}
	const parsed = CaptureLineSchema.safeParse(line);
	if (!parsed.success) {
		throw new Error(
			`the ${capture} capture line does not match its schema: ${parsed.error.message}`
		);
	}
	return parsed.data;
}

// Both are fixed when the module loads, from the glob the build already expanded, so no request
// ever chooses which capture it reads. The example moves to the final capture by the rule in
// exampleCaptureOf the moment that capture is built, with no change here (DEMO-04).
export const LATEST_CAPTURE = newestCapture(INDEX_URLS.keys());
export const EXAMPLE_CAPTURE = exampleCaptureOf(
	[...CAPTURE_LINES.keys()].map((id) => [id, captureLine(id)] as const)
);
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
			`no built records for capture ${capture}: scripts/build-records.mjs writes them from examples/${capture}/notices.json, and npm run dev, npm run build and the test run each call it first`
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
	return captureFacts(captureLine(capture));
}

// Answered from the files the build wrote, so a list can ask it of every row without a read.
export function hasNoticeReadings(capture: string, notice: string): boolean {
	return READING_URLS.has(`${capture}/${notice}`);
}

// A notice the capture's readings do not list answers nothing, and keeps the phase 1 view.
export async function loadNoticeReadings(
	capture: string,
	notice: string
): Promise<NoticeReadings | undefined> {
	if (!NOTICE_NUMBER.test(notice)) return undefined;
	const url = READING_URLS.get(`${capture}/${notice}`);
	if (url === undefined) return undefined;
	const parsed = NoticeReadingsSchema.safeParse(
		await readJson(url, `the ${capture} readings of ${notice}`)
	);
	if (!parsed.success) {
		throw new Error(
			`the ${capture} readings of ${notice} do not match their schema: ${parsed.error.message}`
		);
	}
	return parsed.data;
}

// A notice the capture's buyer search does not list answers nothing, and its page shows no search.
export async function loadNoticeSearch(
	capture: string,
	notice: string
): Promise<NoticeSearch | undefined> {
	if (!NOTICE_NUMBER.test(notice)) return undefined;
	const url = SEARCH_URLS.get(`${capture}/${notice}`);
	if (url === undefined) return undefined;
	const parsed = NoticeSearchSchema.safeParse(
		await readJson(url, `the ${capture} buyer search of ${notice}`)
	);
	if (!parsed.success) {
		throw new Error(
			`the ${capture} buyer search of ${notice} does not match its schema: ${parsed.error.message}`
		);
	}
	return parsed.data;
}

// The run that read a capture, or null for a capture the model never read.
export function readingRunOf(capture: string): ReadingRun | null {
	const line = READING_RUNS.get(capture);
	if (line === undefined) return null;
	const parsed = ReadingRunSchema.safeParse(line);
	if (!parsed.success) {
		throw new Error(
			`the ${capture} reading run does not match its schema: ${parsed.error.message}`
		);
	}
	return parsed.data;
}

// The newest capture the model read, which may be older than the newest capture.
export function newestReadingRun(): { id: string; run: ReadingRun } | null {
	if (READING_RUNS.size === 0) return null;
	const id = newestCapture(READING_RUNS.keys());
	const run = readingRunOf(id);
	return run === null ? null : { id, run };
}

// The parse is apart from the lookup so a damaged line can be tested before any capture has one.
export function parsedSearchRun(capture: string, line: unknown): SearchRun | null {
	if (line === undefined) return null;
	const parsed = SearchRunSchema.safeParse(line);
	if (!parsed.success) {
		throw new Error(`the ${capture} search run does not match its schema: ${parsed.error.message}`);
	}
	return parsed.data;
}

// The buyer search of a capture, or null for a capture that ran none.
export function searchRunOf(capture: string): SearchRun | null {
	return parsedSearchRun(capture, SEARCH_RUNS.get(capture));
}

// The parse is apart from the lookup so a damaged figure can be tested before any capture has one.
export function parsedFigure(capture: string, line: unknown): FigureFile | null {
	if (line === undefined) return null;
	const parsed = FigureFileSchema.safeParse(line);
	if (!parsed.success) {
		throw new Error(`the ${capture} figure does not match its schema: ${parsed.error.message}`);
	}
	return parsed.data;
}

// The home figure of a capture, or null for one that holds none.
export function figureFile(capture: string): FigureFile | null {
	return parsedFigure(capture, FIGURES.get(capture));
}

// The outside providers a capture used, as the trust pages name them: the model provider its
// reading run records, then the search provider only when the search sent at least one query, so
// a capture that never searched leaves no claim about one on either page.
export function providersOf(run: ReadingRun | null, search: SearchRun | null): string[] {
	const providers = run === null ? [] : [run.provider];
	return search !== null && search.searches > 0 ? [...providers, 'Tavily'] : providers;
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
