<script lang="ts">
	import type { Snippet } from 'svelte';

	// With headingId the margin head is the leaf's own heading (an h2 its section is labelled by);
	// without it the head is a label for the column, not part of the outline.
	let {
		head,
		headingId,
		facts = [],
		children
	}: {
		head: string;
		headingId?: string;
		facts?: readonly { term: string; detail: string }[];
		children?: Snippet;
	} = $props();
</script>

<div class="margin-col">
	{#if headingId !== undefined}
		<h2 class="margin-head" id={headingId}>{head}</h2>
	{:else}
		<p class="margin-head">{head}</p>
	{/if}
	{@render children?.()}
	{#if facts.length > 0}
		<dl class="facts">
			{#each facts as fact (fact.term)}
				<dt>{fact.term}</dt>
				<dd>{fact.detail}</dd>
			{/each}
		</dl>
	{/if}
</div>

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

	dt {
		font-weight: 500;
		color: var(--ink-3);
	}

	dd {
		margin: 0;
		color: var(--ink);
	}

	@media (max-width: 1100px) {
		.margin-col {
			grid-column: 1 / -1;
			margin-bottom: 1.25rem;
			padding-right: 0;
			border-right: 0;
		}
	}
</style>
