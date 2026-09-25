<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Open IT tenders in NL, BE and DE - Pagefifty</title>
</svelte:head>

<main id="main">
	<header class="index-head">
		<h1>Open IT tenders</h1>
		<p class="capture mono">Snapshot captured from TED on {data.capturedOn}</p>
		<p class="caveat">
			A snapshot, not live: tenders published after {data.capturedOn} are missing.
		</p>
	</header>

	<table class="index">
		<caption class="visually-hidden">Open tenders, soonest deadline first</caption>
		<thead>
			<tr>
				<th scope="col">Tender and buyer</th>
			</tr>
		</thead>
		<tbody>
			{#each data.rows as row (row.noticeNumber)}
				{@const buyer = row.buyers[0]}
				<tr data-notice={row.noticeNumber}>
					<td>
						<span class="t" lang={row.title.lang}>{row.title.text}</span>
						{#if buyer}
							<span class="b" lang={buyer.name.lang}>{buyer.name.text}</span>
						{/if}
						<span class="b mono">{row.noticeNumber}</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</main>

<style>
	.mono {
		font-family: 'IBM Plex Mono', ui-monospace, monospace;
		font-variant-numeric: tabular-nums;
	}

	.caveat,
	.b {
		font-size: 0.8125rem;
	}

	.index {
		border-collapse: collapse;
		width: 100%;
	}

	th {
		text-align: start;
	}

	td {
		padding-block: 0.75rem;
		border-top: 1px solid rgb(20 20 20 / 0.1);
		vertical-align: top;
	}

	.t,
	.b {
		display: block;
		max-width: 75ch;
	}

	.t {
		font-weight: 600;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
