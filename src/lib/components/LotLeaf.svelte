<script lang="ts">
	import type { LangText } from '$lib/ingest/record';
	import type { LotView } from '$lib/tenders/tender-page';
	import CoverageList from './CoverageList.svelte';
	import CriterionRow from './CriterionRow.svelte';
	import DeadlineTime from './DeadlineTime.svelte';
	import Facts from './Facts.svelte';
	import Label from './Label.svelte';
	import Leaf from './Leaf.svelte';
	import LeafGrid from './LeafGrid.svelte';

	let { lot }: { lot: LotView } = $props();

	const count = $derived(lot.criteria.length);
	const tabLabel = $derived(
		`Lot ${lot.number}, ${count} ${count === 1 ? 'criterion' : 'criteria'}`
	);
	const headingId = $derived(`${lot.anchor}-title`);
	const published = $derived(
		[
			{ label: 'Note on the procedure', texts: lot.procedureNotes },
			{ label: 'Note on this lot', texts: lot.notes },
			{ label: 'Legal form for a group', texts: lot.groupLegalForm ? [lot.groupLegalForm] : [] }
		].filter((entry) => entry.texts.length > 0)
	);
</script>

{#snippet noticeText(text: LangText)}
	<span lang={text.lang} data-notice-text>{text.text}</span>
{/snippet}

{#snippet facts()}
	<div>
		<dt>Deadline</dt>
		<dd>
			{#if lot.deadline.kind === 'in-notice'}
				In notice
			{:else}
				<DeadlineTime instant={lot.deadline.instant} />
				<span class="sub">{lot.deadlineKind}</span>
			{/if}
		</dd>
	</div>
	<div>
		<dt>Estimated value</dt>
		<dd>
			{#if lot.value !== null}<span class="mono">{lot.value}</span>{:else}Value not published{/if}
		</dd>
	</div>
	{#if lot.criteriaSource !== undefined}
		<div>
			<dt>Criteria source</dt>
			<dd>{lot.criteriaSource}</dd>
		</div>
	{/if}
	<div>
		<dt>Legal basis</dt>
		<dd>
			{#if lot.legalBasis.name !== undefined}{lot.legalBasis.name}{:else}<span class="mono"
					>{lot.legalBasis.code}</span
				>{/if}
			{#each lot.legislation as reference, index (index)}
				<span class="sub"
					><span class="mono">{reference.id}</span>{#if reference.description}, {@render noticeText(
							reference.description
						)}{/if}</span
				>
			{/each}
		</dd>
	</div>
	{#if lot.reserved !== undefined}
		<div>
			<dt>Reserved participation</dt>
			<dd><span class="mono">{lot.reserved}</span></dd>
		</div>
	{/if}
{/snippet}

<Leaf
	id={lot.anchor}
	tab="Lot {lot.number}"
	hue="grass"
	labelledby={headingId}
	ply={2}
	{count}
	{tabLabel}
>
	{#snippet children(tab)}
		<LeafGrid>
			{#snippet margin()}
				<Facts head="Lot {lot.number}" {headingId} rows={facts}>
					{#if lot.title}
						<p class="lot-title">{@render noticeText(lot.title)}</p>
					{/if}
					<p class="lot-id mono">{lot.id}</p>
				</Facts>
				{@render tab()}
			{/snippet}
			<Label>Selection criteria as published</Label>
			{#if count > 0}
				<ol class="clauses">
					{#each lot.criteria as criterion (criterion.position)}
						<CriterionRow {criterion} />
					{/each}
				</ol>
			{:else}
				<p class="note">This lot publishes no selection criteria in the notice.</p>
			{/if}
			{#each published as entry (entry.label)}
				<section class="published" aria-label={entry.label}>
					<Label>{entry.label}</Label>
					{#each entry.texts as text, index (index)}
						<p class="published-text">{@render noticeText(text)}</p>
					{/each}
				</section>
			{/each}
			<CoverageList lines={lot.coverage} />
		</LeafGrid>
	{/snippet}
</Leaf>

<style>
	.lot-title {
		margin-top: 0.35rem;
		color: var(--ink);
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.lot-id {
		margin-top: 0.25rem;
		overflow-wrap: anywhere;
	}

	.sub {
		display: block;
		margin-top: 0.125rem;
		color: var(--ink-2);
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.clauses {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		border-top: 1px solid var(--acetate-edge);
	}

	.note {
		max-width: 70ch;
		margin-top: 0.75rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.published {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--acetate-rule);
	}

	.published-text {
		max-width: 72ch;
		white-space: pre-line;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.published-text + .published-text {
		margin-top: 0.75rem;
	}
</style>
