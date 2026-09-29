<script lang="ts">
	import Binder from '$lib/components/Binder.svelte';
	import Button from '$lib/components/Button.svelte';
	import Facts from '$lib/components/Facts.svelte';
	import Leaf from '$lib/components/Leaf.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Pagefifty: the rule your firm can't meet alone is on page fifty</title>
	<meta
		name="description"
		content="Pagefifty checks whether your firm meets a tender's published selection criteria, and quotes each clause from the tender's own text with its source."
	/>
</svelte:head>

<Binder board="teal">
	<Leaf id="start" tab="Start" hue="teal" labelledby="start-title" open>
		{#snippet children(tab)}
			<div class="cover">
				<Facts head="For small IT firms in the Netherlands, Belgium and Germany">
					<p>Before you spend two days on a public tender.</p>
				</Facts>
				<div class="cover-body">
					<h1 class="tagline" id="start-title">
						The rule your firm can't meet alone is on page fifty. Read it first.
					</h1>
					{@render tab()}
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
							Snapshot: {data.total} IT notices TED listed as active on {data.capturedOn}.
						</p>
					</div>
					<div class="cover-foot">
						<div class="actions">
							<Button href="/tenders">Browse open tenders</Button>
							<Button variant="secondary" href="/example">Open the example run</Button>
						</div>
						<p class="legal">This is not legal advice.</p>
					</div>
				</div>
			</div>
		{/snippet}
	</Leaf>

	<Leaf id="firm" tab="Firm" hue="ultramarine" labelledby="firm-title" ply={2}>
		{#snippet children(tab)}
			<div class="grid">
				<Facts head="Your firm's figures" headingId="firm-title" />
				{@render tab()}
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
		{/snippet}
	</Leaf>
</Binder>

<style>
	/* Margin column, then four equal columns; the cover body keeps the same four columns inside. */
	.cover,
	.grid,
	.cover-body {
		display: grid;
		column-gap: 1.75rem;
	}

	.cover,
	.grid {
		grid-template-columns: minmax(12rem, 15rem) repeat(4, minmax(0, 1fr));
	}

	.cover-body {
		grid-column: 2 / span 4;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		row-gap: 2rem;
		min-width: 0;
	}

	.firm-body {
		grid-column: 2 / span 4;
		min-width: 0;
		max-width: 70ch;
	}

	.tagline {
		grid-column: 1 / -1;
		max-width: 17ch;
		font: 700 clamp(2.75rem, 5.2vw, 5.5rem) / 0.95 var(--font-cond);
		letter-spacing: -0.025em;
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

	@media (max-width: 1100px) {
		.cover,
		.grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.cover-body,
		.firm-body {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 720px) {
		.cover,
		.grid,
		.cover-body {
			grid-template-columns: minmax(0, 1fr);
		}

		.tagline {
			font-size: 2.5rem;
		}

		.lede,
		.status {
			grid-column: 1 / -1;
		}
	}
</style>
