<script lang="ts">
	import type { Snippet } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { formatDeadline, SERVER_TIME_ZONE } from '$lib/core/deadline';
	import { toSearch } from '$lib/core/filters';
	import { countsLine, dayText, filterSummary, type TenderListData } from '$lib/tenders/list';
	import DemoNote from './DemoNote.svelte';
	import EmptyState from './EmptyState.svelte';
	import FilterForm from './FilterForm.svelte';
	import Icon from './Icon.svelte';
	import PageMain from './PageMain.svelte';
	import TenderTable from './TenderTable.svelte';

	// The list of /tenders or /example beside the tender it has open. opened is the notice the pane
	// shows: the one the address names, or on the bare list the one the list opens by itself. onRecord
	// says the address names it, so a phone shows that tender in place of the list.
	let {
		data,
		variant = 'tenders',
		basePath,
		opened,
		onRecord = false,
		children
	}: {
		data: TenderListData;
		variant?: 'tenders' | 'example';
		basePath: '/tenders' | '/example';
		opened?: string;
		onRecord?: boolean;
		children?: Snippet;
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

	// Filters that match nothing in either group replace both lists with one named state, never a
	// blank page; an unfiltered list always shows its lists.
	const nothingMatches = $derived(list.filtered && list.counts.shown === 0);
	const emptyBody = $derived.by(() => {
		const { from, to } = data.filters;
		if (list.inverted && from && to) {
			return `The deadline range ends before it starts: ${dayText(from)} is after ${dayText(to)}. Swap the two dates.`;
		}
		return `Nothing in the ${capture.capturedOn} snapshot matches ${filterSummary(data.filters)}. Widen the deadline range or pick another country.`;
	});

	// The links carry the filters as the list applied them, rebuilt from the parsed state, so a value
	// the list ignored never rides along from one address to the next.
	const query = $derived(toSearch(data.filters));
	const current = $derived(onRecord ? 'page' : 'true');
	const showPane = $derived(opened !== undefined && children !== undefined);
	// A closed tender opened from its address shows its row too, so the closed group opens with it.
	const openedClosed = $derived(list.closed.some((row) => row.noticeNumber === opened));

	let pane = $state<HTMLElement>();
	let listColumn = $state<HTMLElement>();
	let split = $state<HTMLElement>();
	let entered = false;

	// Beside a tender both columns end at the bottom of the window while the page sits at its top, so
	// a list's last rows and a tender's last lines show by scrolling that column alone. Where they
	// start is measured, since the head above them is as tall as its lines wrap.
	function fitColumns() {
		if (split === undefined) return;
		split.style.setProperty('--split-top', `${split.getBoundingClientRect().top + scrollY}px`);
	}

	// A tender the split opens with, on a wide screen, brings its row into the part of the list on
	// screen, so the list shows which tender is open: the one the address names, or the one the bare
	// list opens by itself. Only the list column scrolls: the page stays at its top, where the head
	// and the tender show beside the row. A row already in view stays where it is. Focus stays where
	// the browser put it.
	function revealOpened() {
		if (listColumn === undefined || matchMedia('(max-width: 45em)').matches) return;
		const row = listColumn.querySelector('a[aria-current]')?.closest('li');
		if (!row) return;
		const column = listColumn.getBoundingClientRect();
		const box = row.getBoundingClientRect();
		// The row's place in the list's scrolled content, and how much of the column the window shows.
		const at = box.top - column.top + listColumn.scrollTop;
		const shown = Math.min(listColumn.clientHeight, innerHeight - column.top);
		if (at >= listColumn.scrollTop && at + box.height <= listColumn.scrollTop + shown) return;
		listColumn.scrollTop = at;
	}

	// A tender opened from the list shows from its start. On a wide screen the list keeps its place
	// and focus stays on the row that was picked; a page scrolled down to the notes under the split
	// goes back to its top, where both columns fit the window. On a phone the tender takes the list's
	// place, so the page goes back to the top and focus moves to the tender's heading. A step back
	// keeps the place the browser gives it. Coming into the split, by a first load or by a link from
	// another page such as Start's example verdict, only brings the open row into view.
	afterNavigate(({ type, to }) => {
		fitColumns();
		const first = !entered;
		entered = true;
		const phone = matchMedia('(max-width: 45em)').matches;
		if (type === 'enter' || (first && !phone)) {
			revealOpened();
			return;
		}
		if (type === 'popstate' || pane === undefined) return;
		if (!phone) {
			pane.scrollTop = 0;
			if (scrollY > 0) scrollTo(0, 0);
			return;
		}
		if (to?.params?.notice === undefined) return;
		scrollTo(0, 0);
		pane.querySelector<HTMLElement>('h1')?.focus();
	});
</script>

<svelte:window onresize={fitColumns} />

<PageMain>
	<div class="index" class:on-record={onRecord}>
		<header class="index-head">
			<!-- The count, and at the right the one order the list has, stated rather than offered. -->
			<div class="title-line">
				<h1 id="list-title">{example ? 'Example run' : 'Open IT tenders'}</h1>
				<p class="counts">
					{#each counts as part, index (index)}{#if typeof part === 'number'}<span class="mono"
								>{part}</span
							>{:else}{part}{/if}{/each}
				</p>
				<p class="sort"><Icon name="sort" />Sorted by deadline, soonest first</p>
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
				<p class="gloss">Reading status: what Pagefifty read in each notice.</p>
			</div>
		</header>

		<div class="filter-row">
			<FilterForm state={data.filters} {basePath} />
		</div>
		{#if data.dropped}
			<p class="status" role="status">
				Some filter values in the address were not recognised and were ignored.
			</p>
		{/if}
	</div>

	<div class="split" class:on-record={onRecord} class:with-pane={showPane} bind:this={split}>
		<div class="list-col" bind:this={listColumn}>
			<section id="open" aria-labelledby="list-title">
				{#if nothingMatches}
					<EmptyState
						heading="No tenders match these filters"
						body={emptyBody}
						clearHref={basePath}
					/>
				{:else if list.open.length === 0 && list.closed.length > 0}
					<p class="note">No tender in this list is still open. The closed ones are below.</p>
				{:else}
					<TenderTable
						rows={list.open}
						caption={openCaption}
						{basePath}
						{query}
						{opened}
						{current}
					/>
				{/if}
			</section>

			{#if !nothingMatches}
				<section id="closed" aria-labelledby="closed-title">
					{#if list.closed.length > 0}
						<details open={openedClosed}>
							<summary
								><h2 id="closed-title">
									{closedSummary} (<span class="mono">{list.counts.closed}</span>)
								</h2></summary
							>
							<TenderTable
								rows={list.closed}
								caption="Closed tenders, earliest deadline first"
								{basePath}
								{query}
								{opened}
								{current}
								closed
							/>
						</details>
					{:else}
						<h2 id="closed-title" class="visually-hidden">{closedSummary}</h2>
						<p class="note">{noneClosed}</p>
					{/if}
				</section>
			{/if}
		</div>

		{#if showPane}
			<div class="pane" bind:this={pane}>
				{#if onRecord}
					<a class="back" href={resolve(query === '' ? basePath : `${basePath}?${query}`)}
						><Icon name="arrow" />Back to the list</a
					>
				{/if}
				{@render children?.()}
			</div>
		{:else}
			<!-- With no tender open the route's page holds no record, only its head, so it renders
			     outside a pane: the page keeps its title. -->
			{@render children?.()}
		{/if}
	</div>

	{#if example}
		<DemoNote capturedOn={capture.capturedOn} />
	{/if}
</PageMain>

<style>
	.index-head {
		display: grid;
		gap: 0.25rem;
	}

	.title-line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.875rem;
	}

	h1 {
		font-weight: 750;
		font-size: var(--step-2);
		line-height: 1.2;
		letter-spacing: -0.025em;
		text-wrap: balance;
	}

	.counts {
		color: var(--ink-2);
	}

	.capture {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1rem;
		font-size: var(--step--1);
		line-height: 1.4;
		color: var(--ink-2);
	}

	/* A date is one piece of evidence, so it never breaks across lines; the capture time is its own
	   piece, so on a narrow phone the line breaks between the two, never inside one. */
	.day {
		white-space: nowrap;
	}

	/* The filters in one row under the head, so the list starts high on the first screen. The filters,
	   the list and the opened tender are three areas, each its own white box on the ground. */
	.filter-row,
	.list-col,
	.pane {
		border: 1px solid var(--edge);
		border-radius: var(--r);
		background: var(--bg);
	}

	.filter-row {
		margin-top: 0.875rem;
		padding: 0.75rem 1rem 0.875rem;
	}

	/* The order is stated, not offered: the list has one order and no control changes it. */
	.sort {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		margin-left: auto;
		font-size: var(--step--1);
		color: var(--ink-2);
		white-space: nowrap;
	}

	.status,
	.note {
		max-width: 62ch;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.status {
		margin-top: 0.75rem;
	}

	.note {
		padding: 1rem 0;
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		margin-top: 1rem;
	}

	/* The list keeps 480px where it can and gives up width before the tender does: with its edge and
	   its scrollbar's place that leaves a row's facts room for one line. */
	.split.with-pane {
		grid-template-columns: min(480px, 42%) minmax(0, 1fr);
		gap: 1rem;
	}

	.list-col {
		min-width: 0;
	}

	/* Beside a tender the list scrolls on its own, as the tender does, and both end just above the
	   bottom of the window while the page sits at its top, so each box shows its lower edge, an open
	   row deep in the list shows with the head above it, and reaching the end of either column never
	   scrolls the page under the other. A window too short for the head and a usable column keeps
	   20rem of each. */
	.with-pane .list-col {
		position: sticky;
		top: 0;
		align-self: start;
		max-height: max(20rem, calc(100vh - var(--split-top, 0px) - 1rem));
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
	}

	#closed {
		border-top: 1px solid var(--line);
	}

	summary {
		min-height: 44px;
		padding: 0.75rem 1rem;
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

	#closed .note,
	#open .note {
		padding-inline: 1rem;
	}

	/* Inside the list's box the empty state is a wash, not a second box. */
	#open :global(.empty) {
		margin: 1rem;
		border-color: transparent;
		background: var(--bg-2);
	}

	/* The tender scrolls on its own beside the list. */
	.pane {
		position: sticky;
		top: 0;
		align-self: start;
		min-width: 0;
		max-height: max(20rem, calc(100vh - var(--split-top, 0px) - 1rem));
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		padding: 1.5rem 1.25rem 2.5rem 1.75rem;
	}

	.back {
		display: none;
		align-items: center;
		gap: 0.375rem;
		min-height: 44px;
		font-weight: 600;
		text-decoration: none;
	}

	.back:hover {
		text-decoration: underline;
	}

	.back :global(.icon) {
		transform: rotate(180deg);
	}

	/* A phone shows one thing at a time: the bare list shows the list, and an address that names a
	   tender shows that tender with a way back to the list it came from. */
	@media (max-width: 45em) {
		.split.with-pane {
			grid-template-columns: minmax(0, 1fr);
		}

		/* The list and the tender run to both edges of a phone, white bands on the ground, so a row's
		   tint reads as the row. */
		.list-col,
		.pane {
			margin-inline: calc(-1 * var(--gutter));
			border-inline: 0;
			border-radius: 0;
		}

		.with-pane .list-col {
			position: static;
			max-height: none;
			overflow: visible;
		}

		.split:not(.on-record) .pane,
		.on-record .list-col,
		.index.on-record {
			display: none;
		}

		.pane {
			position: static;
			max-height: none;
			overflow: visible;
			padding: 1rem var(--gutter) 2rem;
		}

		/* A tender alone on a phone starts close under the band. */
		.split.on-record {
			margin-top: -0.75rem;
		}

		.back {
			display: inline-flex;
			margin-bottom: 0.75rem;
		}

		.sort {
			margin-left: 0;
			min-height: 0;
		}
	}

	/* Where the filters fold behind one button, the button stands on the ground by itself. */
	@media (max-width: 40em) {
		.filter-row {
			padding: 0;
			border: 0;
			background: none;
		}
	}
</style>
