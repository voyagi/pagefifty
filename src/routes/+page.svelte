<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import ExampleCard from '$lib/components/ExampleCard.svelte';
	import HomeFigure from '$lib/components/HomeFigure.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageMain from '$lib/components/PageMain.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import { DEMO_PROFILE } from '$lib/profile/demo-firm';
	import { lotVerdict } from '$lib/tenders/verdict-view';

	let { data } = $props();

	// The example card shows the first lot of the record /example opens that carries a verdict, for
	// the demo firm at the capture instant, decided exactly as that record's own page decides it. A
	// record with no such lot shows no card, and the first action opens the example list instead.
	const example = $derived.by(() => {
		if (data.example === null) return null;
		const { tender } = data.example;
		for (const lot of tender.lots) {
			const view = lotVerdict(lot, DEMO_PROFILE, tender.now, tender.documents);
			if (view !== null) return { tender, lot, view };
		}
		return null;
	});

	const exampleHref = $derived(
		example === null ? '/example' : (`/example/${example.tender.noticeNumber}` as const)
	);
</script>

<svelte:head>
	<title>Pagefifty: the rule your firm can't meet alone is on page fifty</title>
	<meta
		name="description"
		content="Pagefifty checks whether your firm meets a tender's published selection criteria, and quotes each clause from the tender's own text with its source."
	/>
</svelte:head>

<PageMain>
	<Panel id="start" labelledby="start-title" ruled>
		<div class="hero">
			<div class="claim">
				<h1 class="tagline" id="start-title">
					The rule your firm can't meet alone is on page fifty. Read it first.
				</h1>
				<p class="lede">
					Pagefifty checks whether your firm meets a tender's published selection criteria, and
					quotes each clause from the tender's own text with its source.
				</p>
				<p class="lede">
					For small IT firms in the Netherlands, Belgium and Germany, before you spend two days on a
					public tender.
				</p>
				<div class="actions">
					<Button size="lg" href={exampleHref}>Open the example verdict<Icon name="arrow" /></Button
					>
					<Button size="lg" variant="secondary" href="/tenders">Browse open tenders</Button>
				</div>
				<ul class="promises">
					<li><Icon name="met" />Every clause quoted from the tender, with its link</li>
					<li><Icon name="hash" />Numbers compared by code, never by the model</li>
					<li><Icon name="info" />Not legal advice. Your firm profile stays in your browser</li>
				</ul>
				<p class="capture mono">
					{#if data.firstPublished}
						Snapshot: {data.total} IT notices published from {data.firstPublished} that TED listed as
						active on {data.capturedOn}.
					{:else}
						Snapshot: {data.total} IT notices TED listed as active on {data.capturedOn}.
					{/if}
				</p>
			</div>
			{#if example !== null}
				<ExampleCard tender={example.tender} lot={example.lot} view={example.view} />
			{/if}
		</div>
	</Panel>

	<!-- Below the first screen, so a figure of any height never pushes the actions down. -->
	{#if data.figure}
		<Panel id="figure" labelledby="figure-title">
			<HomeFigure figure={data.figure} />
		</Panel>
	{/if}

	<Panel id="firm" labelledby="firm-title">
		<div class="firm">
			<h2 id="firm-title">Your firm's figures</h2>
			<p>
				Turnover, staff, certificates, countries and languages, kept in this browser and never sent
				to a server.
			</p>
			<Button variant="secondary" href="/profile">Set up your firm</Button>
		</div>
	</Panel>
</PageMain>

<style>
	/* The claim and its actions on the left, the example verdict beside them; one column on a narrow
	   screen, the card under the claim. The extra top space adds to the page's own to give the claim
	   room under the band. */
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2.5rem;
		align-items: start;
		padding-top: 1rem;
	}

	.claim {
		min-width: 0;
	}

	.tagline {
		max-width: 20ch;
		font-weight: 750;
		font-size: var(--step-4);
		line-height: 1.06;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}

	.lede {
		max-width: 62ch;
		margin-top: 1.125rem;
		font-size: 1.03125rem;
		line-height: 1.55;
		color: var(--ink-2);
		text-wrap: pretty;
	}

	.lede + .lede {
		margin-top: 0.5rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.625rem;
		margin-top: 1.625rem;
	}

	.promises {
		display: grid;
		gap: 0.5625rem;
		margin: 1.875rem 0 0;
		padding: 1.375rem 0 0;
		list-style: none;
		border-top: 1px solid var(--line);
		font-size: 0.875rem;
		color: var(--ink-2);
	}

	.promises li {
		display: flex;
		gap: 0.625rem;
	}

	.promises :global(svg.icon) {
		margin-top: 0.125rem;
		color: var(--ink);
	}

	.capture {
		margin-top: 1.25rem;
		font-size: var(--step--1);
		color: var(--ink-2);
		text-wrap: pretty;
	}

	.firm {
		max-width: 62ch;
	}

	.firm h2 {
		font-weight: 700;
		font-size: var(--step-1);
		line-height: 1.3;
	}

	.firm p {
		margin: 0.375rem 0 1rem;
		color: var(--ink-2);
	}

	@media (min-width: 68.75em) {
		.hero {
			grid-template-columns: minmax(0, 470px) minmax(0, 1fr);
			gap: 3.5rem;
		}
	}

	@media (max-width: 45em) {
		.tagline {
			font-size: 2.25rem;
		}
	}
</style>
