// npm run capture: TED's open IT notices into a dated, scrubbed and checked examples/<date>/ folder
// the records build reads. scripts/capture.mjs injects every dependency (the transport, the clock,
// the root, git's HEAD), so the tests drive this with a stub TED and a fake clock. Imported under
// Node type stripping: erasable syntax only, relative .ts imports.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

type Fetched = { ok: true; raw: Uint8Array } | { ok: false; reason: string };

type Outcome = { ok: true; notice: ReadOne } | { ok: false; failure: Failure };

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
	if (cache.has(number)) return { ok: true, raw: cache.read(number) };
	const answer = await client.send('xml', () => new Request(url), { id: number }, MAX_NOTICE_BYTES);
	if (!answer.ok) return answer;
	const accepted = readNotice(answer.body, { noticeNumber: number });
	if (!accepted.ok) return { ok: false, reason: `${accepted.kind}: ${accepted.detail}` };
	cache.write(number, answer.body);
	return { ok: true, raw: answer.body };
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
	const targets = hits.map((hit) => ({ hit, target: xmlTarget(hit) }));
	const valid: { hit: SearchHit; number: string; url: string }[] = [];
	for (const { hit, target } of targets) {
		if (target.ok) valid.push({ hit, ...target });
		else failed.push({ notice: target.notice, reason: target.reason });
	}
	valid.sort((a, b) => publicationOrder(a.number, b.number));
	for (const { hit, number, url } of valid) {
		const fetched = await fetchRaw(client, cache, number, url);
		if (!fetched.ok) {
			failed.push({ notice: number, reason: fetched.reason });
			continue;
		}
		const outcome = readScrubbed(number, hit, fetched.raw);
		if (outcome.ok) notices.push(outcome.notice);
		else failed.push(outcome.failure);
	}
	return { notices, failed };
}

interface Listing {
	date: string;
	fetchedAt: string;
	since: string;
	searchTotal: number;
	notices: readonly ReadOne[];
}

function stage(staging: string, listing: Listing): void {
	rmSync(staging, { recursive: true, force: true, maxRetries: 5 });
	mkdirSync(join(staging, 'xml'), { recursive: true });
	for (const notice of listing.notices) {
		writeFileSync(join(staging, 'xml', `${notice.number}.xml`), notice.text);
	}
	const { query, scope, onlyLatestVersions } = searchBody(listing.since, 1);
	writeJsonFile(
		join(staging, 'notices.json'),
		scrubJsonValue({
			fetchedAt: listing.fetchedAt,
			query,
			scope,
			onlyLatestVersions,
			since: listing.since,
			total: listing.notices.length,
			searchTotal: listing.searchTotal,
			notices: listing.notices.map((notice) => notice.hit)
		})
	);
	writeFileSync(
		join(staging, 'README.md'),
		captureReadme({
			captureDate: listing.date,
			fetchedAt: listing.fetchedAt,
			query,
			since: listing.since,
			written: listing.notices.length,
			searchTotal: listing.searchTotal
		})
	);
}

// The records build refuses a whole capture on one record or index it rejects
// (build-records.mjs buildCapture), which would turn npm test, dev and build red, so the command
// applies the same two checks before it publishes, and then the one contact check the scrub script runs.
function stagedProblems(staging: string, listing: Listing): string[] {
	const index = SnapshotIndexSchema.safeParse({
		capture: {
			id: listing.date,
			fetchedAt: listing.fetchedAt,
			total: listing.searchTotal,
			query: searchQuery(listing.since)
		},
		leftOut: [],
		rows: listing.notices.map((notice) => toIndexRow(notice.record))
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

export async function runCapture(deps: CaptureDeps): Promise<0 | 1 | 2> {
	const { root, clock, log } = deps;
	const startedAt = clock.now();
	const date = captureDate(startedAt);
	const target = join(root, 'examples', date);
	if (existsSync(target)) {
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
	const { notices, failed } = await readHits(search.hits, client, cache);
	if (failed.length > 0) {
		for (const { notice, reason } of failed) log(`capture: ${notice}: ${reason}`);
		log(`capture: ${failed.length} notices failed; nothing was written`);
		return 1;
	}
	const listing: Listing = {
		date,
		fetchedAt: new Date(startedAt).toISOString(),
		since,
		searchTotal: search.searchTotal,
		notices
	};
	const staging = stagingPath(root, date, deps.pid);
	stage(staging, listing);
	const problems = stagedProblems(staging, listing);
	if (problems.length > 0) {
		rmSync(staging, { recursive: true, force: true, maxRetries: 5 });
		for (const problem of problems) log(`capture: ${problem}`);
		log('capture: the staged folder failed its checks; nothing was written');
		return 1;
	}
	try {
		await publish(staging, target, clock);
	} catch (error) {
		log(`capture: ${error instanceof Error ? error.message : String(error)}`);
		return 1;
	}
	log(`capture: wrote examples/${date} with ${notices.length} notices`);
	return 0;
}
