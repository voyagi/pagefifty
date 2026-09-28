<script lang="ts">
	import type { QuoteText } from '$lib/tenders/tender-page';
	import Label from './Label.svelte';

	let { quote }: { quote: QuoteText } = $props();

	// Word pastes its Symbol-font bullets as private-use code points U+F0A7 and U+F0D8, which no font
	// draws, so the reader would see empty boxes. Display only: the record keeps the published text.
	const SYMBOL_BULLETS = /[\u{F0A7}\u{F0D8}]/gu;
	const BULLET = String.fromCodePoint(0x2022);

	const shown = $derived(quote.text.trim().replace(SYMBOL_BULLETS, BULLET));
</script>

<div class="quote-block">
	<Label>{quote.language}</Label>
	<blockquote class="quote" lang={quote.lang} data-notice-text>{shown}</blockquote>
</div>

<style>
	/* The block before this one belongs to another QuoteBlock, which Svelte cannot see from here. */
	:global(.quote-block) + .quote-block {
		margin-top: 1.5rem;
	}

	/* The buyer's line breaks carry meaning (numbered demands, one proof per line), so they stay;
	   nothing is clamped, however long the clause. */
	.quote {
		position: relative;
		margin: 0;
		max-width: 72ch;
		font-size: var(--step-0);
		line-height: 1.55;
		color: var(--ink);
		white-space: pre-line;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	/* The hanging opening mark follows the language, so the text edge stays on the grid. */
	.quote::before {
		content: '\201C';
		position: absolute;
		left: -0.6em;
		top: 0.1em;
		color: var(--ink-3);
	}

	.quote:lang(de)::before {
		content: '\201E';
	}

	.quote:lang(fr)::before {
		content: '\00AB';
	}
</style>
