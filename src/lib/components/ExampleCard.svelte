<script lang="ts">
	import { criterionLabel } from '$lib/codelists/labels';
	import { DEMO_FIRM_SHORT } from '$lib/profile/demo-firm';
	import { initialsOf } from '$lib/tenders/list';
	import type { LotView, TenderPageModel } from '$lib/tenders/tender-page';
	import type { LotVerdictView } from '$lib/tenders/verdict-view';
	import ExternalIcon from './ExternalIcon.svelte';
	import Icon from './Icon.svelte';
	import QuoteBlock from './QuoteBlock.svelte';
	import VerdictHead from './VerdictHead.svelte';

	// One lot of the example run as an opened posting: the record and the verdict the start page
	// computed for the demo firm, shown as they are. Nothing here is staged or picked by hand, so the
	// card says whatever the example capture says.
	let { tender, lot, view }: { tender: TenderPageModel; lot: LotView; view: LotVerdictView } =
		$props();

	const lead = $derived(tender.buyers[0]);
	const deciding = $derived(lot.criteria.find((criterion) => criterion.position === view.deciding));

	// The deciding clause in the language its verified quotes were found in, with those quotes set
	// apart inside it.
	const clause = $derived.by(() => {
		if (deciding === undefined) return undefined;
		const requirements = deciding.requirements ?? [];
		const lang = requirements[0]?.lang;
		const quote =
			deciding.descriptions.find((each) => each.lang === lang) ?? deciding.descriptions[0];
		const marks = requirements
			.filter((each) => each.lang === quote?.lang)
			.map((each) => each.quote);
		return { quote, marks, requirements };
	});

	// How many criteria are in each state, in the order the states first appear.
	const summary = $derived.by(() => {
		const words = view.criteria.map((each) => each.word);
		return words
			.filter((word, index) => words.indexOf(word) === index)
			.map((word) => `${words.filter((each) => each === word).length} ${word.toLowerCase()}`);
	});

	const demandOf = (parameters: LotView['criteria'][number]['parameters']) =>
		parameters
			.map((each) => `${'label' in each ? each.label : each.code}: ${each.value}`)
			.join(', ');
</script>

