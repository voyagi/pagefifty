<script lang="ts">
	import type { TenderPageData } from '$lib/tenders/tender-page';
	import Binder from './Binder.svelte';
	import DeadlineTime from './DeadlineTime.svelte';
	import DemoNote from './DemoNote.svelte';
	import FacedownLeaf from './FacedownLeaf.svelte';
	import Facts from './Facts.svelte';
	import Label from './Label.svelte';
	import Leaf from './Leaf.svelte';
	import LeafGrid from './LeafGrid.svelte';
	import LotLeaf from './LotLeaf.svelte';
	import SourceLinks from './SourceLinks.svelte';
	import UnreadStrip from './UnreadStrip.svelte';

	let {
		data,
		variant = 'tenders'
	}: {
		data: TenderPageData;
		variant?: 'tenders' | 'example';
	} = $props();

	const tender = $derived(data.tender);
	const deadline = $derived(tender.deadline);
	const criteriaShown = $derived(tender.lots.some((lot) => lot.criteria.length > 0));
</script>

{#snippet buyers()}
	{#each tender.buyers as buyer, index (index)}
		<span class="buyer" lang={buyer.lang} data-notice-text>{buyer.text}</span>
	{/each}
{/snippet}

{#snippet facts()}
	<div>
		<dt>Deadline</dt>
		<dd>
			{#if deadline.shown.kind === 'in-notice'}
				In notice
			{:else}
				{#if !deadline.open}<span class="closed">Closed</span>{/if}
				<DeadlineTime instant={deadline.shown.instant} />
				{#if deadline.lotsDiffer}<span class="sub">Lots have different deadlines</span>{/if}
			{/if}
		</dd>
	</div>
	{#if tender.timeLeft !== undefined}
		<div>
			<dt>Time left</dt>
			<dd><span class="mono">{tender.timeLeft}</span></dd>
		</div>
	{/if}
	<div>
		<dt>TED notice</dt>
		<dd><span class="mono">{tender.noticeNumber}</span></dd>
	</div>
	{#if tender.countries.length > 0}
		<div>
			<dt>Country</dt>
			<dd>{tender.countries.join(', ')}</dd>
		</div>
	{/if}
	{#if tender.kind !== undefined}
		<div>
			<dt>Kind</dt>
			<dd>
				{tender.kind.label}, CPV
				<span class="mono">{tender.kind.code}</span>{#if tender.kind.main !== undefined}<span
						class="sub">Main CPV <span class="mono">{tender.kind.main}</span></span
					>{/if}
			</dd>
		</div>
	{/if}
	<div>
		<dt>Estimated value</dt>
		<dd>
			{#if tender.value !== null}<span class="mono">{tender.value}</span>{:else}Value not published{/if}
		</dd>
	</div>
{/snippet}

<Binder board="yellow">
	<Leaf
		id="tender"
		tab={variant === 'example' ? 'Example' : 'Tender'}
		hue="yellow"
		labelledby="tender-title"
		element="article"
		open
	>
		{#snippet children(tab)}
			<LeafGrid>
				{#snippet margin()}
					<Facts head={buyers} label="Tender facts" rows={facts} />
				{/snippet}
				<h1 class="title" id="tender-title" lang={tender.title.lang} data-notice-text>
					{tender.title.text}
				</h1>
				{@render tab()}
				<UnreadStrip />
				<SourceLinks tedUrl={tender.tedUrl} documents={tender.documents} />
				{#if tender.lotIndex.length > 0}
					<nav class="lot-index" aria-labelledby="lot-index-title">
						<Label id="lot-index-title">
							Lots in this notice (<span class="mono">{tender.lotIndex.length}</span>)
						</Label>
						<ol>
							{#each tender.lotIndex as entry (entry.anchor)}
								<li>
									<a href="#{entry.anchor}"
										>Lot {entry.number}{#if entry.title}: <span
												lang={entry.title.lang}
												data-notice-text>{entry.title.text}</span
											>{/if}</a
									>
									{#if entry.deadline.kind === 'in-notice'}
										<span class="sub">In notice</span>
									{:else}
										<span class="sub"
											>{#if entry.closed}<span class="lot-closed">Closed</span>{/if}
											<DeadlineTime instant={entry.deadline.instant} /></span
										>
									{/if}
								</li>
							{/each}
						</ol>
					</nav>
				{/if}
			</LeafGrid>
		{/snippet}
	</Leaf>

	{#each tender.lots as lot (lot.anchor)}
		<LotLeaf {lot} />
	{/each}

	{#if tender.documentsUnread}
		<FacedownLeaf documents={tender.documents} {criteriaShown} />
	{/if}

	<!-- The capture day comes from the capture itself, so a new capture renames it. -->
	<p class="leaf-foot">
		Criteria as published in TED notice <span class="mono">{tender.noticeNumber}</span>. Source:
		TED, the EU's Tenders Electronic Daily, snapshot captured {data.capture.capturedOn}. Not legal
		advice.
	</p>
</Binder>
{#if variant === 'example'}
	<DemoNote capturedOn={data.capture.capturedOn} />
{/if}

<style>
	.buyer {
		display: block;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.buyer + .buyer {
		margin-top: 0.35rem;
	}

	.closed {
		display: block;
		font-weight: 600;
	}

	.sub {
		display: block;
		margin-top: 0.125rem;
		color: var(--ink-2);
	}

	.title {
		max-width: 40ch;
		font: 600 var(--step-4) / 1.1 var(--font-cond);
		letter-spacing: -0.015em;
		text-wrap: balance;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.lot-index {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--acetate-rule);
	}

	/* Each link already names its lot number, so the list carries no second one; seventeen lots
	   pack into columns instead of one long run. */
	.lot-index ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
		gap: 0.75rem 1.75rem;
	}

	.lot-index li {
		max-width: 60ch;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.lot-index .sub {
		font-size: var(--step--1);
	}

	.lot-closed {
		font-weight: 600;
	}

	/* The foot is set on the yellow board itself, so it takes the board's own ink. */
	.leaf-foot {
		max-width: 80ch;
		margin-top: 1rem;
		font-size: var(--step--1);
		font-weight: 500;
		color: var(--on-yellow);
	}

	@media (max-width: 720px) {
		.title {
			font-size: var(--step-3);
		}
	}
</style>
