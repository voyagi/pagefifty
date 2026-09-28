<script lang="ts">
	import type { TenderPageData } from '$lib/tenders/tender-page';
	import Binder from './Binder.svelte';
	import DeadlineTime from './DeadlineTime.svelte';
	import Facts from './Facts.svelte';
	import Label from './Label.svelte';
	import Leaf from './Leaf.svelte';
	import LeafGrid from './LeafGrid.svelte';
	import LotLeaf from './LotLeaf.svelte';

	let {
		data,
		variant = 'tenders'
	}: {
		data: TenderPageData;
		variant?: 'tenders' | 'example';
	} = $props();

	const tender = $derived(data.tender);
	const deadline = $derived(tender.deadline);
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
										<span class="sub"><DeadlineTime instant={entry.deadline.instant} /></span>
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
</Binder>

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

	.lot-index ol {
		margin: 0;
		padding-left: 1.5rem;
		display: grid;
		gap: 0.625rem;
	}

	.lot-index li {
		max-width: 60ch;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.lot-index li::marker {
		font-family: var(--font-mono);
		color: var(--ink-3);
	}

	@media (max-width: 720px) {
		.title {
			font-size: var(--step-3);
		}
	}
</style>
