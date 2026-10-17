// The one paced client every TED request of a capture run goes through. Imported by
// scripts/capture.mjs under Node type stripping: erasable syntax only, relative .ts imports.
import type { Transport } from '../snapshot/transport.ts';

export interface Clock {
	now(): number;
	sleep(ms: number): Promise<void>;
}

export const GAP_MS = 1000;
// D-08: no jitter, since there is one client and nothing to desynchronise.
export const BACKOFF_MS: readonly number[] = [5000, 10000, 20000, 40000, 60000, 60000];
export const MAX_429_WAITS = BACKOFF_MS.length;
export const RETRIES_502 = 1;
// D-08 bounds the number of waits, not their length: six stated waits of a day would hold the owner
// at the keyboard for days, so a longer stated wait fails the request at once.
export const RETRY_AFTER_CEILING_MS = 300_000;

const TED_HOSTS: ReadonlySet<string> = new Set(['api.ted.europa.eu', 'ted.europa.eu']);

// The spike's list: the only response headers a log entry keeps, so the log says how TED throttles
// without storing anything else it sent.
const RATE_HEADERS = [
	'retry-after',
	'x-ratelimit-limit',
	'x-ratelimit-remaining',
	'x-ratelimit-reset',
	'ratelimit-limit',
	'ratelimit-remaining',
	'ratelimit-reset',
	'ratelimit-policy'
];

type Category = 'search' | 'xml';
type RequestMeta = { page: number } | { id: string };

export type FetchLogEntry = {
	at: string;
	category: Category;
	attempt: number;
	status: number;
	bytes: number;
	headers: Record<string, string>;
	url: string;
} & RequestMeta;

export type TedResult =
	| { ok: true; status: number; body: Uint8Array<ArrayBuffer>; headers: Headers }
	| { ok: false; reason: string; status?: number };

// searchPages and xmlRequests count requests sent, retries included, so they sum to the log's length.
interface TedStats {
	searchPages: number;
	xmlRequests: number;
	status429: number;
	waited429Ms: number;
	retries502: number;
	failures: number;
}

type BodyRead = { ok: true; body: Uint8Array<ArrayBuffer> } | { ok: false; reason: string };

interface Tries {
	attempt: number;
	waits: number;
	retries: number;
}

type Log = (status: number, bytes: number, headers: Record<string, string>) => void;

// What one answer means for its request: send it again, or this is the result.
type Step = { again: true } | { again: false; result: TedResult };

const AGAIN: Step = { again: true };

function joined(chunks: readonly Uint8Array[], total: number): Uint8Array<ArrayBuffer> {
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}

// content-length is optional and only a claim, so it can refuse a body early but never vouch for
// one: the stream is counted as it arrives and cancelled once it passes the cap, so nothing past the
// cap is ever buffered.
export async function readCapped(response: Response, maxBytes: number): Promise<BodyRead> {
	const stated = response.headers.get('content-length');
	if (stated !== null && /^\d+$/.test(stated.trim()) && Number(stated) > maxBytes) {
		await response.body?.cancel();
		return {
			ok: false,
			reason: `content-length ${stated.trim()} is over the ${maxBytes} byte cap`
		};
	}
	if (response.body === null) return { ok: true, body: new Uint8Array(0) };
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return { ok: true, body: joined(chunks, total) };
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			return { ok: false, reason: `over the ${maxBytes} byte cap` };
		}
		chunks.push(value);
	}
}

// D-06: an address that is not plain https on TED's two hosts is refused before it is sent, so a
// URL that reached the client from anywhere but the two address builders never leaves the machine.
// A Request refuses credentials in its URL itself, so the port is the one other part to check.
function refusedAddress(url: URL): string | undefined {
	const plain = url.protocol === 'https:' && url.port === '';
	return plain && TED_HOSTS.has(url.hostname)
		? undefined
		: `refused ${url.href}: not https on a TED host`;
}

// Whole seconds, or an HTTP date minus now; anything else, or a wait that is not ahead, is no answer.
export function retryAfterMs(value: string | null, nowMs: number): number | undefined {
	if (value === null) return undefined;
	const text = value.trim();
	if (/^\d+$/.test(text)) {
		const ms = Number(text) * 1000;
		return ms > 0 ? ms : undefined;
	}
	// Every HTTP-date form opens with a day name, and Date.parse alone would read '2030-01-01' too.
	if (!/^[A-Za-z]{3}/.test(text)) return undefined;
	const ms = Date.parse(text) - nowMs;
	return ms > 0 ? ms : undefined;
}

function rateHeaders(headers: Headers): Record<string, string> {
	const kept: Record<string, string> = {};
	for (const name of RATE_HEADERS) {
		const value = headers.get(name);
		if (value !== null) kept[name] = value;
	}
	return kept;
}

