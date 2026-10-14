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
	removeDeadStaging,
	stagingPath,
	writeJsonFile
} from './capture-folder.ts';
import { captureReadme } from './readme.ts';
import { buildRunRecord, writeRunRecord, type RunOutcome, type RunRecord } from './run-record.ts';
import { createTedClient, type Clock, type TedClient } from './ted-client.ts';
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
	isAlive?: (pid: number) => boolean;
	// Aborted by the command on Ctrl+C.
	signal?: AbortSignal;
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

type NoticeOutcome = { ok: true; notice: ReadOne } | { ok: false; failure: Failure };

interface Selection {
	kept: readonly ReadOne[];
	leftOut: ReturnType<typeof selectLatest>['leftOut'];
	sameProcedure: ReturnType<typeof selectLatest>['sameProcedure'];
}

interface RunEnd {
	outcome: RunOutcome;
	reason: string | null;
}

// What the run has learned so far, so a run that stops anywhere still leaves a record of it.
interface Run {
	started: number;
	date: string;
	since: string;
	command: string;
	client: TedClient;
	listed: number;
	searchTotal: number;
	cacheHits: number;
	failed: Failure[];
	selection?: Selection;
	end?: RunEnd;
	// The record the staged folder holds as run.json, kept so the runs folder gets the same bytes.
	staged?: RunRecord;
}

const EXIT: Readonly<Record<RunOutcome, 0 | 1 | 2>> = { written: 0, failed: 1, refused: 2 };
const INTERRUPTED = 'interrupted';

// The BOM is kept, so a scrubbed file differs from TED's bytes only where the scrub replaced text.
const UTF8 = new TextDecoder('utf-8', { ignoreBOM: true });

const iso = (epochMs: number) => new Date(epochMs).toISOString();

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const counted = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function ended(deps: CaptureDeps, outcome: RunOutcome, reason: string, line = reason): RunEnd {
	deps.log(`capture: ${line}`);
	return { outcome, reason };
}

