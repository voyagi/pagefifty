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
		{#if criterion.requirements !== undefined && criterion.requirements.length > 0}
			<ol class="requirements" aria-label="Requirements read in this clause">
				{#each criterion.requirements as requirement, index (index)}
					<li class="requirement">
						<p class="req-quote" lang={requirement.lang} data-notice-text>{requirement.quote}</p>
						<div class="req-reading">
							<span class="ai-label">AI reading</span>
							<p class="reading" data-ai-generated={requirement.model}>{requirement.reading}</p>
						</div>
					</li>
				{/each}
			</ol>
		{/if}
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

	/* Each requirement pairs the buyer's words with the model's reading of them: side by side where
	   the column is wide enough, the quote first where it is not. */
	.requirements {
		margin: 1.5rem 0 0;
		padding: 1.25rem 0 0;
		list-style: none;
		border-top: 1px solid var(--acetate-rule);
		display: grid;
		gap: 1.25rem;
	}

	.requirement {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
		gap: 0.5rem 1.75rem;
		align-items: start;
	}

	.req-quote {
		max-width: 60ch;
		padding-left: 0.75rem;
		border-left: 1px solid var(--acetate-edge);
		color: var(--ink-2);
		white-space: pre-line;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.ai-label {
		display: block;
		margin-bottom: 0.25rem;
		font: 600 var(--step--1) / 1.3 var(--font-cond);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
	}

	.reading {
		max-width: 52ch;
		font-size: var(--step-1);
		line-height: 1.45;
		color: var(--ink);
		overflow-wrap: anywhere;
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
