<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import ExampleCard from '$lib/components/ExampleCard.svelte';
	import HomeFigure from '$lib/components/HomeFigure.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
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

<PageHead title="Pagefifty: the rule your firm can't meet alone is on page fifty" />

<PageMain bleed>
	<Panel id="start" labelledby="start-title" ruled>
		<div class="hero">
			<!-- The place the records float over: a made picture of an imaginary library (its source and
			     prompt sit beside the files in static/place). Phones get a portrait crop on the stairs. -->
			<div class="place" aria-hidden="true">
				<picture>
					<source
						media="(max-width: 40em)"
						srcset="/place/library-tall-800.webp 800w, /place/library-tall-1200.webp 1200w"
						sizes="100vw"
						width="800"
						height="985"
					/>
					<img
						src="/place/library-wide-1920.webp"
						srcset="/place/library-wide-1280.webp 1280w, /place/library-wide-1920.webp 1920w, /place/library-wide-2560.webp 2560w, /place/library-wide-3344.webp 3344w"
						sizes="100vw"
						width="1920"
						height="1075"
						alt=""
						fetchpriority="high"
					/>
				</picture>
			</div>
			<div class="head">
				<h1 class="tagline" id="start-title">
					The rule your firm can't meet alone is on page fifty. Read it first.
				</h1>
				<p class="lede">
					Pagefifty checks whether your firm meets a tender's published selection criteria, and
					quotes each clause from the tender's own text with its source.
				</p>
				<div class="actions">
					<Button size="lg" href={exampleHref}>Open the example verdict<Icon name="arrow" /></Button
					>
					<Button size="lg" variant="secondary" href="/tenders">Browse open tenders</Button>
				</div>
			</div>
			{#if example !== null}
				<div class="records">
					<ExampleCard tender={example.tender} lot={example.lot} view={example.view} />
				</div>
			{/if}
		</div>

		<div class="proof">
			<h2 class="two-tone">
				For small IT firms in the Netherlands, Belgium and Germany.
				<span>Before you spend two days on a public tender.</span>
			</h2>
			<ul class="promises">
				<li><Icon name="met" />Every clause quoted from the tender, with its link</li>
				<li><Icon name="hash" />Numbers compared by code, never by the model</li>
				<li><Icon name="info" />Not legal advice. Your firm profile stays in your browser</li>
			</ul>
			<p class="capture mono">
				Snapshot: {data.served}
				{#if data.served !== data.total}of the {data.total}{/if}
				{#if data.firstPublished}
					IT notices published from {data.firstPublished} that TED listed as active on {data.capturedOn}.
				{:else}
					IT notices TED listed as active on {data.capturedOn}.
				{/if}
			</p>
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
			<div>
				<h2 id="firm-title">Your firm's figures</h2>
				<p>
					Turnover, staff, certificates, countries and languages, kept in this browser and never
					sent to a server.
				</p>
			</div>
			<Button variant="secondary" href="/profile">Set up your firm</Button>
		</div>
	</Panel>
</PageMain>

<style>
	/* The start page runs the full window wide, so each block sets its own measure: the page's
	   1280px less the gutters, centred. */
	.head,
	.records,
	.proof,
	:global(main.bleed > .panel:not(#start)) {
		width: min(calc(100% - 2 * var(--gutter)), calc(1280px - 2 * var(--gutter)));
		margin-inline: auto;
	}

	/* The place sits behind the head and the top of the records; the records run on past its foot
	   into the white page. The grid ties that foot to the records: the place spans the head's row
	   and the overlap row, the records start at the overlap row, so the overlap holds at any head
	   height. */
	.hero {
		--overlap: clamp(7rem, 18vw, 16rem);
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto var(--overlap) auto;
		padding-bottom: 1rem;
	}

	.place {
		grid-area: 1 / 1 / 3 / 2;
		position: relative;
		overflow: hidden;
		background: var(--panel);
	}

	/* Out of flow, so the picture fills the place without sizing the grid's rows. */
	.place img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 50% 35%;
	}

	/* The page's own colour washes the picture's upper part, so the headline and lede read at full
	   contrast whatever shelf sits behind them; the lower half, under the records, is the picture. */
	.place::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to bottom,
			color-mix(in srgb, var(--bg) 80%, transparent) 0%,
			color-mix(in srgb, var(--bg) 66%, transparent) 42%,
			transparent 72%
		);
	}

	:global(:root[data-theme='dark']) .place img {
		filter: brightness(0.45);
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme])) .place img {
			filter: brightness(0.45);
		}
	}

	.head {
		grid-area: 1 / 1;
		position: relative;
		max-width: 72rem;
		padding-top: clamp(2.5rem, 5.5vw, 4.25rem);
		padding-bottom: clamp(2.5rem, 4.5vw, 3.5rem);
		text-align: center;
	}

	/* The one display line on the site: heavy, tight and centred, in ink over the light place, two
	   lines on a laptop so the records start inside the first screen. */
	.tagline {
		max-width: 30ch;
		margin-inline: auto;
		font-weight: 800;
		font-size: clamp(2.375rem, 4.6vw, 3.875rem);
		line-height: 1.02;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}

	/* In ink, not the page's grey, since it sits over the picture. */
	.lede {
		max-width: 54ch;
		margin: 1.25rem auto 0;
		font-size: clamp(1.0625rem, 1.4vw, 1.1875rem);
		line-height: 1.5;
		color: var(--ink);
		text-wrap: balance;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 1.75rem;
	}

	.records {
		grid-area: 2 / 1 / 4 / 2;
		position: relative;
	}

	/* The deciding words' underline draws once, left to right, after the records settle: the
	   promise the tool keeps on every record. Its resting state is the full underline, so with
	   reduced motion, or before the animation runs, the words are marked all the same. */
	.records :global(.excerpt mark.decides) {
		text-decoration: none;
		background: linear-gradient(var(--brand), var(--brand)) 0 100% / 100% 2px no-repeat;
		padding-bottom: 2px;
		animation: draw 900ms cubic-bezier(0.16, 1, 0.3, 1) 500ms both;
	}

	@keyframes draw {
		from {
			background-size: 0% 2px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.records :global(.excerpt mark.decides) {
			animation: none;
		}
	}

	/* Under the records: who it is for in two tones, the three promises on hairlines, and the
	   snapshot the whole site reads from. */
	.proof {
		margin-top: clamp(3.5rem, 7vw, 5.5rem);
		margin-bottom: clamp(3rem, 6vw, 4.5rem);
	}

	.two-tone {
		max-width: 30ch;
		font-weight: 750;
		font-size: clamp(1.75rem, 3vw, 2.375rem);
		line-height: 1.12;
		letter-spacing: -0.035em;
		text-wrap: balance;
	}

	.two-tone span {
		color: var(--ink-3);
	}

	.promises {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		margin: 2rem 0 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--line);
	}

	.promises li {
		display: flex;
		gap: 0.75rem;
		padding: 1rem 0;
		border-bottom: 1px solid var(--line);
		font-weight: 500;
	}

	.promises :global(svg.icon) {
		flex: none;
		margin-top: 0.1875rem;
	}

	.capture {
		margin-top: 1rem;
		font-size: var(--step--1);
		color: var(--ink-2);
		text-wrap: pretty;
	}

	.firm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem 2rem;
	}

	.firm > div {
		max-width: 62ch;
	}

	.firm h2 {
		font-weight: 750;
		font-size: var(--step-2);
		line-height: 1.2;
		letter-spacing: -0.025em;
	}

	.firm p {
		margin-top: 0.375rem;
		color: var(--ink-2);
	}

	@media (min-width: 45em) {
		.promises {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			border-bottom: 1px solid var(--line);
		}

		.promises li {
			padding: 1.125rem 1.5rem 1.25rem 0;
			border-bottom: 0;
		}

		.promises li + li {
			padding-left: 1.5rem;
			border-left: 1px solid var(--line);
		}
	}

	/* On a phone the buttons take the width, one under the other. The head fills most of the
	   place, so the wash holds further down behind the text, and a strip of clear picture shows
	   between the buttons and the first record. */
	@media (max-width: 40em) {
		.actions {
			flex-direction: column;
			align-items: stretch;
		}

		.head {
			padding-bottom: 6rem;
		}

		.place::after {
			background: linear-gradient(
				to bottom,
				color-mix(in srgb, var(--bg) 86%, transparent) 0%,
				color-mix(in srgb, var(--bg) 82%, transparent) 52%,
				transparent 68%
			);
		}
	}
</style>
