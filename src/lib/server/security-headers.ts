// Browser-enforced headers that neither the CSP nor the host adds. Pages come from the Worker and
// get them in hooks.server.ts; static files are served by Cloudflare without running the Worker,
// so they get them from the root _headers file, which the test holds to this same list.
export const SECURITY_HEADERS = {
	// Two years. HSTS needs at least six months to count, and a shorter value buys nothing here.
	'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
	'X-Content-Type-Options': 'nosniff',
	// A link out to TED or a buyer's site carries this site's origin, never the tender a user read.
	'Referrer-Policy': 'strict-origin-when-cross-origin'
} as const;

function setAll(headers: Headers): void {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
}

export function withSecurityHeaders(response: Response): Response {
	try {
		setAll(response.headers);
		return response;
	} catch (error) {
		// Response.redirect() and a fetched response carry immutable headers, and set() throws a
		// TypeError on them (SvelteKit's hooks docs), so such a response is copied, not turned into a 500.
		if (!(error instanceof TypeError)) throw error;
		const copy = new Response(response.body, response);
		setAll(copy.headers);
		return copy;
	}
}
