<script lang="ts">
	import { criterionLabel } from '$lib/codelists/labels';
	import type { CriterionView } from '$lib/tenders/tender-page';
	import type { LotVerdictView } from '$lib/tenders/verdict-view';
	import ExternalIcon from './ExternalIcon.svelte';
	import Icon from './Icon.svelte';
	import NotReadLine from './NotReadLine.svelte';
	import QuoteBlock from './QuoteBlock.svelte';

	// state is the criterion's state in words, given only on a lot that shows a verdict; the words
	// come from the verdict, so they sit in their own data-verdict element. notice is the TED notice
	// the clause is quoted from, named in words above the quote.
	let {
		criterion,
		notice,
		state
	}: {
		criterion: CriterionView;
		notice: string;
		state?: LotVerdictView['criteria'][number];
	} = $props();

	const label = $derived(criterionLabel(criterion.code));
	const provenance = $derived(
		(criterion.requirements?.length ?? 0) + (criterion.rejected?.length ?? 0) === 0
			? 'Read by the model, which named no requirement in this clause.'
			: 'Read by the model. Code found each quote shown here word for word in this clause.'
	);
</script>

<li class="clause" data-criterion={criterion.position}>
	<div class="clause-head">
		<div class="name">
			{#if label !== undefined}
				<h3>{label}</h3>
			{:else}
				<h3><span class="mono">{criterion.code}</span></h3>
			{/if}
			<p class="ref">
				{#if label !== undefined}<span class="mono">{criterion.code}</span>{/if}
				<span class="mono">Criterion {criterion.position} of {criterion.of}</span>
			</p>
			{#if label === undefined}
				<p class="unlabelled">No English label in the EU code list for this code.</p>
			{/if}
		</div>
		{#if state !== undefined}
			<p class="state" data-verdict><Icon name={state.mark} />{state.word}</p>
		{/if}
	</div>
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
	<div class="quotes">
		{#if criterion.descriptions.length > 0}
			<p class="source">Quoted from TED notice {notice}</p>
		{/if}
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
		{#each criterion.rejected ?? [] as rejected, index (index)}
			<NotReadLine line={rejected.line} />
		{/each}
		{#if criterion.source !== undefined}
			<p class="provenance">
				<span>{provenance}</span>
				<a href={criterion.source} rel="external noreferrer">Open notice on TED<ExternalIcon /></a>
			</p>
		{/if}
	</div>
</li>

<style>
	.clause {
		padding: 1.25rem 0 1.5rem;
		border-top: 1px solid var(--line);
	}

	.clause:first-child {
		border-top: 0;
	}

	/* The name on the left, the state it was given at the right, wrapping under it when the name
	   leaves no room. */
	.clause-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.375rem 1.5rem;
	}

	.name {
		flex: 1 1 18rem;
		min-width: 0;
	}

	h3 {
		font: 600 var(--step-0) / 1.35 var(--font);
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.ref,
	.unlabelled {
		margin-top: 0.125rem;
		font-size: var(--step--1);
		line-height: 1.35;
		color: var(--ink-2);
	}

	.ref {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.75rem;
		overflow-wrap: anywhere;
	}

	.ref .mono {
		font-weight: 400;
	}

	.state {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-weight: 600;
		font-size: var(--step--1);
		color: var(--ink);
	}

	/* What the buyer demands beside the clause, as published. */
	.parameters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.25rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		font-size: var(--step--1);
		line-height: 1.35;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.quotes {
		min-width: 0;
		margin-top: 0.875rem;
	}

	.source {
		margin-bottom: 0.5rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	/* Each requirement pairs the buyer's words with the model's reading of them: side by side where
	   the column is wide enough, the quote first where it is not. */
	.requirements {
		margin: 1.25rem 0 0;
		padding: 1rem 0 0;
		list-style: none;
		border-top: 1px solid var(--line);
		display: grid;
		gap: 1.25rem;
	}

	.requirement {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
		gap: 0.5rem 1.75rem;
		align-items: start;
	}

	/* The words the requirement was read from, set as the deciding words are. */
	.req-quote {
		max-width: 60ch;
		font-weight: 650;
		color: var(--ink);
		text-decoration: underline 2px var(--brand);
		text-underline-offset: 4px;
		white-space: pre-line;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.ai-label {
		display: block;
		margin-bottom: 0.25rem;
		font: 600 var(--step--1) / 1.3 var(--font);
		color: var(--ink-2);
	}

	.reading {
		max-width: 52ch;
		line-height: 1.5;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.provenance {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 1.5rem;
		margin-top: 0.75rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	/* A link standing alone on its line gets the full target height. */
	.provenance a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--ink);
	}
</style>
