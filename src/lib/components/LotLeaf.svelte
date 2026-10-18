<script lang="ts">
	import type { LangText } from '$lib/ingest/record';
	import type { LotView } from '$lib/tenders/tender-page';
	import type { LotVerdictView } from '$lib/tenders/verdict-view';
	import CoverageList from './CoverageList.svelte';
	import CriterionRow from './CriterionRow.svelte';
	import DeadlineTime from './DeadlineTime.svelte';
	import Facts from './Facts.svelte';
	import Label from './Label.svelte';
	import Leaf from './Leaf.svelte';
	import LeafGrid from './LeafGrid.svelte';
	import LoadingLines from './LoadingLines.svelte';
	import LotVerdict from './LotVerdict.svelte';

	// verdict is absent for a lot that keeps the phase 1 view, and 'loading' while the browser has
	// not read which firm to compare with yet.
	let {
		lot,
		verdict
	}: { lot: LotView; verdict?: { view: LotVerdictView; compared: string } | 'loading' } = $props();

	// The verdict's compared-firm line takes over from the coverage list's "Not compared" line,
	// which would otherwise say the opposite beside it.
	const stateOf = (position: number) =>
		verdict === undefined || verdict === 'loading'
			? undefined
			: verdict.view.criteria[position - 1]?.word;

	const coverage = $derived(
		verdict === undefined
			? lot.coverage
			: lot.coverage.filter((line) => line.status !== 'Not compared')
	);

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
				{#if lot.closed}<span class="closed">Closed</span>{/if}
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
	{:else if lot.reservedUnstated}
		<div>
			<dt>Reserved participation</dt>
			<dd>Not stated in the notice</dd>
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
			{#if verdict === 'loading'}
				<div class="verdict-pending">
					<LoadingLines label="Reading the firm profile kept in this browser" />
				</div>
			{:else if verdict !== undefined}
				<LotVerdict view={verdict.view} compared={verdict.compared} />
			{/if}
			<Label>Selection criteria as published</Label>
			{#if lot.reading?.status === 'not-read'}
				<p class="not-read">{lot.reading.line}</p>
			{/if}
			{#if count > 0}
				<ol class="clauses">
					{#each lot.criteria as criterion (criterion.position)}
						<CriterionRow {criterion} state={stateOf(criterion.position)} />
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
			<CoverageList lines={coverage} documents={lot.documents} />
		</LeafGrid>
	{/snippet}
</Leaf>

<style>
	.verdict-pending {
		margin: 0 0 1.75rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--acetate-rule);
	}

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

	/* Written as the notice's own closed deadline is: the word, then the date under it. */
	.closed {
		display: block;
		font-weight: 600;
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

	/* Dashed is the binder's one mark for "not read". */
	.not-read {
		max-width: 70ch;
		margin: 0.5rem 0 0.75rem;
		padding: 0.5rem 0.75rem;
		border: 1px dashed var(--ink-3);
		border-radius: 2px;
		background: var(--acetate);
		font-size: var(--step--1);
		color: var(--ink-2);
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
