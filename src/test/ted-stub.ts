// TED's side of the wire for every capture test. A search answers the named notices' listing entries
// from the tracked 2026-09-15 capture, and a notice XML GET answers its tracked file, both read by
// notice number and never copied. A test scripts anything else per URL, and every call is recorded
// on the fake clock the capture code paces itself with.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tedNoticeXmlUrl, type Transport } from '../lib/snapshot/transport.ts';
import { capturePath } from './fixtures/node.ts';
import { CAPTURE_ID } from './fixtures/roles.ts';

const TED_SEARCH_URL = 'https://api.ted.europa.eu/v3/notices/search';

type ScriptedBody = string | Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>;

type ScriptedAnswer =
	{ status: number; headers?: Record<string, string>; body?: ScriptedBody } | { throws: Error };

interface StubCall {
	at: number;
	method: string;
	url: string;
	body: unknown;
}

interface ListingEntry {
	'publication-number': string;
}

export function createFakeClock(startMs: number) {
	let current = startMs;
	const slept: number[] = [];
	return {
		now: () => current,
		// Refused at the call, not in the promise: a pacing rule that computes a negative wait must
		// fail where it computed it, never move the clock back.
		sleep(ms: number): Promise<void> {
			if (!(Number.isFinite(ms) && ms >= 0)) {
				throw new RangeError(`fake clock: cannot sleep ${ms} ms`);
			}
			slept.push(ms);
			current += ms;
			return Promise.resolve();
		},
		sleeps: () => [...slept]
	};
}

let listing: Map<string, ListingEntry> | undefined;

function listingEntry(notice: string): ListingEntry | undefined {
	listing ??= new Map(
		(
			JSON.parse(readFileSync(join('examples', CAPTURE_ID, 'notices.json'), 'utf8')) as {
				notices: ListingEntry[];
			}
		).notices.map((entry) => [entry['publication-number'], entry])
	);
	return listing.get(notice);
}

function parsedBody(text: string): unknown {
	if (text === '') return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function searchWindow(body: unknown): { page: number; limit: number } | null {
	if (typeof body !== 'object' || body === null) return null;
	const { page, limit } = body as { page?: unknown; limit?: unknown };
	const whole = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1;
	return whole(page) && whole(limit) ? { page, limit } : null;
}

// An unscripted answer must fail loudly: a capture test that got an answer nobody chose would pass
// against data no test decided on. 599 is a status no server sends, as in the snapshot transport.
function unscripted(method: string, url: string, detail = ''): Response {
	return new Response(`ted stub: nothing scripted for ${method} ${url}${detail}`, {
		status: 599,
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
}

export function createScriptedTed(options: {
	clock: { now(): number };
	notices: readonly string[];
	script?: Readonly<Record<string, readonly ScriptedAnswer[]>>;
}) {
	const entries = options.notices.map((notice) => {
		const entry = listingEntry(notice);
		if (entry === undefined) {
			throw new Error(
				`ted stub: ${notice} is not in the ${CAPTURE_ID} listing; serve a synthetic notice through script`
			);
		}
		return entry;
	});
	const xmlNotices = new Map(options.notices.map((notice) => [tedNoticeXmlUrl(notice), notice]));
	const queues = new Map(
		Object.entries(options.script ?? {}).map(([url, answers]) => [new URL(url).href, [...answers]])
	);
	const log: StubCall[] = [];
	let inFlight = 0;
	let mostInFlight = 0;

	const defaultAnswer = (method: string, url: string, body: unknown): Response => {
		if (method === 'POST' && url === TED_SEARCH_URL) {
			const window = searchWindow(body);
			if (window === null) {
				return unscripted(method, url, ' (a search body needs whole page and limit numbers)');
			}
			const from = (window.page - 1) * window.limit;
			return Response.json({
				notices: entries.slice(from, from + window.limit),
				totalNoticeCount: entries.length,
				timedOut: false
			});
		}
		const notice = xmlNotices.get(url);
		if (method === 'GET' && notice !== undefined) {
			return new Response(readFileSync(capturePath(notice)), { status: 200 });
		}
		return unscripted(method, url);
	};

	const transport: Transport = async (request) => {
		const call: StubCall = {
			at: options.clock.now(),
			method: request.method,
			url: request.url,
			body: undefined
		};
		log.push(call);
		inFlight += 1;
		mostInFlight = Math.max(mostInFlight, inFlight);
		try {
			call.body = parsedBody(await request.text());
			const queued = queues.get(request.url)?.shift();
			if (queued === undefined) return defaultAnswer(request.method, request.url, call.body);
			if ('throws' in queued) throw queued.throws;
			return new Response(queued.body ?? null, { status: queued.status, headers: queued.headers });
		} finally {
			inFlight -= 1;
		}
	};

	return Object.assign(transport, {
		calls: () => log.map((entry) => ({ ...entry })),
		maxInFlight: () => mostInFlight
	});
}
