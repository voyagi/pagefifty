<script lang="ts">
	import { displayRuns, findQuotes, runsBetween } from '$lib/tenders/display-text';
	import type { QuoteText } from '$lib/tenders/tender-page';
	import Label from './Label.svelte';
	import ProseRuns from './ProseRuns.svelte';

	// marks are verified requirement quotes to set apart inside the clause as the words that decide.
	let { quote, marks = [] }: { quote: QuoteText; marks?: readonly string[] } = $props();

	// Word pastes its Symbol-font bullets as private-use code points U+F0A7 and U+F0D8, which no font
	// draws, so the reader would see empty boxes. Display only: the record keeps the published text.
	const SYMBOL_BULLETS = /[\u{F0A7}\u{F0D8}]/gu;
	const BULLET = String.fromCodePoint(0x2022);

	const shown = $derived(quote.text.trim().replace(SYMBOL_BULLETS, BULLET));
	const runs = $derived(displayRuns(shown));

	// The clause cut into the stretches each mark covers and the stretches between them; each is
	// drawn by its runs, so a word the PDF broke at a line end reads whole wherever it falls.
	const parts = $derived.by(() => {
		const pieces: { start: number; end: number; marked: boolean }[] = [];
		let at = 0;
		for (const { start, end } of findQuotes(shown, marks)) {
			if (start > at) pieces.push({ start: at, end: start, marked: false });
			pieces.push({ start, end, marked: true });
			at = end;
		}
		if (at < shown.length) pieces.push({ start: at, end: shown.length, marked: false });
		return pieces;
	});
</script>

<div class="quote-block">
	<Label>{quote.language}</Label>
	<blockquote class="quote" lang={quote.lang} data-notice-text>
		{#each parts as part (part.start)}{#if part.marked}<mark
					><ProseRuns runs={runsBetween(runs, part.start, part.end)} /></mark
				>{:else}<ProseRuns runs={runsBetween(runs, part.start, part.end)} />{/if}{/each}
	</blockquote>
</div>

<style>
	/* The block before this one belongs to another QuoteBlock, which Svelte cannot see from here. */
	:global(.quote-block) + .quote-block {
		margin-top: 1.25rem;
	}

	/* The buyer's words in their own box, set for reading: the PDF's hard line ends read as spaces,
	   a word it broke at a line end reads whole and wraps by the language's own hyphenation, and
	   blank lines and list items keep their breaks. Nothing is clamped, however long the clause. */
	.quote {
		margin: 0;
		max-width: 72ch;
		padding: 0.6875rem 0.875rem 0.75rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r);
		background: var(--bg);
		font-size: 0.96875rem;
		line-height: 1.55;
		color: var(--ink);
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	/* The deciding words: weight and an underline in the brand green, never a highlighter wash. */
	mark {
		background: none;
		color: inherit;
		font-weight: 700;
		text-decoration: underline 2px var(--brand);
		text-underline-offset: 4px;
	}
</style>
