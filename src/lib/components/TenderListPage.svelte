<script lang="ts">
	import { formatDeadline, SERVER_TIME_ZONE } from '$lib/core/deadline';
	import { countsLine, type TenderListData } from '$lib/tenders/list';
	import Binder from './Binder.svelte';
	import Leaf from './Leaf.svelte';
	import TenderTable from './TenderTable.svelte';

	let {
		data,
		variant = 'tenders',
		basePath
	}: {
		data: TenderListData;
		variant?: 'tenders' | 'example';
		basePath: '/tenders' | '/example';
	} = $props();

	const example = $derived(variant === 'example');
	const board = $derived(example ? 'yellow' : 'slate');
	const list = $derived(data.list);
	const capture = $derived(data.capture);
	// On the example "now" is the capture instant, so its closed notices had closed by then.
	const closedWords = $derived(example ? 'closed at the capture time' : 'closed since the capture');
	const counts = $derived(countsLine(list.counts, list.filtered, closedWords));
	const closedSummary = $derived(
		example ? 'Closed at the capture time' : 'Closed since the capture'
	);
	const capturedAt = $derived(formatDeadline(capture.fetchedAt, SERVER_TIME_ZONE).split(', ')[1]);
	// Both days come from the capture itself; tenders.dom.test.ts pins them against the built index.
	const caveat = $derived(
		capture.firstPublished
			? `A snapshot, not live: tenders published before ${capture.firstPublished} or after ${capture.capturedOn} are missing.`
			: `A snapshot, not live: tenders published after ${capture.capturedOn} are missing.`
	);
</script>

<Binder {board}>
	<Leaf
		id="open"
		tab={example ? 'Example' : 'Open'}
		hue={board}
		labelledby="list-title"
		count={list.counts.open}
		open
	>
		{#snippet children(tab)}
			<header class="index-head">
				<div class="head-main">
					<h1 id="list-title">{example ? 'Example run' : 'Open IT tenders'}</h1>
					{@render tab()}
					{#if example}
						<p class="intro">
							The {capture.capturedOn} snapshot of IT tenders in the Netherlands, Belgium and Germany,
							shown as it stood when it was captured. It needs no key and no install, and uses the demo
							firm Brink Data.
						</p>
					{:else}
						<p class="intro">
							IT services and software tenders (CPV 72 and 48) from buyers in the Netherlands,
							Belgium and Germany, soonest deadline first. Each shows its selection criteria as
							published, not yet compared with your firm.
						</p>
					{/if}
					<p class="counts">
						{#each counts as part, index (index)}{#if typeof part === 'number'}<span class="mono"
									>{part}</span
								>{:else}{part}{/if}{/each}
					</p>
				</div>
				<div class="capture">
					{#if example}
						<p class="mono">Captured from TED on {capture.capturedOn} at {capturedAt}</p>
					{:else}
						<p class="mono">Snapshot captured from TED on {capture.capturedOn}</p>
					{/if}
					<p class="caveat">{caveat}</p>
				</div>
			</header>

			<TenderTable rows={list.open} caption="Open tenders, soonest deadline first" {basePath} />
		{/snippet}
	</Leaf>

	<Leaf
		id="closed"
		tab="Closed"
		hue={board}
		labelledby="closed-title"
		count={list.counts.closed}
		ply={2}
	>
		{#snippet children(tab)}
			<details>
				<summary
					><h2 id="closed-title">
						{closedSummary} (<span class="mono">{list.counts.closed}</span>)
					</h2></summary
				>
				<TenderTable
					rows={list.closed}
					caption="Tenders that have closed, by the deadline they closed on"
					{basePath}
					closed
				/>
			</details>
			{@render tab()}
		{/snippet}
	</Leaf>
</Binder>

<style>
	.index-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem 2rem;
		margin-bottom: 1.5rem;
	}

	.head-main {
		flex: 1 1 36rem;
		min-width: 0;
	}

	h1 {
		font: 600 var(--step-4) / 1.1 var(--font-cond);
		letter-spacing: -0.015em;
		text-wrap: balance;
	}

	.intro {
		max-width: 60ch;
		margin-top: 1rem;
		color: var(--ink-2);
		text-wrap: pretty;
	}

	.counts {
		margin-top: 0.5rem;
		max-width: 60ch;
	}

	.capture {
		flex: 0 1 22rem;
		min-width: 0;
	}

	.caveat {
		margin-top: 0.25rem;
		font-size: var(--step--1);
		line-height: 1.3;
		color: var(--ink-2);
	}

	summary {
		min-height: 44px;
		padding-block: 0.75rem;
		cursor: pointer;
		font: 600 var(--step-0) / 1.25 var(--font-cond);
		letter-spacing: 0.01em;
	}

	summary::marker {
		color: var(--ink-3);
	}

	h2 {
		display: inline;
		font: inherit;
	}

	details[open] summary {
		margin-bottom: 1rem;
	}

	@media (max-width: 720px) {
		h1 {
			font-size: var(--step-3);
		}
	}
</style>