export function createTedClient({ transport, clock }: { transport: Transport; clock: Clock }) {
	let lastStart = Number.NEGATIVE_INFINITY;
	const entries: FetchLogEntry[] = [];
	const counts: TedStats = {
		searchPages: 0,
		xmlRequests: 0,
		status429: 0,
		waited429Ms: 0,
		retries502: 0,
		failures: 0
	};

	const fail = (reason: string, status?: number): TedResult => {
		counts.failures += 1;
		return status === undefined ? { ok: false, reason } : { ok: false, reason, status };
	};

	// One request in flight: the caller awaits each send, and the gap is measured start to start on
	// the injected clock, so every attempt of every request, retries included, is paced alike.
	async function pacedStart(): Promise<string> {
		const wait = lastStart + GAP_MS - clock.now();
		if (wait > 0) await clock.sleep(wait);
		lastStart = clock.now();
		return new Date(lastStart).toISOString();
	}

	// D-09 gives a request one retry, and a 502 and a thrown call (a reset, a DNS failure, the live
	// transport's timeout) spend the same one, so retries502 counts both.
	function retryOnce(tries: Tries): boolean {
		if (tries.retries >= RETRIES_502) return false;
		tries.retries += 1;
		counts.retries502 += 1;
		return true;
	}

	const done = (result: TedResult): Step => ({ again: false, result });

	async function on429(tries: Tries, response: Response): Promise<Step> {
		counts.status429 += 1;
		if (tries.waits >= MAX_429_WAITS) {
			return done(fail(`status 429 after ${MAX_429_WAITS} waits`, 429));
		}
		const stated = retryAfterMs(response.headers.get('retry-after'), clock.now());
		if (stated !== undefined && stated > RETRY_AFTER_CEILING_MS) {
			const seconds = Math.ceil(stated / 1000);
			const ceiling = RETRY_AFTER_CEILING_MS / 1000;
			return done(fail(`status 429 asking for ${seconds} s, over the ${ceiling} s ceiling`, 429));
		}
		const wait = Math.max(GAP_MS, stated ?? BACKOFF_MS[tries.waits]);
		tries.waits += 1;
		counts.waited429Ms += wait;
		await clock.sleep(wait);
		return AGAIN;
	}

	function onThrown(tries: Tries, error: unknown, status?: number): Step {
		if (retryOnce(tries)) return AGAIN;
		const message = error instanceof Error ? error.message : String(error);
		return done(fail(`request failed after ${RETRIES_502} retry: ${message}`, status));
	}

	// A reset or the live transport's timeout can also land while the body streams in, and that is
	// the same transient failure as one before the answer, so it spends the same retry.
	async function readAnswer(tries: Tries, response: Response, log: Log, maxBytes: number) {
		const headers = rateHeaders(response.headers);
		const { status } = response;
		let read: BodyRead;
		try {
			read = await readCapped(response, maxBytes);
		} catch (error) {
			log(status, 0, headers);
			return onThrown(tries, error, status);
		}
		if (!read.ok) {
			log(status, 0, headers);
			return done(fail(read.reason, status));
		}
		log(status, read.body.byteLength, headers);
		return done({ ok: true, status, body: read.body, headers: response.headers });
	}

	async function onAnswer(
		tries: Tries,
		response: Response,
		log: Log,
		maxBytes: number
	): Promise<Step> {
		const { status } = response;
		if (status >= 200 && status <= 299) return readAnswer(tries, response, log, maxBytes);
		await response.body?.cancel();
		log(status, 0, rateHeaders(response.headers));
		if (status === 429) return on429(tries, response);
		if (status === 502 && retryOnce(tries)) return AGAIN;
		const after = status === 502 ? ` after ${RETRIES_502} retry` : '';
		return done(fail(`status ${status}${after}`, status));
	}

	async function send(
		category: Category,
		makeRequest: () => Request,
		meta: RequestMeta,
		maxBytes: number
	): Promise<TedResult> {
		const tries: Tries = { attempt: 0, waits: 0, retries: 0 };
		for (;;) {
			const request = makeRequest();
			const url = new URL(request.url);
			const refused = refusedAddress(url);
			if (refused) return fail(refused);
			const at = await pacedStart();
			counts[category === 'search' ? 'searchPages' : 'xmlRequests'] += 1;
			const attempt = tries.attempt;
			tries.attempt += 1;
			const log: Log = (status, bytes, headers) =>
				entries.push({ at, category, ...meta, attempt, status, bytes, headers, url: url.hostname });
			let response: Response;
			try {
				response = await transport(request);
			} catch (error) {
				log(0, 0, {});
				const step = onThrown(tries, error);
				if (step.again) continue;
				return step.result;
			}
			// Outside the try: a wait the clock refuses (the command's Ctrl+C) must end the run, never
			// pass for a failed request that gets retried.
			const step = await onAnswer(tries, response, log, maxBytes);
			if (!step.again) return step.result;
		}
	}

	return {
		send,
		log: (): FetchLogEntry[] => entries.map((entry) => ({ ...entry })),
		stats: (): TedStats => ({ ...counts })
	};
}

export type TedClient = ReturnType<typeof createTedClient>;
