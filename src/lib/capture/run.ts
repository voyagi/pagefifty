// npm run capture: TED's open IT notices into a dated, scrubbed and checked examples/<date>/ folder
// the records build reads. scripts/capture.mjs injects every dependency (the transport, the clock,
// the root, git's HEAD), so the tests drive this with a stub TED and a fake clock. Imported under
// Node type stripping: erasable syntax only, relative .ts imports.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectLatest } from '../ingest/latest.ts';
import { readNotice, MAX_NOTICE_BYTES } from '../ingest/read-notice.ts';
import type { NoticeRecord } from '../ingest/record.ts';
import { NoticeRecordSchema, SnapshotIndexSchema, toIndexRow } from '../snapshot/index-row.ts';
import { scrubJsonValue, scrubNoticeXml } from '../snapshot/scrub.ts';
import { checkCaptureFolder } from '../snapshot/scrub-check.ts';
import type { Transport } from '../snapshot/transport.ts';
import {
	captureDate,
	defaultSince,
	publish,
	stagingPath,
	writeJsonFile
} from './capture-folder.ts';
import { captureReadme } from './readme.ts';
import { buildRunRecord } from './run-record.ts';
import { createTedClient, type Clock, type FetchLogEntry, type TedClient } from './ted-client.ts';
import { searchAll, searchBody, searchQuery, xmlTarget, type SearchHit } from './ted-search.ts';
import { createXmlCache } from './xml-cache.ts';

export interface CaptureDeps {
	root: string;
	transport: Transport;
	clock: Clock;
	argv: readonly string[];
	env: Readonly<Record<string, string | undefined>>;
	head: string;
	pid: number;
	log: (line: string) => void;
}

interface Failure {
	notice: string;
	reason: string;
}

interface ReadOne {
	number: string;
	hit: SearchHit;
	text: string;
	record: NoticeRecord;
}

type XmlCache = ReturnType<typeof createXmlCache>;

type Fetched = { ok: true; raw: Uint8Array; cached: boolean } | { ok: false; reason: string };

type Outcome = { ok: true; notice: ReadOne } | { ok: false; failure: Failure };

type Selection = ReturnType<typeof selectLatest>;

// Everything the staged folder is written from, fixed before the first file is written.
interface Capture {
	date: string;
	startedAt: string;
	finishedAt: string;
	since: string;
	command: string;
	head: string;
	listed: number;
	searchTotal: number;
	cacheHits: number;
	kept: readonly ReadOne[];
	leftOut: Selection['leftOut'];
	sameProcedure: Selection['sameProcedure'];
	ted: ReturnType<TedClient['stats']>;
	fetchLog: readonly FetchLogEntry[];
}

// The BOM is kept, so a scrubbed file differs from TED's bytes only where the scrub replaced text.
const UTF8 = new TextDecoder('utf-8', { ignoreBOM: true });

function publicationOrder(a: string, b: string): number {
	const [runningA, yearA] = a.split('-').map(Number);
	const [runningB, yearB] = b.split('-').map(Number);
	return yearA - yearB || runningA - runningB;
}

// A body the reader refuses is never cached, so the next run asks TED for it again.
async function fetchRaw(
	client: TedClient,
	cache: XmlCache,
	number: string,
	url: string
): Promise<Fetched> {
	if (cache.has(number)) return { ok: true, raw: cache.read(number), cached: true };
	const answer = await client.send('xml', () => new Request(url), { id: number }, MAX_NOTICE_BYTES);
	if (!answer.ok) return answer;
	const accepted = readNotice(answer.body, { noticeNumber: number });
	if (!accepted.ok) return { ok: false, reason: `${accepted.kind}: ${accepted.detail}` };
	cache.write(number, answer.body);
	return { ok: true, raw: answer.body, cached: false };
}

