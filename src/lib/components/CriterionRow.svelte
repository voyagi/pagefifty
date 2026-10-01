<script lang="ts">
	import { criterionLabel } from '$lib/codelists/labels';
	import type { CriterionView } from '$lib/tenders/tender-page';
	import QuoteBlock from './QuoteBlock.svelte';

	let { criterion }: { criterion: CriterionView } = $props();

	const label = $derived(criterionLabel(criterion.code));
</script>

<li class="clause">
	<div class="clause-head">
		{#if label !== undefined}
			<h3>{label}</h3>
			<p class="ref"><span class="mono">{criterion.code}</span></p>
		{:else}
			<h3><span class="mono">{criterion.code}</span></h3>
			<p class="unlabelled">No English label in the EU code list for this code.</p>
		{/if}
		<p class="ref">
			<span class="mono">Criterion {criterion.position} of {criterion.of}</span>
		</p>
		{#if criterion.parameters.length > 0}
			<ul class="parameters" aria-label="Parameters as published">
				{#each criterion.parameters as parameter, index (index)}
					<li>
						{#if 'label' in parameter}{parameter.label}{:else}<span class="mono"
								>{parameter.code}</span
							>{/if}: <span class="mono">{parameter.value}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
	<div class="quotes">
		{#each criterion.descriptions as quote, index (index)}
			<QuoteBlock {quote} />
		{/each}
	</div>
</li>

<style>
	.clause {
		display: grid;
		grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr);
		column-gap: 1.75rem;
		padding: 1.5rem 0;
		border-top: 1px solid var(--acetate-rule);
	}

	.clause:first-child {
		border-top: 0;
	}

	.clause-head {
		padding-right: 1.25rem;
		border-right: 1px solid var(--acetate-rule);
	}

	h3 {
		font: 600 var(--step-0) / 1.3 var(--font-cond);
		letter-spacing: 0.01em;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.ref,
	.unlabelled {
		margin-top: 0.35rem;
		font-size: var(--step--1);
		line-height: 1.3;
		color: var(--ink-2);
	}

	.ref {
		overflow-wrap: anywhere;
	}

	.parameters {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		font-size: var(--step--1);
		line-height: 1.3;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	.parameters li + li {
		margin-top: 0.25rem;
	}

	/* The hanging quote mark needs room on the leaf side of the text edge. */
	.quotes {
		min-width: 0;
		padding-left: 0.75rem;
	}

	@media (max-width: 45em) {
		.clause {
			grid-template-columns: minmax(0, 1fr);
			row-gap: 1rem;
		}

		.clause-head {
			padding-right: 0;
			border-right: 0;
		}
	}
</style>
