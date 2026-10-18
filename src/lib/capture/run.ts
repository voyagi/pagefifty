// npm run capture: TED's open IT notices into a dated, scrubbed and checked examples/<date>/ folder
// the records build reads. scripts/capture.mjs injects every dependency (the transport, the clock,
// the root, git's HEAD), so the tests drive this with a stub TED and a fake clock. Imported under
// Node type stripping: erasable syntax only, relative .ts imports.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectLatest } from '../ingest/latest.ts';
import { readNotice, MAX_NOTICE_BYTES } from '../ingest/read-notice.ts';
import type { NoticeRecord } from '../ingest/record.ts';
import { NoticeRecordSchema, SnapshotIndexSchema, toIndexRow } from '../snapshot/index-row.ts';
import { resolveModes, type Modes } from '../server/transport-mode.ts';
import type { ReadingRun } from '../snapshot/readings.ts';
import { scrubJsonValue, scrubNoticeXml } from '../snapshot/scrub.ts';
import { checkCaptureFolder } from '../snapshot/scrub-check.ts';
import type { Transport } from '../snapshot/transport.ts';
import { parseCaptureArgs } from './args.ts';
import {
	captureDate,
	publish,
	removeDeadStaging,
	stagingPath,
	writeJsonFile
} from './capture-folder.ts';
import { hitVersion, outdatedByFailed } from './failed-versions.ts';
import { loadProviderKeys, type ProviderKeys } from './keys.ts';
import { acquireLock, isAlive } from './lock.ts';
import { createMeteredGate, type MeteredGate, type MeteredProvider } from './metered.ts';
import { captureReadme } from './readme.ts';
import { buildRunRecord, writeRunRecord, type RunOutcome, type RunRecord } from './run-record.ts';
import { createTedClient, type Clock, type TedClient } from './ted-client.ts';
import { searchAll, searchBody, searchQuery, xmlTarget, type SearchHit } from './ted-search.ts';
import { createXmlCache } from './xml-cache.ts';

// What a step hands back for the published folder: a file to write into it (none when it has nothing
// to publish) and its block of run.json.
export interface StepOutput {
	file: string | null;
	value: unknown;
	recordKey: 'reading';
	record: ReadingRun;
}

// The seam phase 2's model read and Tavily search plug into. A step reaches a provider only through
// gate.attempt; its context never holds a key (the gate does), so a call that skips the gate has
// none to send.
export type MeteredStep = (context: {
	gate: MeteredGate;
	records: readonly NoticeRecord[];
}) => Promise<StepOutput | void>;

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
	meteredSteps?: readonly MeteredStep[];
	// Reads the provider keys from the key file at the path given; the default reads it from disk.
	loadKeys?: (path: string) => ProviderKeys;
}

interface Failure {
	notice: string;
	reason: string;
}

interface FailedHit {
	notice: string;
	hit: SearchHit;
}

interface ReadOne {
	number: string;
	hit: SearchHit;
	text: string;
	record: NoticeRecord;
}

type XmlCache = ReturnType<typeof createXmlCache>;

type Fetched =
	| { ok: true; raw: Uint8Array; record: NoticeRecord; cached: boolean }
	| { ok: false; reason: string };

type RawNotice = Extract<Fetched, { ok: true }>;

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
	modes: Modes;
	command: string;
	client: TedClient;
	gate: MeteredGate;
	listed: number;
	searchTotal: number;
	cacheHits: number;
	failed: Failure[];
	failedHits: FailedHit[];
	outputs: StepOutput[];
	selection?: Selection;
	end?: RunEnd;
	releaseLock?: () => void;
	// The record the staged folder holds as run.json, kept so the runs folder gets the same bytes.
	staged?: RunRecord;
}

const EXIT: Readonly<Record<RunOutcome, 0 | 1 | 2>> = { written: 0, failed: 1, refused: 2 };
const INTERRUPTED = 'interrupted';

// Spike 001's worst run met 3 transient 502s among 363 notices: room for a bad minute, not for a
// broken run.
export const MAX_FAILED_NOTICES = 5;

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

// Year, then running number: 99999-2026 comes before 610242-2026, which plain string order reverses.
export function publicationOrder(a: string, b: string): number {
	const [runningA, yearA] = a.split('-').map(Number);
	const [runningB, yearB] = b.split('-').map(Number);
	return yearA - yearB || runningA - runningB;
}

