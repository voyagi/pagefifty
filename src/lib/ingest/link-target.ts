// The one rule for turning an address a notice publishes into a link target: only an absolute http
// or https URL, written as the URL parser writes it. safeLink builds every record with it, and the
// documents link applies it again where the address becomes an href, so a record from anywhere
// else cannot put a script into the page.
// Imported by record.ts, which scripts/build-records.mjs loads under Node type stripping, so
// erasable syntax only.
const LINK_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:']);

export function linkTarget(address: string): string | undefined {
	let url: URL;
	try {
		url = new URL(address);
	} catch {
		return undefined;
	}
	return LINK_SCHEMES.has(url.protocol) ? url.href : undefined;
}