// A transport aborted mid-run fails only the request it was making, so the run checks the signal
// itself before it goes on to judge what it fetched.
function stopIfInterrupted(deps: CaptureDeps): void {
	if (deps.signal?.aborted) throw new Error(INTERRUPTED);
}

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
function readScrubbed(number: string, hit: SearchHit, raw: Uint8Array): NoticeOutcome {
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

async function readHits(hits: readonly SearchHit[], run: Run, cache: XmlCache) {
	const notices: ReadOne[] = [];
	const valid: { hit: SearchHit; number: string; url: string }[] = [];
	for (const hit of hits) {
		const target = xmlTarget(hit);
		if (target.ok) valid.push({ hit, number: target.number, url: target.url });
		else run.failed.push({ notice: target.notice, reason: target.reason });
	}
	valid.sort((a, b) => publicationOrder(a.number, b.number));
	for (const { hit, number, url } of valid) {
		const fetched = await fetchRaw(run.client, cache, number, url);
		if (!fetched.ok) {
			run.failed.push({ notice: number, reason: fetched.reason });
			continue;
		}
		if (fetched.cached) run.cacheHits += 1;
		const outcome = readScrubbed(number, hit, fetched.raw);
		if (outcome.ok) notices.push(outcome.notice);
		else run.failed.push(outcome.failure);
	}
	return notices;
}

// TED's onlyLatestVersions flag did not deliver latest versions in the 2026-09-15 capture, and the
// records build applies this same rule to every capture, so the command keeps what the build keeps.
function keepLatest(notices: readonly ReadOne[]): Selection {
	const byNumber = new Map(notices.map((notice) => [notice.number, notice]));
	const selection = selectLatest(notices.map((notice) => notice.record));
	const kept = selection.kept.map((record) => byNumber.get(record.noticeNumber) as ReadOne);
	return { kept, leftOut: selection.leftOut, sameProcedure: selection.sameProcedure };
}

function recordOf(deps: CaptureDeps, run: Run, end: RunEnd, finishedAt: string): RunRecord {
	const { query, fields, scope, onlyLatestVersions } = searchBody(run.since, 1);
	const { selection } = run;
	return buildRunRecord({
		startedAt: iso(run.started),
		finishedAt,
		captureDate: run.date,
		outcome: end.outcome,
		reason: end.reason,
		command: run.command,
		head: deps.head,
		query: { query, fields, scope, onlyLatestVersions, since: run.since },
		ted: { ...run.client.stats(), cacheHits: run.cacheHits },
		notices: {
			listed: run.listed,
			written: end.outcome === 'written' && selection ? selection.kept.length : 0,
			leftOut: selection?.leftOut ?? [],
			failed: run.failed,
			sameProcedure: selection?.sameProcedure ?? []
		}
	});
}

function writeListing(staging: string, run: Run, selection: Selection): void {
	mkdirSync(join(staging, 'xml'), { recursive: true });
	for (const notice of selection.kept) {
		writeFileSync(join(staging, 'xml', `${notice.number}.xml`), notice.text);
	}
	const { query, scope, onlyLatestVersions } = searchBody(run.since, 1);
	writeJsonFile(
		join(staging, 'notices.json'),
		scrubJsonValue({
			fetchedAt: iso(run.started),
			query,
			scope,
			onlyLatestVersions,
			since: run.since,
			total: selection.kept.length,
			searchTotal: run.searchTotal,
			notices: selection.kept.map((notice) => notice.hit)
		})
	);
}

function writeRecords(staging: string, run: Run, selection: Selection, record: RunRecord): void {
	writeJsonFile(join(staging, 'fetch-log.json'), { log: run.client.log(), failures: [] });
	writeJsonFile(join(staging, 'run.json'), record);
	writeFileSync(
		join(staging, 'README.md'),
		captureReadme({
			captureDate: run.date,
			fetchedAt: iso(run.started),
			query: searchQuery(run.since),
			since: run.since,
			written: selection.kept.length,
			searchTotal: run.searchTotal,
			leftOut: selection.leftOut
		})
	);
}

// The records build refuses a whole capture on one record or index it rejects
// (build-records.mjs buildCapture), which would turn npm test, dev and build red, so the command
// applies the same two checks before it publishes, and then the one contact check the scrub script runs.
function stagedProblems(staging: string, run: Run, selection: Selection): string[] {
	const index = SnapshotIndexSchema.safeParse({
		capture: {
			id: run.date,
			fetchedAt: iso(run.started),
			total: run.searchTotal,
			query: searchQuery(run.since)
		},
		leftOut: selection.leftOut,
		rows: selection.kept.map((notice) => toIndexRow(notice.record))
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

async function stageAndPublish(
	deps: CaptureDeps,
	run: Run,
	selection: Selection,
	finishedAt: string
): Promise<RunEnd> {
	const { root, log } = deps;
	const staging = stagingPath(root, run.date, deps.pid);
	run.staged = recordOf(deps, run, { outcome: 'written', reason: null }, finishedAt);
	rmSync(staging, { recursive: true, force: true, maxRetries: 5 });
	writeListing(staging, run, selection);
	writeRecords(staging, run, selection, run.staged);
	const problems = stagedProblems(staging, run, selection);
	if (problems.length > 0) {
		rmSync(staging, { recursive: true, force: true, maxRetries: 5 });
		for (const problem of problems) log(`capture: ${problem}`);
		return ended(
			deps,
			'failed',
			'the staged folder failed its checks',
			'the staged folder failed its checks; nothing was written'
		);
	}
	try {
		await publish(staging, join(root, 'examples', run.date), deps.clock);
	} catch (error) {
		return ended(deps, 'failed', messageOf(error));
	}
	const count = selection.kept.length;
	log(`capture: wrote examples/${run.date} with ${counted(count, 'notice')}`);
	return { outcome: 'written', reason: null };
}

// Leftovers of runs that died: a half-written cache file is never read as a notice, but it is
// deleted so it cannot pile up, and a dead run's staging folder holds a whole unchecked capture.
function removeLeftovers(deps: CaptureDeps, cache: XmlCache): void {
	const temps = cache.removeTemp();
	if (temps > 0) deps.log(`capture: removed ${counted(temps, 'stale temp file')} from the cache`);
	const staged = removeDeadStaging(deps.root, deps.isAlive ?? processRuns);
	if (staged > 0) deps.log(`capture: removed ${counted(staged, 'stale staging folder')}`);
}

// process.kill with signal 0 sends nothing and throws when the pid is gone; EPERM means it exists
// under another user (scripts/harness.mjs reads it the same way).
function processRuns(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error instanceof Error && 'code' in error && error.code === 'EPERM';
	}
}

async function capture(deps: CaptureDeps, run: Run): Promise<RunEnd> {
	const { root, log } = deps;
	if (existsSync(join(root, 'examples', run.date))) {
		return ended(
			deps,
			'refused',
			`examples/${run.date} already exists, and a capture folder is never written again in place`
		);
	}
	const cache = createXmlCache(join(root, '.capture-cache'), deps.pid);
	removeLeftovers(deps, cache);
	const search = await searchAll(run.client, run.since);
	stopIfInterrupted(deps);
	if (!search.ok)
		return ended(deps, 'failed', search.reason, `${search.reason}; nothing was written`);
	run.listed = search.hits.length;
	run.searchTotal = search.searchTotal;
	const notices = await readHits(search.hits, run, cache);
	stopIfInterrupted(deps);
	if (run.failed.length > 0) {
		for (const { notice, reason } of run.failed) log(`capture: ${notice}: ${reason}`);
		const failed = `${counted(run.failed.length, 'notice')} failed`;
		return ended(deps, 'failed', failed, `${failed}; nothing was written`);
	}
	run.selection = keepLatest(notices);
	return stageAndPublish(deps, run, run.selection, iso(deps.clock.now()));
}

// The written run's record is the run.json it published; any other run's is built as it ends.
function finalRecord(deps: CaptureDeps, run: Run): RunRecord {
	if (run.end?.outcome === 'written' && run.staged) return run.staged;
	const end = run.end ?? { outcome: 'failed', reason: 'the run ended without an outcome' };
	return recordOf(deps, run, end, iso(deps.clock.now()));
}

export async function runCapture(deps: CaptureDeps): Promise<0 | 1 | 2> {
	const started = deps.clock.now();
	const date = captureDate(started);
	const run: Run = {
		started,
		date,
		since: defaultSince(date),
		command: ['node', 'scripts/capture.mjs', ...deps.argv].join(' '),
		client: createTedClient({ transport: deps.transport, clock: deps.clock }),
		listed: 0,
		searchTotal: 0,
		cacheHits: 0,
		failed: []
	};
	// Every run that got this far leaves a record, a thrown one included: in phase 2 it is the
	// account of a live run's paid attempts.
	try {
		const end = await capture(deps, run);
		run.end = end;
		return EXIT[end.outcome];
	} catch (error) {
		run.end = { outcome: 'failed', reason: deps.signal?.aborted ? INTERRUPTED : messageOf(error) };
		throw error;
	} finally {
		const runs = join(deps.root, '.capture-cache', 'runs');
		writeRunRecord(runs, started, deps.pid, finalRecord(deps, run));
	}
}