// A failure reason lands in the run record, fetch-log.json and the README, one line each.
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

// A body the reader refuses is never cached, so the next run asks TED for it again. A cached body is
// read again before use: the cache never asks TED again for a notice it holds, so a body the reader
// refuses there (one cached before a reader fix, or damaged on disk) would otherwise fail that
// notice on every later run until someone cleared the cache by hand.
async function fetchRaw(
	client: TedClient,
	cache: XmlCache,
	number: string,
	url: string
): Promise<Fetched> {
	if (cache.has(number)) {
		const raw = cache.read(number);
		const read = readNotice(raw, { noticeNumber: number });
		if (read.ok) return { ok: true, raw, record: read.record, cached: true };
		cache.remove(number);
	}
	const answer = await client.send('xml', () => new Request(url), { id: number }, MAX_NOTICE_BYTES);
	if (!answer.ok) return answer;
	const accepted = readNotice(answer.body, { noticeNumber: number });
	if (!accepted.ok) return { ok: false, reason: `${accepted.kind}: ${accepted.detail}` };
	cache.write(number, answer.body);
	return { ok: true, raw: answer.body, record: accepted.record, cached: false };
}

const criteriaOf = (record: NoticeRecord) => JSON.stringify(record.lots.map((lot) => lot.criteria));

const CRITERION_CONTACT_REASON =
	'scrub: contact data stands inside a selection criterion, which is served only as published';

// The record is read from the scrubbed bytes, the ones the records build reads from the published
// folder, and checked with the schema the build checks it with (build-records.mjs buildCapture).
// A criterion is quoted as TED published it and contact data is never kept, so a notice whose
// criteria the scrub would change can be served neither way.
function readScrubbed(number: string, hit: SearchHit, fetched: RawNotice): NoticeOutcome {
	const text = scrubNoticeXml(UTF8.decode(fetched.raw));
	const read = readNotice(new TextEncoder().encode(text), { noticeNumber: number });
	if (!read.ok)
		return { ok: false, failure: { notice: number, reason: `${read.kind}: ${read.detail}` } };
	if (criteriaOf(read.record) !== criteriaOf(fetched.record))
		return { ok: false, failure: { notice: number, reason: CRITERION_CONTACT_REASON } };
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
	const failedOne = (hit: SearchHit, notice: string, reason: string) => {
		run.failed.push({ notice, reason: oneLine(reason) });
		run.failedHits.push({ notice, hit });
	};
	const valid: { hit: SearchHit; number: string; url: string }[] = [];
	for (const hit of hits) {
		const target = xmlTarget(hit);
		if (target.ok) valid.push({ hit, number: target.number, url: target.url });
		else failedOne(hit, target.notice, target.reason);
	}
	valid.sort((a, b) => publicationOrder(a.number, b.number));
	for (const { hit, number, url } of valid) {
		const fetched = await fetchRaw(run.client, cache, number, url);
		if (!fetched.ok) {
			failedOne(hit, number, fetched.reason);
			continue;
		}
		if (fetched.cached) run.cacheHits += 1;
		const outcome = readScrubbed(number, hit, fetched);
		if (outcome.ok) notices.push(outcome.notice);
		else failedOne(hit, outcome.failure.notice, outcome.failure.reason);
	}
	return { notices, listed: new Set(valid.map(({ number }) => number)) };
}

// An allowance of failed notices alone would publish an empty or mostly missing capture from a small
// search, so fewer than half of the listed notices may fail and at least one must be written.
function failureRefusal(failed: number, listed: number, written: number): string | undefined {
	if (failed > MAX_FAILED_NOTICES) {
		return `${counted(failed, 'notice')} failed (more than ${MAX_FAILED_NOTICES})`;
	}
	if (failed * 2 >= listed)
		return `${failed} of ${counted(listed, 'notice')} failed (half or more)`;
	return written === 0 ? 'no notice was left to write' : undefined;
}

