// The one paced client every TED request of a capture run goes through. Imported by
// scripts/capture.mjs under Node type stripping: erasable syntax only, relative .ts imports.
import type { Transport } from '../snapshot/transport.ts';

export interface Clock {
	now(): number;
	sleep(ms: number): Promise<void>;
}

export const GAP_MS = 1000;

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

interface TedStats {
	searchPages: number;
	xmlRequests: number;
	status429: number;
	waited429Ms: number;
	retries502: number;
	failures: number;
}

type BodyRead = { ok: true; body: Uint8Array<ArrayBuffer> } | { ok: false; reason: string };

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
	// the injected clock, so a retry built from the same factory is paced like any other request.
	async function send(
		category: Category,
		makeRequest: () => Request,
		meta: RequestMeta,
		maxBytes: number
	): Promise<TedResult> {
		const request = makeRequest();
		const url = new URL(request.url);
		const refused = refusedAddress(url);
		if (refused) return fail(refused);
		const wait = lastStart + GAP_MS - clock.now();
		if (wait > 0) await clock.sleep(wait);
		lastStart = clock.now();
		counts[category === 'search' ? 'searchPages' : 'xmlRequests'] += 1;
		const at = new Date(lastStart).toISOString();
		const log = (status: number, bytes: number, headers: Record<string, string>) =>
			entries.push({
				at,
				category,
				...meta,
				attempt: 0,
				status,
				bytes,
				headers,
				url: url.hostname
			});
		let response: Response;
		try {
			response = await transport(request);
		} catch (error) {
			log(0, 0, {});
			return fail(`request failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		const headers = rateHeaders(response.headers);
		if (response.status < 200 || response.status > 299) {
			await response.body?.cancel();
			log(response.status, 0, headers);
			return fail(`status ${response.status}`, response.status);
		}
		const read = await readBody(response, maxBytes);
		if (!read.ok) {
			log(response.status, 0, headers);
			return fail(read.reason, response.status);
		}
		log(response.status, read.body.byteLength, headers);
		return { ok: true, status: response.status, body: read.body, headers: response.headers };
	}

	return {
		send,
		log: (): FetchLogEntry[] => entries.map((entry) => ({ ...entry })),
		stats: (): TedStats => ({ ...counts })
	};
}

export type TedClient = ReturnType<typeof createTedClient>;
