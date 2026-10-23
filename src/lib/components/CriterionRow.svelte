<script lang="ts">
	import { criterionLabel } from '$lib/codelists/labels';
	import { criterionMarks } from '$lib/tenders/display-text';
	import type { CriterionView } from '$lib/tenders/tender-page';
	import type { LotVerdictView } from '$lib/tenders/verdict-view';
	import ExternalIcon from './ExternalIcon.svelte';
	import Icon from './Icon.svelte';
	import NotReadLine from './NotReadLine.svelte';
	import QuoteBlock from './QuoteBlock.svelte';

	// state is the criterion's state in words, given only on a lot that shows a verdict; the words
	// come from the verdict, so they sit in their own data-verdict element. notice is the TED notice
	// the clause is quoted from, named in words above the quote. decides lists the requirements the
	// verdict rests on, on the clause that decides only.
	let {
		criterion,
		notice,
		state,
		decides = []
	}: {
		criterion: CriterionView;
		notice: string;
		state?: LotVerdictView['criteria'][number];
		decides?: readonly number[];
	} = $props();

	const label = $derived(criterionLabel(criterion.code));
	const requirements = $derived(criterion.requirements ?? []);

	// Each requirement is marked where code found it in the clause, numbered as its reading is, so
	// the quote shows once, in its place, even where it runs from one description into the next.
	const marks = $derived(criterionMarks(criterion.descriptions, requirements, decides));
	// A clause whose every quote was refused shows no quote, so it never claims one was found. Only a
	// quote refused as not found was searched for in the clause: one too short to check was not.
	const provenance = $derived.by(() => {
		if (requirements.length > 0) {
			return 'Read by the model. Code found each quote shown here word for word in this clause.';
		}
		const rejected = criterion.rejected ?? [];
		if (rejected.length === 0)
			return 'Read by the model, which named no requirement in this clause.';
		return rejected.every((each) => each.reason === 'not-found')
			? 'Read by the model. Code found none of its quotes word for word in this clause.'
			: 'Read by the model. Code could verify none of its quotes in this clause.';
	});
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
		{#each criterion.descriptions as quote, index (index)}
			<QuoteBlock
				{quote}
				marks={marks[index]}
				source={index === 0 ? `Quoted from TED notice ${notice}` : undefined}
			/>
		{/each}
		{#if requirements.length > 0}
			<div class="readings">
				<span class="ai-label">AI reading</span>
				<ol class="requirements" aria-label="Requirements read in this clause">
					{#each requirements as requirement, index (index)}
						<li class="requirement" class:decides={decides.includes(index)}>
							<p class="reading" data-ai-generated={requirement.model}>{requirement.reading}</p>
						</li>
					{/each}
				</ol>
			</div>
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
		padding: 1.5rem 0;
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
		font: 650 var(--step-1) / 1.3 var(--font);
		letter-spacing: -0.01em;
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

	/* The model's readings of the clause under one label, each numbered as its quote is marked in the
	   clause above, so the buyer's words show once, in their place. */
	.readings {
		max-width: 72ch;
		margin-top: 1rem;
	}

	.ai-label {
		display: block;
		margin-bottom: 0.375rem;
		font: 600 var(--step--1) / 1.3 var(--font);
		color: var(--ink-2);
	}

	.requirements {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding-left: 1.75rem;
		list-style: decimal;
	}

	.requirement::marker {
		font-weight: 700;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	/* A reading the verdict rests on carries its quote's weight. */
	.requirement.decides::marker {
		color: var(--ink);
	}

	.reading {
		line-height: 1.5;
		color: var(--ink);
		overflow-wrap: anywhere;
		text-wrap: pretty;
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
