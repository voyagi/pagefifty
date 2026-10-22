<script lang="ts">
	import { displayRuns, findQuotes, runsBetween, type QuoteMark } from '$lib/tenders/display-text';
	import type { QuoteText } from '$lib/tenders/tender-page';
	import Label from './Label.svelte';
	import ProseRuns from './ProseRuns.svelte';

	// marks are verified requirement quotes to set apart inside the clause. source names where the
	// words are quoted from, on the language's own line. clamp shows the first six lines only, for an
	// excerpt whose whole clause is a click away.
	let {
		quote,
		marks = [],
		source,
		clamp = false
	}: {
		quote: QuoteText;
		marks?: readonly QuoteMark[];
		source?: string;
		clamp?: boolean;
	} = $props();

	// Word pastes its Symbol-font bullets as private-use code points U+F0A7 and U+F0D8, which no font
	// draws, so the reader would see empty boxes. Display only: the record keeps the published text.
	const SYMBOL_BULLETS = /[\u{F0A7}\u{F0D8}]/gu;
	const BULLET = String.fromCodePoint(0x2022);

	const shown = $derived(quote.text.trim().replace(SYMBOL_BULLETS, BULLET));
	const runs = $derived(displayRuns(shown));

	// The clause cut into the stretches each mark covers and the stretches between them; each is
	// drawn by its runs, so a word the PDF broke at a line end reads whole wherever it falls.
	const parts = $derived.by(() => {
		const pieces: { start: number; end: number; mark?: QuoteMark }[] = [];
		let at = 0;
		const found = findQuotes(
			shown,
			marks.map((each) => each.quote)
		);
		for (const { start, end, index } of found) {
			if (start > at) pieces.push({ start: at, end: start });
			pieces.push({ start, end, mark: marks[index] });
			at = end;
		}
		if (at < shown.length) pieces.push({ start: at, end: shown.length });
		return pieces;
	});
</script>

{#snippet clause()}{#each parts as part (part.start)}{#if part.mark}<mark
				class:decides={part.mark.decides === true}
				data-n={part.mark.n}><ProseRuns runs={runsBetween(runs, part.start, part.end)} /></mark
			>{:else}<ProseRuns runs={runsBetween(runs, part.start, part.end)} />{/if}{/each}{/snippet}

<div class="quote-block">
	<Label>{quote.language}</Label>
	{#if source !== undefined}<p class="source">{source}</p>{/if}
	<!-- An excerpt's lines sit in their own box inside the padding, so its clamp cuts on a line. -->
	<blockquote class="quote" lang={quote.lang} data-notice-text>
		{#if clamp}<span class="lines">{@render clause()}</span>{:else}{@render clause()}{/if}
	</blockquote>
</div>

<style>
	/* The block before this one belongs to another QuoteBlock, which Svelte cannot see from here. */
	:global(.quote-block) + .quote-block {
		margin-top: 1.25rem;
	}

	/* The language and the source on one line above the box. */
	.quote-block {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 0.5rem;
	}

	.source {
		margin-bottom: 0.4rem;
		font-size: var(--step--1);
		line-height: 1.3;
		color: var(--ink-2);
	}

	.source::before {
		content: '·';
		content: '·' / '';
		margin-right: 0.5rem;
	}

	/* The buyer's words in their own box, set for reading: the PDF's hard line ends read as spaces,
	   a word it broke at a line end reads whole and wraps by the language's own hyphenation, and
	   blank lines and list items keep their breaks. */
	.quote {
		flex: 1 0 100%;
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

	/* An excerpt: six whole lines, cut with an ellipsis; the whole clause sits behind its own
	   control. The clamp is on the text, which has no padding of its own, so the seventh line is cut
	   off at the sixth line's foot instead of showing its top half in the box's padding. */
	.lines {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 6;
		line-clamp: 6;
	}

	/* A quote the model read in the clause: a quiet dotted rule, so its reading can point at it. */
	mark {
		background: none;
		color: inherit;
		text-decoration: underline dotted 1px var(--ink-2);
		text-underline-offset: 4px;
	}

	/* The words the verdict rests on: weight and an underline in the brand green, never a
	   highlighter wash. */
	mark.decides {
		font-weight: 700;
		text-decoration: underline 2px var(--brand);
	}

	/* The number its reading carries beside the clause, drawn by the stylesheet so the quote's text
	   stays the notice's own. */
	mark[data-n]::before {
		content: attr(data-n);
		display: inline-block;
		min-width: 1.25rem;
		margin-right: 0.3125rem;
		padding: 0 0.3125rem;
		border-radius: var(--r-sm);
		background: var(--bg-3);
		color: var(--ink);
		font: 700 0.6875rem / 1.45 var(--font);
		text-align: center;
		vertical-align: 0.125em;
	}
</style>