// The record is read from the scrubbed bytes, the ones the records build reads from the published
// folder, and checked with the schema the build checks it with (build-records.mjs buildCapture).
function readScrubbed(number: string, hit: SearchHit, raw: Uint8Array): Outcome {
	const text = scrubNoticeXml(UTF8.decode(raw));
	const read = readNotice(new TextEncoder().encode(text), { noticeNumber: number });
	if (!read.ok)
		return { ok: false, failure: { notice: number, reason: `${read.kind}: ${read.detail}` } };
	const checked = NoticeRecordSchema.safeParse(read.record);
	if (!checked.success) {
		const where = checked.error.issues
			.map((issue) => `${issue.path.join('.') || 'the record'} (${issue.message})`)
			.join(', ');
		return { ok: false, failure: { notice: number, reason: `record: refused at ${where}` } };
	}
	return { ok: true, notice: { number, hit, text, record: checked.data } };
}

async function readHits(hits: readonly SearchHit[], client: TedClient, cache: XmlCache) {
	const notices: ReadOne[] = [];
	const failed: Failure[] = [];
	let cacheHits = 0;
	const valid: { hit: SearchHit; number: string; url: string }[] = [];
	for (const hit of hits) {
		const target = xmlTarget(hit);
		if (target.ok) valid.push({ hit, number: target.number, url: target.url });
		else failed.push({ notice: target.notice, reason: target.reason });
	}
	valid.sort((a, b) => publicationOrder(a.number, b.number));
	for (const { hit, number, url } of valid) {
		const fetched = await fetchRaw(client, cache, number, url);
		if (!fetched.ok) {
			failed.push({ notice: number, reason: fetched.reason });
			continue;
		}
		if (fetched.cached) cacheHits += 1;
		const outcome = readScrubbed(number, hit, fetched.raw);
		if (outcome.ok) notices.push(outcome.notice);
		else failed.push(outcome.failure);
	}
	return { notices, failed, cacheHits };
}

// TED's onlyLatestVersions flag did not deliver latest versions in the 2026-09-15 capture, and the
// records build applies this same rule to every capture, so the command keeps what the build keeps.
function keepLatest(notices: readonly ReadOne[]) {
	const byNumber = new Map(notices.map((notice) => [notice.number, notice]));
	const selection = selectLatest(notices.map((notice) => notice.record));
	const kept = selection.kept.map((record) => byNumber.get(record.noticeNumber) as ReadOne);
	return { kept, leftOut: selection.leftOut, sameProcedure: selection.sameProcedure };
}

function writeListing(staging: string, capture: Capture): void {
	mkdirSync(join(staging, 'xml'), { recursive: true });
	for (const notice of capture.kept) {
		writeFileSync(join(staging, 'xml', `${notice.number}.xml`), notice.text);
	}
	const { query, scope, onlyLatestVersions } = searchBody(capture.since, 1);
	writeJsonFile(
		join(staging, 'notices.json'),
		scrubJsonValue({
			fetchedAt: capture.startedAt,
			query,
			scope,
			onlyLatestVersions,
			since: capture.since,
			total: capture.kept.length,
			searchTotal: capture.searchTotal,
			notices: capture.kept.map((notice) => notice.hit)
		})
	);
}

function writeRecords(staging: string, capture: Capture): void {
	const { query, fields, scope, onlyLatestVersions } = searchBody(capture.since, 1);
	writeJsonFile(join(staging, 'fetch-log.json'), { log: capture.fetchLog, failures: [] });
	writeJsonFile(
		join(staging, 'run.json'),
		buildRunRecord({
			startedAt: capture.startedAt,
			finishedAt: capture.finishedAt,
			captureDate: capture.date,
			command: capture.command,
			head: capture.head,
			query: { query, fields, scope, onlyLatestVersions, since: capture.since },
			ted: { ...capture.ted, cacheHits: capture.cacheHits },
			notices: {
				listed: capture.listed,
				written: capture.kept.length,
				leftOut: capture.leftOut,
				failed: [],
				sameProcedure: capture.sameProcedure
			}
		})
	);
	writeFileSync(
		join(staging, 'README.md'),
		captureReadme({
			captureDate: capture.date,
			fetchedAt: capture.startedAt,
			query,
			since: capture.since,
			written: capture.kept.length,
			searchTotal: capture.searchTotal,
			leftOut: capture.leftOut
		})
	);
}

