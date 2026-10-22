<script lang="ts">
	import { formatDeadline, SERVER_TIME_ZONE } from '$lib/core/deadline';
	import { countsLine, dayText, filterSummary, type TenderListData } from '$lib/tenders/list';
	import DemoNote from './DemoNote.svelte';
	import EmptyState from './EmptyState.svelte';
	import FilterForm from './FilterForm.svelte';
	import PageMain from './PageMain.svelte';
	import Panel from './Panel.svelte';
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
	const list = $derived(data.list);
	const capture = $derived(data.capture);
	// On the example "now" is the capture instant, so its closed notices had closed by then. The live
	// list says "closed" alone: some capture notices had closed before the capture was taken.
	const closedWords = $derived(example ? 'closed at the capture time' : 'closed');
	const counts = $derived(countsLine(list.counts, list.filtered, closedWords));
	const closedSummary = $derived(example ? 'Closed at the capture time' : 'Closed');
	// Open then is not open now, so the example's caption names the capture; closed then stays closed.
	const openCaption = $derived(
		example
			? 'Open at the capture time, soonest deadline first'
			: 'Open tenders, soonest deadline first'
	);
	const noneClosed = $derived(
		example
			? 'No tender in this list had closed at the capture time.'
			: 'No tender in this list has closed.'
	);
	const capturedAt = $derived(formatDeadline(capture.fetchedAt, SERVER_TIME_ZONE).split(', ')[1]);
	// Both days come from the capture itself; tenders.dom.test.ts pins them against the built index.
	const caveat = $derived(
		capture.firstPublished
			? `A snapshot, not live: tenders published before ${capture.firstPublished} or after ${capture.capturedOn} are missing.`
			: `A snapshot, not live: tenders published after ${capture.capturedOn} are missing.`
	);

	// Filters that match nothing in either group replace both tables with one named state, never a
	// blank page; an unfiltered list always shows its tables.
	const nothingMatches = $derived(list.filtered && list.counts.shown === 0);
	const emptyBody = $derived.by(() => {
		const { from, to } = data.filters;
		if (list.inverted && from && to) {
			return `The deadline range ends before it starts: ${dayText(from)} is after ${dayText(to)}. Swap the two dates.`;
		}
		return `Nothing in the ${capture.capturedOn} snapshot matches ${filterSummary(data.filters)}. Widen the deadline range or pick another country.`;
	});
</script>

<PageMain>
	<Panel id="open" labelledby="list-title">
		<header class="index-head">
			<div class="head-main">
				<h1 id="list-title">{example ? 'Example run' : 'Open IT tenders'}</h1>
				{#if example}
					<p class="intro">
						The {capture.capturedOn} snapshot of IT tenders in the Netherlands, Belgium and Germany, shown
						as it stood when it was captured. It needs no key and no install, and uses the demo firm Brink
						Data.
					</p>
				{:else}
					<p class="intro">
						IT services and software tenders (CPV 72 and 48) from buyers in the Netherlands, Belgium
						and Germany, soonest deadline first. Each shows its selection criteria as published, not
						yet compared with your firm.
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
					<p class="mono">
						Captured from TED on <span class="day">{capture.capturedOn}</span>
						<span class="day">at {capturedAt}</span>
					</p>
				{:else}
					<p class="mono">
						Snapshot captured from TED on <span class="day">{capture.capturedOn}</span>
					</p>
				{/if}
				<p class="caveat">{caveat}</p>
			</div>
		</header>

		<FilterForm state={data.filters} {basePath} />
		{#if data.dropped}
			<p class="status" role="status">
				Some filter values in the address were not recognised and were ignored.
			</p>
		{/if}

		{#if nothingMatches}
			<EmptyState heading="No tenders match these filters" body={emptyBody} clearHref={basePath} />
		{:else if list.open.length === 0 && list.closed.length > 0}
			<p class="note">No tender in this list is still open. The closed ones are below.</p>
		{:else}
			<TenderTable rows={list.open} caption={openCaption} {basePath} />
		{/if}
	</Panel>

	{#if !nothingMatches}
		<Panel id="closed" labelledby="closed-title">
			{#if list.closed.length > 0}
				<details>
					<summary
						><h2 id="closed-title">
							{closedSummary} (<span class="mono">{list.counts.closed}</span>)
						</h2></summary
					>
					<TenderTable
						rows={list.closed}
						caption="Closed tenders, earliest deadline first"
						{basePath}
						closed
					/>
				</details>
			{:else}
				<h2 id="closed-title" class="visually-hidden">{closedSummary}</h2>
				<p class="note">{noneClosed}</p>
			{/if}
		</Panel>
	{/if}
	{#if example}
		<DemoNote capturedOn={capture.capturedOn} />
	{/if}
</PageMain>

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
		font-weight: 750;
		font-size: var(--step-3);
		line-height: 1.15;
		letter-spacing: -0.03em;
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
		flex: 0 1 26rem;
		min-width: 0;
	}

	/* A date is one piece of evidence, so it never breaks across lines; the capture time is its own
	   piece, so at 320px with a 20px default font the line breaks between the two, never inside one. */
	.day {
		white-space: nowrap;
	}

	.caveat {
		margin-top: 0.25rem;
		font-size: var(--step--1);
		line-height: 1.3;
		color: var(--ink-2);
	}

	.status,
	.note {
		max-width: 70ch;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.status {
		margin: -0.5rem 0 1.5rem;
	}

	summary {
		min-height: 44px;
		padding-block: 0.75rem;
		cursor: pointer;
		font-weight: 650;
		line-height: 1.25;
	}

	summary::marker {
		color: var(--ink-2);
	}

	h2 {
		display: inline;
		font: inherit;
	}

	details[open] summary {
		margin-bottom: 1rem;
	}
</style>
