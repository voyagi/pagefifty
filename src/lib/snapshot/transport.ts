// The one seam every tender read goes through. Phase 1 has only the snapshot transport, which
// answers from recorded responses and never calls fetch; phase 1.1's live transport has the same
// type. Imported by scripts/build-records.mjs under Node type stripping: erasable syntax only.

export type Transport = (request: Request) => Promise<Response>;

export function tedNoticeXmlUrl(notice: string): string {
	return `https://ted.europa.eu/en/notice/${encodeURIComponent(notice)}/xml`;
}

function hex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Method, URL and a hash of the body name a recorded response. The request is cloned so the caller
// can still read its body.
export async function requestKey(request: Request): Promise<string> {
	const url = new URL(request.url);
	url.hash = '';
	url.searchParams.sort();
	const digest = await crypto.subtle.digest('SHA-256', await request.clone().arrayBuffer());
	return `${request.method} ${url.href} ${hex(digest)}`;
}

// A miss answers 599, a status no server sends, with the key in the body, so a missing recording is
// named where it is found and never turns into a network call.
export function createSnapshotTransport<Ref>(
	entries: ReadonlyMap<string, Ref>,
	readBody: (ref: Ref) => Promise<Uint8Array<ArrayBuffer>>
): Transport {
	return async (request) => {
		const key = await requestKey(request);
		const ref = entries.get(key);
		if (ref === undefined) {
			return new Response(`snapshot miss: no recorded response for ${key}`, {
				status: 599,
				headers: { 'content-type': 'text/plain; charset=utf-8' }
			});
		}
		return new Response(await readBody(ref), { status: 200 });
	};
}