// The records build refuses a whole capture on one record or index it rejects
// (build-records.mjs buildCapture), which would turn npm test, dev and build red, so the command
// applies the same two checks before it publishes, and then the one contact check the scrub script runs.
function stagedProblems(staging: string, capture: Capture): string[] {
	const index = SnapshotIndexSchema.safeParse({
		capture: {
			id: capture.date,
			fetchedAt: capture.startedAt,
			total: capture.searchTotal,
			query: searchQuery(capture.since)
		},
		leftOut: capture.leftOut,
		rows: capture.kept.map((notice) => toIndexRow(notice.record))
	});
	if (!index.success) {
		return index.error.issues.map(
			(issue) => `index refused at ${issue.path.join('.')}: ${issue.message}`
		);
	}
	const check = checkCaptureFolder(staging);
	return [
		...check.dirty.map((file) => `contact data left in ${file}`),
		...check.notText.map((file) => `not text: ${file}`),
		...check.links.map((file) => `a link, not a file: ${file}`),
		...check.special.map((file) => `not a regular file: ${file}`)
	];
}

async function stageAndPublish(deps: CaptureDeps, capture: Capture): Promise<0 | 1> {
	const { root, log } = deps;
	const staging = stagingPath(root, capture.date, deps.pid);
	rmSync(staging, { recursive: true, force: true, maxRetries: 5 });
	writeListing(staging, capture);
	writeRecords(staging, capture);
	const problems = stagedProblems(staging, capture);
	if (problems.length > 0) {
		rmSync(staging, { recursive: true, force: true, maxRetries: 5 });
		for (const problem of problems) log(`capture: ${problem}`);
		log('capture: the staged folder failed its checks; nothing was written');
		return 1;
	}
	try {
		await publish(staging, join(root, 'examples', capture.date), deps.clock);
	} catch (error) {
		log(`capture: ${error instanceof Error ? error.message : String(error)}`);
		return 1;
	}
	const count = capture.kept.length;
	log(
		`capture: wrote examples/${capture.date} with ${count} ${count === 1 ? 'notice' : 'notices'}`
	);
	return 0;
}

export async function runCapture(deps: CaptureDeps): Promise<0 | 1 | 2> {
	const { root, clock, log } = deps;
	const started = clock.now();
	const date = captureDate(started);
	if (existsSync(join(root, 'examples', date))) {
		log(
			`capture: examples/${date} already exists, and a capture folder is never written again in place`
		);
		return 2;
	}
	const client = createTedClient({ transport: deps.transport, clock });
	const since = defaultSince(date);
	const search = await searchAll(client, since);
	if (!search.ok) {
		log(`capture: ${search.reason}; nothing was written`);
		return 1;
	}
	const cache = createXmlCache(join(root, '.capture-cache'), deps.pid);
	const { notices, failed, cacheHits } = await readHits(search.hits, client, cache);
	if (failed.length > 0) {
		for (const { notice, reason } of failed) log(`capture: ${notice}: ${reason}`);
		log(`capture: ${failed.length} notices failed; nothing was written`);
		return 1;
	}
	return stageAndPublish(deps, {
		date,
		startedAt: new Date(started).toISOString(),
		finishedAt: new Date(clock.now()).toISOString(),
		since,
		command: ['node', 'scripts/capture.mjs', ...deps.argv].join(' '),
		head: deps.head,
		listed: search.hits.length,
		searchTotal: search.searchTotal,
		cacheHits,
		...keepLatest(notices),
		ted: client.stats(),
		fetchLog: client.log()
	});
}
