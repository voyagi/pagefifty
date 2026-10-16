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

function refusal(status: number, tries: Tries): string {
	if (status === 429) return `status 429 after ${tries.waits} waits`;
	if (status === 502) return `status 502 after ${tries.retries} retry`;
	return `status ${status}`;
}

async function readBody(response: Response, maxBytes: number): Promise<BodyRead> {
	const body = new Uint8Array(await response.arrayBuffer());
	return body.byteLength > maxBytes
		? { ok: false, reason: `${body.byteLength} bytes, over the ${maxBytes} byte cap` }
		: { ok: true, body };
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
	// Every HTTP-date form opens with a day name, and Date.parse alone would read '2030' as a year.
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

	async function waitOn429(tries: Tries, response: Response): Promise<boolean> {
		counts.status429 += 1;
		if (tries.waits >= MAX_429_WAITS) return false;
		const stated = retryAfterMs(response.headers.get('retry-after'), clock.now());
		const wait = Math.max(GAP_MS, stated ?? BACKOFF_MS[tries.waits]);
		tries.waits += 1;
		counts.waited429Ms += wait;
		await clock.sleep(wait);
		return true;
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
			const log = (status: number, bytes: number, headers: Record<string, string>) =>
				entries.push({ at, category, ...meta, attempt, status, bytes, headers, url: url.hostname });
			let response: Response;
			try {
				response = await transport(request);
			} catch (error) {
				log(0, 0, {});
				if (retryOnce(tries)) continue;
				const message = error instanceof Error ? error.message : String(error);
				return fail(`request failed after ${RETRIES_502} retry: ${message}`);
			}
			const headers = rateHeaders(response.headers);
			const { status } = response;
			if (status < 200 || status > 299) {
				await response.body?.cancel();
				log(status, 0, headers);
				if (status === 429 && (await waitOn429(tries, response))) continue;
				if (status === 502 && retryOnce(tries)) continue;
				return fail(refusal(status, tries), status);
			}
			const read = await readBody(response, maxBytes);
			if (!read.ok) {
				log(status, 0, headers);
				return fail(read.reason, status);
			}
			log(status, read.body.byteLength, headers);
			return { ok: true, status, body: read.body, headers: response.headers };
		}
	}

	return {
		send,
		log: (): FetchLogEntry[] => entries.map((entry) => ({ ...entry })),
		stats: (): TedStats => ({ ...counts })
	};
}

export type TedClient = ReturnType<typeof createTedClient>;
