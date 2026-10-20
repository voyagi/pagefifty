// The verdict words (SPEC R3, kept by R6 outside a listed lot's verdict): the four internal names,
// their display labels, and the UI-SPEC's extra forbidden strings. The ask-first reason labels are
// left out on purpose: they name reasons, and the reading-status tag legitimately says "No criteria
// in the notice" and the coverage list "Not read:".
import { LOT_VERDICTS, VERDICT_LABELS } from '$lib/core/verdict';

export const VERDICT_WORDS: readonly string[] = [
	...new Set([...LOT_VERDICTS, ...Object.values(VERDICT_LABELS), 'Partner needed', 'Out alone'])
];

// Attributes whose text a reader meets as page text: a screen reader announces the first two, a
// pointer shows the third, and an empty field shows the fourth.
const NAMED_BY = ['aria-label', 'alt', 'title', 'placeholder'];

interface Scope {
	// Leave out every [data-verdict] region, where a listed lot's verdict may name itself.
	outsideVerdict?: boolean;
	// Leave out the home figure, which names the verdicts it counts.
	outsideFigure?: boolean;
}

// The page's own words: everything except text marked as the notice's (titles, buyers,
// descriptions) or as a web page's (a buyer search result's title), which may say anything,
// "Go-Live" included. Each text node is its own line, since markup can set two elements side by side
// with no space between them and a word in one must never read as the tail of the text before it
// ("Lot 1GO").
const PUBLISHED_TEXT = '[data-notice-text], [data-web-text]';

export function checkedText(
	root: Element,
	{ outsideVerdict = false, outsideFigure = false }: Scope = {}
): string {
	const copy = root.cloneNode(true) as Element;
	const left = [
		PUBLISHED_TEXT,
		...(outsideVerdict ? ['[data-verdict]'] : []),
		...(outsideFigure ? ['[data-figure]'] : [])
	].join(', ');
	for (const node of copy.querySelectorAll(left)) node.remove();
	const texts: string[] = [];
	const walker = copy.ownerDocument.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		texts.push(node.nodeValue ?? '');
	}
	const names = NAMED_BY.flatMap((attribute) =>
		[...copy.querySelectorAll(`[${attribute}]`)].map((node) => node.getAttribute(attribute) ?? '')
	);
	return [...texts, ...names].join('\n');
}

// The unicode flag refuses an escaped hyphen outside a class, and none of these words sits in one.
const escaped = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-sensitive whole words, where a hyphen joins a word: "Google" and "going" hold no "Go", and
// "NO-GO" is one verdict, never "GO" as well. Longest first, so "NO-GO" wins over "GO".
const FINDER = new RegExp(
	`(?<![\\p{L}\\p{N}-])(?:${[...VERDICT_WORDS]
		.sort((a, b) => b.length - a.length)
		.map(escaped)
		.join('|')})(?![\\p{L}\\p{N}-])`,
	'gu'
);

export function findVerdictWords(root: Element, scope: Scope = {}): string[] {
	return checkedText(root, scope).match(FINDER) ?? [];
}

// The verdict words inside the [data-verdict] regions alone.
export function verdictRegionWords(root: Element): string[] {
	return [...root.querySelectorAll('[data-verdict]')].flatMap((region) => findVerdictWords(region));
}
