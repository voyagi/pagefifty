<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import ExampleCard from '$lib/components/ExampleCard.svelte';
	import HomeFigure from '$lib/components/HomeFigure.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import PageMain from '$lib/components/PageMain.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import { DEMO_FIRM_NAME, DEMO_PROFILE } from '$lib/profile/demo-firm';
	import { wholeEuros } from '$lib/profile/euros';
	import { lotVerdict } from '$lib/tenders/verdict-view';

	let { data } = $props();

	// The demo firm's own figures beside the profile's call to action, read from the one constant the
	// example run checks against: its latest turnover year, its staff and its certificates.
	const latest = [...DEMO_PROFILE.turnover].sort((a, b) => b.year - a.year)[0];
	const demoFacts = [
		...(latest?.generalNet === undefined
			? []
			: [{ term: `Turnover ${latest.year}`, detail: wholeEuros(latest.generalNet) }]),
		{ term: 'Staff', detail: String(DEMO_PROFILE.staff.total) },
		{
			term: 'Certificates',
			detail: DEMO_PROFILE.certificates.map((certificate) => certificate.standard).join(', ')
		}
	];

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
				<li>Every clause quoted from the tender, with its link</li>
				<li>Not legal advice. Your firm profile stays in your browser</li>
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
			<div class="firm-text">
				<h2 id="firm-title">Your firm's figures</h2>
				<p>
					Turnover, staff, certificates, countries and languages, kept in this browser and never
					sent to a server.
				</p>
				<div class="firm-act">
					<Button variant="secondary" href="/profile">Set up your firm</Button>
				</div>
			</div>
			<!-- The demo firm as a small record, the white object this card holds. -->
			<div class="demo" data-demo-firm>
				<p class="demo-head">
					<span>{DEMO_FIRM_NAME}</span><span class="tag">Demo firm</span>
				</p>
				<dl>
					{#each demoFacts as fact (fact.term)}
						<div>
							<dt>{fact.term}</dt>
							<dd class="mono">{fact.detail}</dd>
						</div>
					{/each}
				</dl>
				<p class="demo-note">Invented figures. The example run is checked against this firm.</p>
			</div>
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

	/* In ink, not the page's grey, since it sits over the picture. Wide enough to set in two lines
	   on a laptop. */
	.lede {
		max-width: 68ch;
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
		background: linear-gradient(var(--decides), var(--decides)) 0 100% / 100% 3px no-repeat;
		padding-bottom: 2px;
		animation: draw 600ms cubic-bezier(0.16, 1, 0.3, 1) 500ms both;
	}

	@keyframes draw {
		from {
			background-size: 0% 3px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.records :global(.excerpt mark.decides) {
			animation: none;
		}
	}

	/* Under the records: who it is for in two tones, the two promises as ledger rows on hairlines,
	   and the snapshot the whole site reads from. */
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
		max-width: 40rem;
		margin: 2rem 0 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--line);
	}

	.promises li {
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--line);
		font-weight: 500;
	}

	.capture {
		margin-top: 1rem;
		font-size: var(--step--1);
		color: var(--ink-2);
		text-wrap: pretty;
	}

	/* The call to set up a firm beside the demo firm's own record: a white object on the grey card,
	   its figures in a ruled ledger. */
	.firm {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: center;
		gap: 1.5rem 3rem;
	}

	.firm-text {
		max-width: 62ch;
	}

	.firm h2 {
		font-weight: 750;
		font-size: var(--step-2);
		line-height: 1.2;
		letter-spacing: -0.025em;
	}

	.firm-text p {
		margin-top: 0.5rem;
		color: var(--ink-2);
	}

	.firm-act {
		margin-top: 1.25rem;
	}

	.demo {
		padding: 1rem 1.25rem 0.75rem;
		border: 1px solid var(--edge);
		border-radius: var(--r-obj);
		background: var(--bg);
	}

	.demo-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--line);
		font-weight: 650;
	}

	/* The quiet pill the example record's "Example run" wears: it names the mode, it is no verdict. */
	.tag {
		padding: 0.125rem 0.625rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r-pill);
		font-weight: 500;
		font-size: 0.78125rem;
		color: var(--ink-2);
	}

	.demo dl {
		margin: 0;
	}

	.demo dl > div {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.25rem 1rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
		font-size: 0.875rem;
	}

	.demo dt {
		color: var(--ink-2);
	}

	.demo dd {
		margin: 0;
		color: var(--ink);
	}

	.demo-note {
		margin-top: 0.75rem;
		font-size: var(--step--1);
		color: var(--ink-2);
		text-wrap: pretty;
	}

	@media (min-width: 45em) {
		.firm {
			grid-template-columns: minmax(0, 1fr) minmax(0, 24rem);
		}
	}

	/* On a phone the buttons take the width, one under the other, and the head is set close so the
	   verdict comes into the first screen. The wash holds behind the lede, whose foot sits a fixed
	   distance above the place's foot (the overlap, the head's foot, the buttons and their margin,
	   about 16.75rem), and clears under the buttons, leaving a short strip of picture before the
	   first record. */
	@media (max-width: 40em) {
		.actions {
			flex-direction: column;
			align-items: stretch;
			margin-top: 1.5rem;
		}

		.head {
			padding-top: 1.75rem;
			padding-bottom: 1.5rem;
		}

		.place::after {
			background: linear-gradient(
				to bottom,
				color-mix(in srgb, var(--bg) 86%, transparent) 0%,
				color-mix(in srgb, var(--bg) 82%, transparent) calc(100% - 16rem),
				transparent calc(100% - 8rem)
			);
		}
	}
</style>