{#snippet stateMark(position: number)}
	{@const state = view.criteria[position - 1]}
	{#if state !== undefined}
		<span class="st" data-verdict><Icon name={state.mark} />{state.word}</span>
	{/if}
{/snippet}

<article class="example" data-example aria-labelledby="example-title">
	<div class="top">
		<div class="who">
			{#if lead}<span class="tile" aria-hidden="true">{initialsOf(lead.text)}</span>{/if}
			<p class="who-text">
				{#if lead}<span class="buyer" lang={lead.lang} data-notice-text>{lead.text}</span>{/if}
				{#if tender.countries.length > 0}<span class="where">{tender.countries.join(', ')}</span
					>{/if}
			</p>
			<span class="run">Example run</span>
		</div>
		<h2 class="title" id="example-title" lang={tender.title.lang} data-notice-text>
			{tender.title.text}
		</h2>
		<p class="facts">
			<span class="fact"
				><Icon name="doc" /><a href={tender.tedUrl} rel="external noreferrer"
					>TED notice <span class="mono">{tender.noticeNumber}</span><ExternalIcon /></a
				></span
			>
			<span class="fact"><Icon name="users" />Checked against {DEMO_FIRM_SHORT}, demo firm</span>
			<!-- A verdict belongs to one lot, so a notice of several names which lot this is. -->
			{#if tender.lots.length > 1}
				<span class="fact lot"
					><Icon name="lines" />Lot {lot.number}{#if lot.title}: <span
							lang={lot.title.lang}
							data-notice-text>{lot.title.text}</span
						>{/if}</span
				>
			{/if}
		</p>
	</div>

	<div class="verdict" data-verdict>
		<VerdictHead {view} />
		<p class="gloss">{view.gloss}</p>
	</div>

	{#if deciding !== undefined && clause?.quote !== undefined}
		<div class="decides">
			<div class="k">
				<span>The clause that decides</span>
				{@render stateMark(deciding.position)}
			</div>
			<p class="clause-name">
				{criterionLabel(deciding.code) ?? deciding.code}, criterion {deciding.position} of {deciding.of}
			</p>
			<p class="source">Quoted from TED notice {tender.noticeNumber}</p>
			<QuoteBlock quote={clause.quote} marks={clause.marks} />
			{#each clause.requirements as requirement, index (index)}
				<div class="reading">
					<span class="ai-label">AI reading</span>
					<p data-ai-generated={requirement.model}>{requirement.reading}</p>
				</div>
			{/each}
		</div>
	{/if}

	<div class="reqs">
		<div class="k">
			<span>Requirements in this lot</span>
			<ul class="summary" aria-label="Requirements by state" data-verdict>
				{#each summary as line (line)}<li>{line}</li>{/each}
			</ul>
		</div>
		<ul class="rows">
			{#each lot.criteria as criterion (criterion.position)}
				<li class:on={criterion === deciding}>
					<span class="name">{criterionLabel(criterion.code) ?? criterion.code}</span>
					{#if criterion.parameters.length > 0}
						<span class="demand">{demandOf(criterion.parameters)}</span>
					{/if}
					{@render stateMark(criterion.position)}
				</li>
			{/each}
		</ul>
	</div>

	<p class="foot">Read with NVIDIA Nemotron on Nebius. Numbers compared by code.</p>
</article>

<style>
	/* An outlined box on the page itself: no shadow, nothing lifted. */
	.example {
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--bg);
	}

	.top {
		padding: 1.25rem 1.5rem 1.125rem;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.tile {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--r);
		background: var(--bg-2);
		color: var(--ink-2);
		font-weight: 700;
		font-size: var(--step--1);
	}

	.who-text {
		flex: 1 1 auto;
		min-width: 0;
		font-size: 0.84375rem;
		color: var(--ink-2);
	}

	.buyer,
	.where {
		display: block;
	}

	.buyer {
		font-size: 0.875rem;
		font-weight: 650;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.run {
		flex: none;
		padding: 0.1875rem 0.5625rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r-sm);
		font-weight: 500;
		font-size: 0.78125rem;
		color: var(--ink-2);
	}

	.title {
		margin-top: 0.75rem;
		font-weight: 750;
		font-size: var(--step-2);
		line-height: 1.2;
		letter-spacing: -0.025em;
		text-wrap: balance;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin-top: 0.375rem;
		font-size: 0.84375rem;
		color: var(--ink-2);
	}

	.fact {
		display: inline-flex;
		align-items: center;
		gap: 0.3125rem;
	}

	/* A lot title can run long, so it wraps as text rather than sitting in one flex line. */
	.lot {
		display: block;
		flex-basis: 100%;
		overflow-wrap: anywhere;
	}

	.lot :global(svg.icon) {
		margin-right: 0.3125rem;
		vertical-align: -3px;
	}

	.facts a {
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		font-weight: 600;
		color: var(--ink);
		text-decoration-color: var(--line-2);
	}

	.facts a:hover {
		text-decoration-color: currentColor;
	}

	/* The verdict row runs edge to edge; the text inside it lines up with the card's own. */
	.verdict :global(.verdict-head) {
		padding-inline: 1.5rem;
	}

	.gloss {
		padding: 0.625rem 1.5rem 0;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.decides {
		padding: 1rem 1.5rem 0.25rem;
	}

	.k {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem 1rem;
		font-weight: 650;
		font-size: 0.875rem;
	}

	.st {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-weight: 600;
		font-size: var(--step--1);
		white-space: nowrap;
	}

	.clause-name {
		margin-top: 0.25rem;
		font-size: 0.875rem;
		color: var(--ink);
	}

	.source {
		margin: 0.5rem 0 0.375rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.reading {
		margin-top: 0.625rem;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--ink-2);
	}

	.ai-label {
		display: block;
		font-weight: 600;
		font-size: var(--step--1);
	}

	.reading p {
		color: var(--ink);
	}

	.reqs {
		padding: 0.75rem 1.5rem 1rem;
	}

	.reqs .k {
		padding: 0.625rem 0 0.375rem;
		border-top: 1px solid var(--line);
	}

	.summary {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.875rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-weight: 500;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.rows li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.125rem 0.75rem;
		min-height: 34px;
		padding-block: 0.25rem;
		font-size: 0.875rem;
	}

	.rows li + li {
		border-top: 1px solid var(--line);
	}

	.rows .on {
		font-weight: 650;
	}

	.name {
		flex: 1 1 12rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.demand {
		color: var(--ink-2);
	}

	.foot {
		padding: 0 1.5rem 1rem;
		font-size: 0.78125rem;
		color: var(--ink-2);
	}
</style>
