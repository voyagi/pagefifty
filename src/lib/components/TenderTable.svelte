<script lang="ts">
	import { resolve } from '$app/paths';
	import { CANCEL_INTENT_LINE, commonReading, initialsOf, type ListRow } from '$lib/tenders/list';
	import DeadlineTime from './DeadlineTime.svelte';
	import ReadingTag from './ReadingTag.svelte';

	// query is the applied filters as an address search, without its "?", so a row opened from a
	// filtered list keeps the list filtered. opened marks the row whose tender the page shows; current
	// says whether the address names it ('page') or the list opened it by itself ('true').
	let {
		rows,
		caption,
		basePath,
		query = '',
		opened,
		current = 'page',
		closed = false
	}: {
		rows: ListRow[];
		caption: string;
		basePath: '/tenders' | '/example';
		query?: string;
		opened?: string;
		current?: 'page' | 'true';
		closed?: boolean;
	} = $props();

	// The notice number in the path is one the index schema accepted.
	const tenderPath = (notice: string) =>
		query === '' ? (`${basePath}/${notice}` as const) : (`${basePath}/${notice}?${query}` as const);

	const common = $derived(commonReading(rows));
</script>

<!-- A link opens the tender beside the list, so the list keeps its scroll and the focus stays on
     the row that was picked. -->
<ul class="rows" aria-label={caption}>
	{#each rows as row (row.noticeNumber)}
		{@const shown = row.deadline.shown}
		{@const isOpened = row.noticeNumber === opened}
		<li data-notice={row.noticeNumber} class:opened={isOpened}>
			<span class="tile" aria-hidden="true">{row.buyer ? initialsOf(row.buyer.text) : ''}</span>
			<div class="body">
				<a
					class="t"
					href={resolve(tenderPath(row.noticeNumber))}
					lang={row.title.lang}
					aria-current={isOpened ? current : undefined}
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
					data-notice-text>{row.title.text}</a
				>
				<p class="by">
					{#if row.buyer}
						<span class="b who" lang={row.buyer.lang} data-notice-text>{row.buyer.text}</span>
					{/if}
					<!-- A joint procurement's other buyers are counted in the page's own words, outside the
					     notice text. -->
					{#if row.otherBuyers > 0}
						<span class="b"
							>and <span class="mono">{row.otherBuyers}</span>
							{row.otherBuyers === 1 ? 'other buyer' : 'other buyers'}</span
						>
					{/if}
					<span class="b id mono">{row.noticeNumber}</span>
				</p>
				<p class="meta">
					<span class="facts">
						{#if row.countries.length > 0}
							<span class="fact">{row.countries.join(', ')}</span>
						{/if}
						<span class="fact deadline">
							{#if closed}<span class="closed-word">Closed</span>{/if}
							{#if shown.kind === 'in-notice'}
								<span class="in-notice">In notice</span>
							{:else}
								<DeadlineTime instant={shown.instant} />
							{/if}
							{#if row.deadline.lotsDiffer}
								<small>{row.deadline.openLotCount} open lots, deadlines differ</small>
							{/if}
						</span>
						{#if row.value}
							<span class="fact mono">{row.value}</span>
						{:else}
							<span class="fact">Value not published</span>
						{/if}
					</span>
				</p>
				<!-- What was read in the notice is its own line, so it never trails a separator. -->
				<p class="status">
					<ReadingTag reading={row.reading} plain={row.reading.tag === common} />
				</p>
				<!-- The tender's own verdict reads this mark; a row shows no verdict, so this sentence is
				     what keeps a notice whose buyer means to cancel from reading as an ordinary open
				     tender. -->
				{#if row.cancelIntent}
					<p class="cancel" data-cancel-intent>{CANCEL_INTENT_LINE}</p>
				{/if}
			</div>
		</li>
	{/each}
</ul>

<style>
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* The whole row answers to the pointer: the title link's box is stretched over it. */
	li {
		position: relative;
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr);
		gap: 0.875rem;
		padding: 0.875rem 1rem 0.9375rem;
		transition: background-color var(--quick) ease-out;
	}

	li + li {
		border-top: 1px solid var(--line);
	}

	li:hover {
		background: var(--bg-2);
	}

	/* The opened tender: a tint of the brand colour inside a 1px brand edge and an underlined title,
	   no side bar. */
	li.opened {
		background: color-mix(in srgb, var(--brand) 8%, var(--bg));
		outline: 1px solid color-mix(in srgb, var(--brand) 45%, var(--bg));
		outline-offset: -1px;
	}

	.tile {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--bg-2);
		color: var(--ink-2);
		font-weight: 700;
		font-size: var(--step--1);
		letter-spacing: -0.02em;
	}

	.body {
		min-width: 0;
	}

	/* Titles are the notice's own words, often long German compounds, so they break by their
	   language; two lines are shown and the rest is in the tender. */
	.t {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		font-weight: 650;
		font-size: var(--step-0);
		line-height: 1.32;
		letter-spacing: -0.01em;
		text-decoration: none;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.t::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.t:hover,
	.opened .t {
		text-decoration: underline;
		text-decoration-thickness: 1px;
	}

	.by {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.75rem;
		margin-top: 0.125rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	/* A buyer's name keeps one line and gives way first; the count and the notice number stay whole.
	   The name starts from no width and takes the room the two leave, so the line wraps only where the
	   count and the number cannot fit beside each other, as in a narrow column at a large font size.
	   The buyer is the row's second line in full ink, so the grey lines under it read as detail. */
	.who {
		flex: 1 1 0;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
		color: var(--ink);
	}

	.b:not(.who) {
		flex: none;
		white-space: nowrap;
	}

	.id {
		margin-left: auto;
	}

	.meta,
	.status {
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	/* A fact that wraps never starts its line with a dot: every fact draws its dot before it, and
	   the row sits one dot's width to the left inside a clipped box, so the dot of whichever fact
	   starts a line falls outside the box. */
	.meta {
		margin-top: 0.5rem;
		overflow: hidden;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		row-gap: 0.25rem;
		margin-left: -1rem;
	}

	/* The dot is drawn, not text, so a screen reader reads the facts without it. */
	.fact::before {
		content: '·';
		content: '·' / '';
		display: inline-block;
		width: 1rem;
		text-align: center;
	}

	.status {
		margin-top: 0.25rem;
	}

	/* The list is ordered by it, so the deadline is the one fact in full ink. */
	.deadline {
		color: var(--ink);
	}

	.deadline::before {
		color: var(--ink-2);
	}

	.deadline small {
		display: block;
		font-size: inherit;
	}

	.closed-word {
		font-weight: 600;
		color: var(--ink);
	}

	.cancel {
		margin-top: 0.375rem;
		font-size: var(--step--1);
		color: var(--ink);
	}
</style>
