<script lang="ts">
	import type { Snippet } from 'svelte';

	// With headingId the margin head is the panel's own heading (an h2 its section is labelled by);
	// without it the head is a label for the column, not part of the outline. A head that needs
	// markup (a lang per buyer) comes as a snippet, and rows that need markup (Mono figures, a time)
	// render inside the same list as the plain facts.
	let {
		head,
		headingId,
		label,
		facts = [],
		rows,
		children
	}: {
		head: string | Snippet;
		headingId?: string;
		label?: string;
		facts?: readonly { term: string; detail: string }[];
		rows?: Snippet;
		children?: Snippet;
	} = $props();
</script>

{#snippet headText()}
	{#if typeof head === 'string'}{head}{:else}{@render head()}{/if}
{/snippet}

<svelte:element this={label === undefined ? 'div' : 'aside'} class="margin-col" aria-label={label}>
	{#if headingId !== undefined}
		<h2 class="margin-head" id={headingId}>{@render headText()}</h2>
	{:else}
		<p class="margin-head">{@render headText()}</p>
	{/if}
	{@render children?.()}
	{#if facts.length > 0 || rows !== undefined}
		<dl class="facts">
			{#each facts as fact (fact.term)}
				<dt>{fact.term}</dt>
				<dd>{fact.detail}</dd>
			{/each}
			{@render rows?.()}
		</dl>
	{/if}
</svelte:element>

<style>
	/* Above the text in one column, beside it once the panel grid has two. */
	.margin-col {
		min-width: 0;
		margin-bottom: 1.5rem;
		font-size: var(--step--1);
		color: var(--ink-2);
		line-height: 1.45;
	}

	.margin-head {
		font-weight: 700;
		font-size: 1rem;
		line-height: 1.3;
		color: var(--ink);
	}

	.facts {
		margin: 0.75rem 0 0;
		display: grid;
		gap: 0.75rem;
	}

	/* Rows passed as a snippet belong to the caller's scope, so these reach them as globals. */
	.facts :global(dt) {
		font-weight: 500;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.facts :global(dd) {
		margin: 0;
		font-weight: 600;
		font-size: var(--step-0);
		color: var(--ink);
	}

	/* A figure keeps the weight of the fact it sits in, rather than dropping to the lighter weight
	   a figure takes in running text. */
	.facts :global(dd .mono) {
		font-weight: inherit;
	}

	@media (min-width: 68.75em) {
		.margin-col {
			margin-bottom: 0;
		}
	}
</style>
