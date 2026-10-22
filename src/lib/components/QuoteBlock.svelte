<script lang="ts">
	import type { QuoteText } from '$lib/tenders/tender-page';
	import Label from './Label.svelte';

	// marks are verified requirement quotes to set apart inside the clause as the words that decide.
	let { quote, marks = [] }: { quote: QuoteText; marks?: readonly string[] } = $props();

	// Word pastes its Symbol-font bullets as private-use code points U+F0A7 and U+F0D8, which no font
	// draws, so the reader would see empty boxes. Display only: the record keeps the published text.
	const SYMBOL_BULLETS = /[\u{F0A7}\u{F0D8}]/gu;
	const BULLET = String.fromCodePoint(0x2022);

	const shown = $derived(quote.text.trim().replace(SYMBOL_BULLETS, BULLET));

	const escaped = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	// Code checked each quote against the clause with its whitespace collapsed, so a quote is found
	// across any run of spaces or line breaks. One it cannot find is simply not marked, and marks
	// that overlap an earlier one are dropped, so the text itself is never cut or repeated.
	const parts = $derived.by(() => {
		const found = marks
			.map((mark) => mark.trim().split(/\s+/).filter(Boolean).map(escaped).join('\\s+'))
			.filter((pattern) => pattern !== '')
			.flatMap((pattern) => {
				const match = new RegExp(pattern, 'u').exec(shown);
				return match === null ? [] : [{ start: match.index, end: match.index + match[0].length }];
			})
			.sort((a, b) => a.start - b.start);
		const pieces: { text: string; marked: boolean }[] = [];
		let at = 0;
		for (const { start, end } of found) {
			if (start < at) continue;
			if (start > at) pieces.push({ text: shown.slice(at, start), marked: false });
			pieces.push({ text: shown.slice(start, end), marked: true });
			at = end;
		}
		if (at < shown.length) pieces.push({ text: shown.slice(at), marked: false });
		return pieces;
	});
</script>

<div class="quote-block">
	<Label>{quote.language}</Label>
	<blockquote class="quote" lang={quote.lang} data-notice-text>
		{#each parts as part, index (index)}{#if part.marked}<mark>{part.text}</mark
				>{:else}{part.text}{/if}{/each}
	</blockquote>
</div>

<style>
	/* The block before this one belongs to another QuoteBlock, which Svelte cannot see from here. */
	:global(.quote-block) + .quote-block {
		margin-top: 1.25rem;
	}

	/* The buyer's words in their own box. Their line breaks carry meaning (numbered demands, one
	   proof per line), so they stay; nothing is clamped, however long the clause. */
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
		white-space: pre-line;
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
