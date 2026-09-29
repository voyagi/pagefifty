<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import type { ListRow } from '$lib/tenders/list';
	import DeadlineTime from './DeadlineTime.svelte';
	import ReadingTag from './ReadingTag.svelte';

	let {
		rows,
		caption,
		basePath,
		closed = false
	}: {
		rows: ListRow[];
		caption: string;
		basePath: '/tenders' | '/example';
		closed?: boolean;
	} = $props();

	// /example/[notice] has no route until plan 01-15, so Pathname cannot type a path built from
	// either base; the notice number in the path is one the index schema accepted.
	const tenderPath = (notice: string) => `${basePath}/${notice}` as Pathname;
</script>

<table class="index">
	<caption class="visually-hidden">{caption}</caption>
	<thead>
		<tr>
			<th scope="col">Deadline</th>
			<th scope="col">Tender and buyer</th>
			<th scope="col">Country</th>
			<th scope="col" class="num">Estimated value</th>
			<th scope="col">Reading status</th>
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row.noticeNumber)}
			{@const shown = row.deadline.shown}
			<tr data-notice={row.noticeNumber}>
				<td class="deadline" data-label="Deadline">
					{#if closed}<span class="closed-word">Closed</span>{/if}
					{#if shown.kind === 'in-notice'}
						<span class="in-notice">In notice</span>
					{:else}
						<DeadlineTime instant={shown.instant} />
					{/if}
					{#if row.deadline.lotsDiffer}
						<small>{row.deadline.openLotCount} lots, deadlines differ</small>
					{/if}
				</td>
				<td class="tender">
					<a
						class="t"
						href={resolve(tenderPath(row.noticeNumber))}
						lang={row.title.lang}
						data-notice-text>{row.title.text}</a
					>
					{#if row.buyer}
						<span class="b" lang={row.buyer.lang} data-notice-text>{row.buyer.text}</span>
					{/if}
					<span class="b mono">{row.noticeNumber}</span>
				</td>
				<td data-label="Country">{row.countries.join(', ')}</td>
				<td class="num" data-label="Estimated value">
					{#if row.value}
						<span class="mono">{row.value}</span>
					{:else}
						<span class="unpublished">Value not published</span>
					{/if}
				</td>
				<td class="status">
					<ReadingTag reading={row.reading} />
				</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.index {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		text-align: left;
		font: 600 var(--step--1) / 1.3 var(--font-cond);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
		padding: 0 1rem 0.625rem 0;
		border-bottom: 1px solid var(--acetate-edge);
		white-space: nowrap;
	}

	td {
		padding: 1rem 1rem 1rem 0;
		border-bottom: 1px solid var(--acetate-rule);
		vertical-align: top;
	}

	td + td,
	th + th {
		padding-left: 1rem;
		border-left: 1px solid var(--acetate-rule);
	}

	.num {
		text-align: right;
		white-space: nowrap;
	}

	.deadline {
		white-space: nowrap;
	}

	.closed-word {
		display: block;
		font-weight: 600;
	}

	.deadline small {
		display: block;
		font-size: var(--step--1);
		color: var(--ink-2);
		white-space: normal;
	}

	.tender {
		width: 100%;
	}

	/* Titles and buyer names are the notice's own words, often long German compounds, so they break
	   by their language rather than overflow a phone. */
	.t,
	.b {
		display: block;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.t {
		font-weight: 600;
		line-height: 1.3;
		max-width: 70ch;
		text-decoration-color: var(--acetate-edge);
	}

	.t:hover {
		text-decoration-color: currentColor;
	}

	.b {
		margin-top: 0.25rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.unpublished {
		color: var(--ink-2);
	}

	/* Headers stay in the accessibility tree while hidden; each stacked cell that does not name itself
	   carries a visible label, and the empty alternative text keeps a screen reader from reading it
	   twice after the column header. */
	@media (max-width: 720px) {
		thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		.index,
		tbody,
		tr,
		td {
			display: block;
		}

		tr {
			padding: 0.875rem 0;
			border-bottom: 1px solid var(--acetate-edge);
		}

		td,
		td + td {
			border: 0;
			padding: 0.25rem 0;
		}

		.num {
			text-align: left;
		}

		.tender {
			width: auto;
		}

		td[data-label]::before {
			content: attr(data-label) ': ';
			content: attr(data-label) ': ' / '';
			color: var(--ink-2);
		}

		.deadline .closed-word {
			display: inline;
			margin-right: 0.5rem;
		}
	}
</style>
