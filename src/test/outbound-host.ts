// The one host decision every vitest project's outbound guard applies. It must stay free of
// Node imports: the workerd guard loads it inside the Workers runtime.
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
	'localhost',
	'127.0.0.1',
	'::1',
	'[::1]'
]);

// Exact equality, never a prefix or substring match, so localhost.example.com stays refused.
export function isAllowedHost(hostname: string): boolean {
	return ALLOWED_HOSTS.has(hostname.toLowerCase());
}

export class OutboundGuardError extends Error {
	override readonly name = 'OutboundGuardError';

	constructor(host: string) {
		super(
			`Outbound request to "${host}" refused: tests never reach the network. Serve a local fixture on 127.0.0.1 or use the snapshot transport.`
		);
	}
}

function assertAllowedUrl(url: string | URL): void {
	const { hostname } = new URL(url);
	if (!isAllowedHost(hostname)) throw new OutboundGuardError(hostname);
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
// The headers that describe a request body; fetch drops them together with the body.
const BODY_HEADERS = ['content-encoding', 'content-language', 'content-location', 'content-type'];

function methodAfterRedirect(status: number, method: string): string {
	if (status === 303 && method !== 'HEAD') return 'GET';
	if ((status === 301 || status === 302) && method === 'POST') return 'GET';
	return method;
}

// A fetch left to follow redirects itself would leave the machine after the first host passed,
// so the wrapper follows them and checks every hop. The first hop is the caller's own request,
// told only to hand a redirect back, so every option it set (integrity, cache and the rest) still
// applies. A later hop carries the method, the headers and the body, not those options.
export function guardFetch(realFetch: typeof fetch): typeof fetch {
	return async function guardedFetch(input, init) {
		const first = new Request(input, init);
		assertAllowedUrl(first.url);
		if (first.redirect !== 'follow') return realFetch(first);
		// Taken before the first hop reads the body, for a redirect that sends it again.
		const spare = first.clone();
		let response = await realFetch(new Request(first, { redirect: 'manual' }));
		let url = first.url;
		let method = first.method;
		const headers = new Headers(first.headers);
		let body: ArrayBuffer | null | undefined;
		for (let redirects = 0; ; redirects++) {
			const location = response.headers.get('location');
			if (!REDIRECT_STATUSES.has(response.status) || location === null) return response;
			await response.body?.cancel();
			if (redirects === MAX_REDIRECTS) {
				throw new TypeError(`fetch failed: more than ${MAX_REDIRECTS} redirects from ${first.url}`);
			}
			url = new URL(location, url).href;
			assertAllowedUrl(url);
			const next = methodAfterRedirect(response.status, method);
			if (next !== method) {
				body = null;
				for (const name of BODY_HEADERS) headers.delete(name);
			} else if (body === undefined) {
				body = spare.body === null ? null : await spare.arrayBuffer();
			}
			method = next;
			response = await realFetch(url, {
				method,
				headers,
				body,
				redirect: 'manual',
				signal: first.signal
			});
		}
	};
}
