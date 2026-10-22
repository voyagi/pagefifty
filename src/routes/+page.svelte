<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Facts from '$lib/components/Facts.svelte';
	import HomeFigure from '$lib/components/HomeFigure.svelte';
	import PageMain from '$lib/components/PageMain.svelte';
	import Panel from '$lib/components/Panel.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Pagefifty: the rule your firm can't meet alone is on page fifty</title>
	<meta
		name="description"
		content="Pagefifty checks whether your firm meets a tender's published selection criteria, and quotes each clause from the tender's own text with its source."
	/>
</svelte:head>

<PageMain>
	<Panel id="start" labelledby="start-title">
		<div class="cover">
			<Facts head="For small IT firms in the Netherlands, Belgium and Germany">
				<p>Before you spend two days on a public tender.</p>
			</Facts>
			<div class="cover-body">
				<h1 class="tagline" id="start-title">
					The rule your firm can't meet alone is on page fifty. Read it first.
				</h1>
				<p class="lede">
					Pagefifty checks whether your firm meets a tender's published selection criteria, and
					quotes each clause from the tender's own text with its source.
				</p>
				<div class="status">
					<p>
						Right now it lists open IT tenders from a dated snapshot and shows each lot's criteria
						as published.
					</p>
					<p class="capture mono">
						{#if data.firstPublished}
							Snapshot: {data.total} IT notices published from {data.firstPublished} that TED listed as
							active on {data.capturedOn}.
						{:else}
							Snapshot: {data.total} IT notices TED listed as active on {data.capturedOn}.
						{/if}
					</p>
				</div>
				<div class="cover-foot">
					<div class="actions">
						<Button href="/tenders">Browse open tenders</Button>
						<Button variant="secondary" href="/example">Open the example run</Button>
					</div>
					<p class="legal">This is not legal advice.</p>
				</div>
				<!-- After the buttons, so a figure of any height never pushes them below the fold. -->
				{#if data.figure}
					<HomeFigure figure={data.figure} />
				{/if}
			</div>
		</div>
	</Panel>

	<Panel id="firm" labelledby="firm-title">
		<div class="grid">
			<Facts head="Your firm's figures" headingId="firm-title" />
			<div class="firm-body">
				<p>
					Turnover, staff, certificates, countries and languages, kept in this browser and never
					sent to a server.
				</p>
				<div class="actions">
					<Button variant="secondary" href="/profile">Set up your firm</Button>
				</div>
			</div>
		</div>
	</Panel>
</PageMain>

<style>
	/* Facts column, then the body; the cover body keeps four columns of its own inside. */
	.cover,
	.grid,
	.cover-body {
		display: grid;
		column-gap: 2.5rem;
	}

	.cover,
	.grid {
		grid-template-columns: 15rem minmax(0, 1fr);
	}

	.cover-body {
		grid-template-columns: repeat(4, minmax(0, 1fr));
		row-gap: 2rem;
		min-width: 0;
	}

	.firm-body {
		min-width: 0;
		max-width: 70ch;
	}

	.tagline {
		grid-column: 1 / -1;
		max-width: 20ch;
		font-weight: 750;
		font-size: var(--step-4);
		line-height: 1.06;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}

	.lede {
		grid-column: 1 / span 2;
		max-width: 52ch;
		font-size: var(--step-1);
		line-height: 1.5;
		text-wrap: pretty;
	}

	.status {
		grid-column: 3 / span 2;
		border-top: 2px solid var(--ink);
		padding-top: 0.75rem;
	}

	.capture {
		margin-top: 0.5rem;
		font-size: var(--step--1);
		color: var(--ink-2);
		text-wrap: pretty;
	}

	.cover-foot {
		grid-column: 1 / -1;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.firm-body .actions {
		margin-top: 1.5rem;
	}

	.legal {
		margin-top: 1rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	@media (max-width: 68.75em) {
		.cover,
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 45em) {
		.cover-body {
			grid-template-columns: minmax(0, 1fr);
		}

		.tagline {
			font-size: 2.25rem;
		}

		.lede,
		.status {
			grid-column: 1 / -1;
		}
	}
</style>