// Best effort once the folder is in place: a cache file still held open is pruned by a later run.
function pruneCache(deps: CaptureDeps, cache: XmlCache, listed: ReadonlySet<string>): void {
	try {
		const pruned = cache.prune(listed).length;
		if (pruned > 0)
			deps.log(`capture: pruned ${counted(pruned, 'cached notice')} TED no longer lists`);
	} catch (error) {
		deps.log(`capture: the cache was not pruned (${messageOf(error)}); the next run tries again`);
	}
}

// TED's onlyLatestVersions flag did not deliver latest versions in the 2026-09-15 capture, and the
// records build applies this same rule to every capture, so the command keeps what the build keeps.
function keepLatest(notices: readonly ReadOne[]): Selection {
	const byNumber = new Map(notices.map((notice) => [notice.number, notice]));
	const selection = selectLatest(notices.map((notice) => notice.record));
	const kept = selection.kept.map((record) => byNumber.get(record.noticeNumber) as ReadOne);
	return { kept, leftOut: selection.leftOut, sameProcedure: selection.sameProcedure };
}

// The latest-version rule only sees notices that were read, so an older version would be served as
// open while its newer version failed. The search names every hit's version, failed ones included,
// so that older version is left out before the run counts what it writes.
function leaveOutOutdated(selection: Selection, failed: readonly FailedHit[]): Selection {
	const outdated = outdatedByFailed(
		selection.kept.map((notice) => notice.record),
		failed
	);
	if (outdated.length === 0) return selection;
	const out = new Set(outdated.map(({ notice }) => notice));
	return {
		kept: selection.kept.filter((notice) => !out.has(notice.number)),
		leftOut: [...selection.leftOut, ...outdated].sort((a, b) =>
			publicationOrder(a.notice, b.notice)
		),
		sameProcedure: selection.sameProcedure
			.map((group) => group.filter((notice) => !out.has(notice)))
			.filter((group) => group.length > 1)
	};
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
		modes: run.modes,
		query: { query, fields, scope, onlyLatestVersions, since: run.since },
		ted: { ...run.client.stats(), cacheHits: run.cacheHits },
		notices: {
			listed: run.listed,
			written: end.outcome === 'written' && selection ? selection.kept.length : 0,
			leftOut: selection?.leftOut ?? [],
			failed: run.failed,
			sameProcedure: selection?.sameProcedure ?? []
		},
		metered: run.gate.record(),
		reading: run.outputs.find((output) => output.recordKey === 'reading')?.record ?? null
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
	const failures = run.failed.map(({ notice, reason }) => ({ notice, reason }));
	writeJsonFile(join(staging, 'fetch-log.json'), { log: run.client.log(), failures });
	writeJsonFile(join(staging, 'run.json'), record);
	writeFileSync(
		join(staging, 'README.md'),
		captureReadme({
			captureDate: run.date,
			fetchedAt: iso(run.started),
			query: searchQuery(run.since),
			since: run.since,
			modes: run.modes,
			written: selection.kept.length,
			searchTotal: run.searchTotal,
			leftOut: selection.leftOut,
			failed: failures,
			unversioned: run.failedHits.filter(({ hit }) => hitVersion(hit) === undefined).length,
			reading: record.reading
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
	// Before the checks, so the contact check reads what a step publishes too.
	for (const { file, value } of run.outputs) {
		if (file !== null) writeJsonFile(join(staging, file), value);
	}
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
		// A failed move keeps the staged folder for a person to recover the capture from, so its run.json
		// is rewritten to say the run failed and why, as the run's own record does.
		const end = ended(deps, 'failed', messageOf(error));
		const record = recordOf(deps, run, end, finishedAt);
		writeJsonFile(join(staging, 'run.json'), record);
		run.staged = record;
		return end;
	}
	const count = selection.kept.length;
	log(`capture: wrote examples/${run.date} with ${counted(count, 'notice')}`);
	return { outcome: 'written', reason: null };
}

// Leftovers of runs that died: a half-written cache file is never read as a notice, but it is
// deleted so it cannot pile up, and a dead run's staging folder holds a whole unchecked capture.
// This runs only once the lock is held, so every temp file in the cache, whatever pid wrote it,
// belongs to a run that has ended.
function removeLeftovers(deps: CaptureDeps, cache: XmlCache): void {
	const temps = cache.removeTemp();
	if (temps > 0) deps.log(`capture: removed ${counted(temps, 'stale temp file')} from the cache`);
	const staged = removeDeadStaging(deps.root, deps.isAlive ?? isAlive);
	if (staged > 0) deps.log(`capture: removed ${counted(staged, 'stale staging folder')}`);
}

// Returns the refusal, or undefined once this run holds the lock.
function takeLock(deps: CaptureDeps, run: Run): string | undefined {
	const path = join(deps.root, '.capture-cache', 'capture.lock');
	const holder = { pid: deps.pid, startedAt: iso(run.started), argv: deps.argv };
	const lock = acquireLock(path, holder, deps.isAlive ?? isAlive);
	if (!lock.ok && 'unreadable' in lock) {
		return `${path} cannot be read as a capture lock (${lock.unreadable}); if no capture is running, delete it and run again`;
	}
	if (!lock.ok && 'replacing' in lock) {
		return `another capture run is replacing the ended lock ${path}; run again once it is done, and if no capture is running, delete ${lock.replacing} and run again`;
	}
	if (!lock.ok) {
		const { pid, startedAt } = lock.holder;
		return `another capture run holds ${path} (pid ${pid}, started ${startedAt}); wait for it to end. A lock whose process has ended is replaced on its own, and when no capture is running, delete ${path}, since Windows can give a finished run's pid to another process`;
	}
	run.releaseLock = lock.release;
	if (lock.replaced) {
		const { pid, startedAt } = lock.replaced;
		deps.log(
			`capture: replaced the lock of pid ${pid}, started ${startedAt}, whose process has ended`
		);
	}
	return undefined;
}

const STEP_FAILED = 'a metered step failed';

// A provider's error text can quote the request it was sent, Authorization header and key included,
// so a send that throws reaches the step, the log and the run record only as a fixed reason naming
// the provider and the operation.
function failSafeGate(gate: MeteredGate, failures: string[]): MeteredGate {
	return {
		record: () => gate.record(),
		async attempt(provider, operation, send) {
			try {
				return await gate.attempt(provider, operation, send);
			} catch {
				const reason = `metered call ${provider} ${operation} failed`;
				failures.push(reason);
				throw new Error(reason);
			}
		}
	};
}

// After the notices are read and filtered, so no metered call is spent on a run that will publish
// nothing, and before staging, so the run.json it publishes counts every attempt. A step that throws
// fails the run, and its own error text is never written anywhere.
async function runMeteredSteps(
	deps: CaptureDeps,
	run: Run,
	selection: Selection
): Promise<RunEnd | undefined> {
	const records = selection.kept.map((notice) => notice.record);
	const failures: string[] = [];
	const gate = failSafeGate(run.gate, failures);
	for (const step of deps.meteredSteps ?? []) {
		try {
			const output = await step({ gate, records });
			if (output) run.outputs.push(output);
		} catch {
			stopIfInterrupted(deps);
			const reason = failures.at(-1) ?? STEP_FAILED;
			return ended(deps, 'failed', reason, `${reason}; nothing was written`);
		}
	}
	stopIfInterrupted(deps);
	return undefined;
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
	const refusal = takeLock(deps, run);
	if (refusal !== undefined) return ended(deps, 'refused', refusal);
	const cache = createXmlCache(join(root, '.capture-cache'), deps.pid);
	removeLeftovers(deps, cache);
	const search = await searchAll(run.client, run.since);
	stopIfInterrupted(deps);
	if (!search.ok)
		return ended(deps, 'failed', search.reason, `${search.reason}; nothing was written`);
	if (search.hits.length === 0) return ended(deps, 'failed', 'TED listed 0 notices');
	run.listed = search.hits.length;
	run.searchTotal = search.searchTotal;
	const { notices, listed } = await readHits(search.hits, run, cache);
	stopIfInterrupted(deps);
	for (const { notice, reason } of run.failed) log(`capture: ${notice}: ${reason}`);
	run.selection = leaveOutOutdated(keepLatest(notices), run.failedHits);
	const tooMany = failureRefusal(run.failed.length, run.listed, run.selection.kept.length);
	if (tooMany !== undefined) {
		return ended(deps, 'failed', tooMany, `${tooMany}; nothing was written`);
	}
	const stepFailure = await runMeteredSteps(deps, run, run.selection);
	if (stepFailure !== undefined) return stepFailure;
	const end = await stageAndPublish(deps, run, run.selection, iso(deps.clock.now()));
	if (end.outcome === 'written') pruneCache(deps, cache, listed);
	return end;
}

// A run whose staged folder is kept, published or not, has the record that folder's run.json holds;
// any other run's is built as it ends.
function finalRecord(deps: CaptureDeps, run: Run): RunRecord {
	if (run.staged && run.staged.outcome === run.end?.outcome) return run.staged;
	const end = run.end ?? { outcome: 'failed', reason: 'the run ended without an outcome' };
	return recordOf(deps, run, end, iso(deps.clock.now()));
}

const modesLine = (modes: Modes) =>
	`capture: modes ted=${modes.ted} tokenFactory=${modes.tokenFactory} tavily=${modes.tavily}`;

// JSON-quoted, so " 1" shows its space. PAGEFIFTY_LIVE is read from the shell that runs the command
// only, never from a file, which is why the message points at the shell.
function liveRefusal(value: string | undefined): string {
	const found = value === undefined ? 'unset' : JSON.stringify(value);
	return `--live was given, but PAGEFIFTY_LIVE is ${found}, not "1", so no metered call may run; set PAGEFIFTY_LIVE=1 in the shell for this one command, beside --live and --cap`;
}

type KeyRead =
	{ ok: true; keys?: Readonly<Record<MeteredProvider, string>> } | { ok: false; message: string };

const readKeyFileFromDisk = (path: string) =>
	loadProviderKeys(path, (file) => readFileSync(file, 'utf8'));

// The key file is opened only when a metered call could be made: a provider resolved live and a
// step that could call it. The one place the file's names map to the gate's providers.
function readProviderKeys(deps: CaptureDeps, modes: Modes): KeyRead {
	const live = modes.tokenFactory === 'live' || modes.tavily === 'live';
	if (!live || (deps.meteredSteps ?? []).length === 0) return { ok: true };
	try {
		const keys = (deps.loadKeys ?? readKeyFileFromDisk)(join(deps.root, '.env'));
		return { ok: true, keys: { tokenFactory: keys.NEBIUS_API_KEY, tavily: keys.TAVILY_API_KEY } };
	} catch (error) {
		return { ok: false, message: messageOf(error) };
	}
}

// Order before the first request: the start instant and day from the clock, the flags, the switch
// and the provider keys (no record: a run refused here never started), the existing-folder refusal,
// the lock, the cleanup.
export async function runCapture(deps: CaptureDeps): Promise<0 | 1 | 2> {
	const started = deps.clock.now();
	const date = captureDate(started);
	const args = parseCaptureArgs(deps.argv, date);
	if (!args.ok) {
		deps.log(`capture: ${args.message}`);
		return 2;
	}
	// The run's only read of its environment (D-22): a value changed mid-run changes nothing.
	const switchValue = deps.env.PAGEFIFTY_LIVE;
	const modes = resolveModes(args.live, { PAGEFIFTY_LIVE: switchValue });
	deps.log(modesLine(modes));
	if (args.live && (modes.tokenFactory !== 'live' || modes.tavily !== 'live')) {
		deps.log(`capture: ${liveRefusal(switchValue)}`);
		return 2;
	}
	const keyRead = readProviderKeys(deps, modes);
	if (!keyRead.ok) {
		deps.log(`capture: ${keyRead.message}; no request was made`);
		return 2;
	}
	const run: Run = {
		started,
		date,
		since: args.since,
		modes,
		command: ['node', 'scripts/capture.mjs', ...deps.argv].join(' '),
		client: createTedClient({ transport: deps.transport, clock: deps.clock }),
		// The keys go to the gate alone, never to a step (D-23).
		gate: createMeteredGate({ modes, cap: args.cap, log: deps.log, keys: keyRead.keys }),
		listed: 0,
		searchTotal: 0,
		cacheHits: 0,
		failed: [],
		failedHits: [],
		outputs: []
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
		try {
			const runs = join(deps.root, '.capture-cache', 'runs');
			writeRunRecord(runs, started, deps.pid, finalRecord(deps, run));
		} finally {
			run.releaseLock?.();
		}
	}
}
