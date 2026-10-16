// TED's search request and its paging, and the one place a search hit becomes an XML address.
// Imported by scripts/capture.mjs under Node type stripping: erasable syntax only.
import { NOTICE_NUMBER } from '../snapshot/index-row.ts';
import { tedNoticeXmlUrl } from '../snapshot/transport.ts';
import type { TedClient } from './ted-client.ts';

export const TED_SEARCH_URL = 'https://api.ted.europa.eu/v3/notices/search';

// The fields the list cards read, in the spike's order, then each hit's notice identifier and version,
// which say whether a notice whose XML failed was a newer version of one the run read.
export const SEARCH_FIELDS: readonly string[] = [
	'publication-number',
	'buyer-country',
	'classification-cpv',
	'publication-date',
	'deadline-receipt-tender-date-lot',
	'selection-criterion-lot',
	'selection-criterion-description-lot',
	'document-url-lot',
	'links',
	'notice-identifier',
	'notice-version'
];

const PAGE_LIMIT = 250;
export const MAX_SEARCH_PAGE_BYTES = 20 * 1024 * 1024;

export type SearchHit = Record<string, unknown>;

type SearchResult =
	| { ok: true; hits: SearchHit[]; searchTotal: number; pages: number }
	| { ok: false; reason: string };

type SearchPage = { notices: SearchHit[]; totalNoticeCount: number; timedOut: boolean };

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
	const { notices, totalNoticeCount, timedOut } = parsed as Record<string, unknown>;
	if (!Array.isArray(notices) || typeof totalNoticeCount !== 'number') return undefined;
	return { notices: notices as SearchHit[], totalNoticeCount, timedOut: timedOut === true };
}

// A partial listing would be served as the whole population, the reason the records build refuses a
// total that differs from the listed count. So a page TED cut short, a count that does not add up,
// or a number seen twice (the listing moved between pages, so another notice may have been skipped
// while the count still matched) ends the search.
function pageRefusal(page: SearchPage, hits: SearchHit[], seen: Set<string>): string | undefined {
	const total = page.totalNoticeCount;
	if (page.timedOut) return 'TED timed out building the listing (timedOut true)';
	// An empty page before the stated total is reached would page forever.
	if (page.notices.length === 0 && hits.length < total) {
		return `listed no notices with ${hits.length} of ${total} collected`;
	}
	for (const hit of page.notices) {
		const number = hit['publication-number'];
		if (typeof number !== 'string') continue;
		if (seen.has(number))
			return `${number} was listed twice, so the listing moved while it was read`;
		seen.add(number);
	}
	hits.push(...page.notices);
	return hits.length > total
		? `${hits.length} hits collected against a stated total of ${total}`
		: undefined;
}

export async function searchAll(client: TedClient, since: string): Promise<SearchResult> {
	const hits: SearchHit[] = [];
	const seen = new Set<string>();
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
		const refusal = pageRefusal(parsed, hits, seen);
		if (refusal !== undefined) return { ok: false, reason: `search page ${page}: ${refusal}` };
		searchTotal = parsed.totalNoticeCount;
	} while (hits.length < searchTotal);
	return { ok: true, hits, searchTotal, pages: page };
}

function namesXml(hit: SearchHit): boolean {
	const { links } = hit;
	if (typeof links !== 'object' || links === null) return false;
	const { xml } = links as Record<string, unknown>;
	if (typeof xml !== 'object' || xml === null || Array.isArray(xml)) return false;
	return Object.values(xml).some((address) => typeof address === 'string' && address !== '');
}

// D-06: the address is built from the publication number, never taken from the hit's links, and the
// number must have TED's shape before it becomes a URL or a file name. links.xml is only the proof
// that an XML exists, so a hit without it is failed without asking TED.
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
	if (!namesXml(hit))
		return { ok: false, notice: number, reason: 'no XML link in the search answer' };
	return { ok: true, number, url: tedNoticeXmlUrl(number) };
}
