// Which web results of a capture's buyer search the tender page lists. searches.json keeps every
// result Tavily returned, as the record of what was sent and answered; the page lists only a result
// whose title or address carries a word tender and award pages use, in German, Dutch, French or
// English, or the name of a tender portal. A search that missed the buyer then shows the empty line
// rather than pages about something else: in the 2026-10-22 capture the search for 713597-2026's
// buyer returned five pages about Florida's time zone, and the searches for BWI GmbH pages about
// Baltimore's airport. Imported by scripts/harness.mjs under Node type stripping: erasable syntax only.

// Each is looked for inside the folded title and address (foldText), so "Aufträge", "auftraege" and
// "AUFTRAG" all carry "auftrag", and "appel d'offres" and "joue-appel-offre" both carry an appel.
const TENDER_WORDS: readonly string[] = [
	// German
	'ausschreib',
	'vergabe',
	'vergibt',
	'zuschlag',
	'zuschlaeg',
	'auftrag',
	'auftraeg',
	'beschaffung',
	'einkauf',
	'lieferant',
	'rahmenvertrag',
	'submission',
	'bieterportal',
	// Dutch
	'aanbested',
	'gegund',
	'gunning',
	'overheidsopdracht',
	'aankoop',
	'inkoop',
	// French
	'marche public',
	'marches public',
	'marchespublic',
	'appel d offre',
	'appels d offre',
	'appel offre',
	'appels offre',
	'accord cadre',
	'attribu',
	'adjudic',
	// English
	'tender',
	'award',
	'contract',
	'procur',
	// Not "purchas": "Purchased an item" titles a shop's forum post.
	'purchasing',
	// Tender portals whose pages need not use any of the words above
	'ted europa',
	'dtvp',
	'bidfix',
	'govex'
];

// Lowercase, accents dropped, and every run of characters that is no letter or digit one space.
function foldText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ');
}

// An address can spell a word with percent escapes (auftr%C3%A4ge); one with a broken escape is read
// as written.
function readableAddress(url: string): string {
	try {
		return decodeURIComponent(url);
	} catch {
		return url;
	}
}

export function isTenderWebPage({ title, url }: { title: string; url: string }): boolean {
	const text = `${foldText(title)} ${foldText(readableAddress(url))}`;
	return TENDER_WORDS.some((word) => text.includes(word));
}
