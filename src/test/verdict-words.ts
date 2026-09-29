// The words no phase 1 page may show (SPEC R3): the four internal verdict names, their display
// labels, and the UI-SPEC's extra forbidden strings. The ask-first reason labels are left out on
// purpose: they name reasons, and the reading-status tag legitimately says "No criteria in the
// notice" and the coverage list "Not read:".
import { LOT_VERDICTS, VERDICT_LABELS } from '$lib/core/verdict';

export const VERDICT_WORDS: readonly string[] = [
	...new Set([...LOT_VERDICTS, ...Object.values(VERDICT_LABELS), 'Partner needed', 'Out alone'])
];

// The page's own words: everything except text marked as the notice's (titles, buyers,
// descriptions), which may say anything, "Go-Live" included. Accessible names count too, since a
// screen reader announces them as page text.
export function checkedText(root: Element): string {
	const copy = root.cloneNode(true) as Element;
	for (const node of copy.querySelectorAll('[data-notice-text]')) node.remove();
	const names = [...copy.querySelectorAll('[aria-label]')].map(
		(node) => node.getAttribute('aria-label') ?? ''
	);
	return [copy.textContent ?? '', ...names].join('\n');
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

export function findVerdictWords(root: Element): string[] {
	return checkedText(root).match(FINDER) ?? [];
}
