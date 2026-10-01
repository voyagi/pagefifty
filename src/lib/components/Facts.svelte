<script lang="ts">
	import type { Snippet } from 'svelte';

	// With headingId the margin head is the leaf's own heading (an h2 its section is labelled by);
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
	.margin-col {
		grid-column: 1;
		font-size: var(--step--1);
		color: var(--ink-2);
		line-height: 1.45;
		padding-right: 1.25rem;
		border-right: 1px solid var(--acetate-rule);
	}

	.margin-head {
		font: 600 var(--step-0) / 1.25 var(--font-cond);
		color: var(--ink);
		letter-spacing: 0.01em;
	}

	.facts {
		margin: 0.75rem 0 0;
		display: grid;
		gap: 0.625rem;
	}

	/* Rows passed as a snippet belong to the caller's scope, so these reach them as globals. */
	.facts :global(dt) {
		font-weight: 500;
		color: var(--ink-3);
	}

	.facts :global(dd) {
		margin: 0;
		color: var(--ink);
	}

	@media (max-width: 68.75em) {
		.margin-col {
			grid-column: 1 / -1;
			margin-bottom: 1.25rem;
			padding-right: 0;
			border-right: 0;
		}
	}
</style>
