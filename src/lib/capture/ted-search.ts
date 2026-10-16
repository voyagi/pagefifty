// TED's search request and its paging, and the one place a search hit becomes an XML address.
// Imported by scripts/capture.mjs under Node type stripping: erasable syntax only.
import { NOTICE_NUMBER } from '../snapshot/index-row.ts';
import { tedNoticeXmlUrl } from '../snapshot/transport.ts';
import type { TedClient } from './ted-client.ts';

export const TED_SEARCH_URL = 'https://api.ted.europa.eu/v3/notices/search';

// The fields the list cards read, in the spike's order.
export const SEARCH_FIELDS: readonly string[] = [
	'publication-number',
	'buyer-country',
	'classification-cpv',
	'publication-date',
	'deadline-receipt-tender-date-lot',
	'selection-criterion-lot',
	'selection-criterion-description-lot',
	'document-url-lot',
	'links'
];

const PAGE_LIMIT = 250;
export const MAX_SEARCH_PAGE_BYTES = 20 * 1024 * 1024;

export type SearchHit = Record<string, unknown>;

type SearchResult =
	| { ok: true; hits: SearchHit[]; searchTotal: number; pages: number }
	| { ok: false; reason: string };

type SearchPage = { notices: SearchHit[]; totalNoticeCount: number };

// The site reads the window's first day from exactly one publication-date>=YYYYMMDD clause
// (capture-id.ts), so the query is written in that form and no other.
export function searchQuery(since: string): string {
	return `classification-cpv IN (72000000 48000000) AND buyer-country IN (NLD BEL DEU) AND publication-date>=${since} AND notice-type=cn-standard`;
}

export function searchBody(since: string, page: number) {
	return {
		query: searchQuery(since),
		fields: [...SEARCH_FIELDS],
		limit: PAGE_LIMIT,
		page,
		scope: 'ACTIVE',
		onlyLatestVersions: true
	};
}

function searchRequest(since: string, page: number): Request {
	return new Request(TED_SEARCH_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify(searchBody(since, page))
	});
}

function parsePage(body: Uint8Array): SearchPage | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(body));
	} catch {
		return undefined;
	}
	if (typeof parsed !== 'object' || parsed === null) return undefined;
	const { notices, totalNoticeCount } = parsed as Record<string, unknown>;
	if (!Array.isArray(notices) || typeof totalNoticeCount !== 'number') return undefined;
	return { notices: notices as SearchHit[], totalNoticeCount };
}

export async function searchAll(client: TedClient, since: string): Promise<SearchResult> {
	const hits: SearchHit[] = [];
	let searchTotal = 0;
	let page = 0;
	do {
		page += 1;
		const current = page;
		const answer = await client.send(
			'search',
			() => searchRequest(since, current),
			{ page },
			MAX_SEARCH_PAGE_BYTES
		);
		if (!answer.ok) return { ok: false, reason: `search page ${page}: ${answer.reason}` };
		const parsed = parsePage(answer.body);
		if (parsed === undefined) {
			return {
				ok: false,
				reason: `search page ${page}: not an object with a notices list and a numeric totalNoticeCount`
			};
		}
		// An empty page before the stated total is reached would page forever.
		if (parsed.notices.length === 0 && hits.length < parsed.totalNoticeCount) {
			return {
				ok: false,
				reason: `search page ${page} listed no notices with ${hits.length} of ${parsed.totalNoticeCount} collected`
			};
		}
		hits.push(...parsed.notices);
		searchTotal = parsed.totalNoticeCount;
	} while (hits.length < searchTotal);
	return { ok: true, hits, searchTotal, pages: page };
}

// D-06: the address is built from the publication number, never taken from the hit's links, and the
// number must have TED's shape before it becomes a URL or a file name.
export function xmlTarget(
	hit: SearchHit
): { ok: true; number: string; url: string } | { ok: false; notice: string; reason: string } {
	const number = hit['publication-number'];
	if (typeof number !== 'string' || !NOTICE_NUMBER.test(number)) {
		return {
			ok: false,
			notice: typeof number === 'string' ? number : '(none)',
			reason: `publication-number ${JSON.stringify(number ?? null)} is not a TED notice number`
		};
	}
	return { ok: true, number, url: tedNoticeXmlUrl(number) };
}
