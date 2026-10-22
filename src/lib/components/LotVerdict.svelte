<script lang="ts">
	import { resolve } from '$app/paths';
	import type { LotVerdictView } from '$lib/tenders/verdict-view';
	import DocumentsLink from './DocumentsLink.svelte';

	// Every word drawn from the verdict sits inside the one data-verdict region, so the no-verdict
	// property can tell this lot's verdict from anything else on the page.
	let { view, compared }: { view: LotVerdictView; compared: string } = $props();

	const asking = $derived(view.decision.verdict === 'ASK FIRST');
</script>

<section class="lot-verdict" class:asking data-verdict aria-label="Verdict for this lot">
	<div class="verdict-row">
		<p class="word" data-verdict-word>{view.label}</p>
		{#each view.shortfalls as shortfall (shortfall.position)}
			<div class="slip" role="note" aria-label="Criterion the firm does not meet on its own">
				<strong>{shortfall.label}</strong>
				{#if shortfall.floor !== null}
					<p>Floor <span class="figure">{shortfall.floor}</span></p>
				{/if}
				<span class="ref">Criterion {shortfall.position} of {shortfall.of}</span>
			</div>
		{/each}
	</div>
	<p class="reason">{view.reason}</p>
	{#if view.article63 !== null}
		<p class="article">{view.article63}</p>
	{/if}
	{#if view.link?.kind === 'profile'}
		<p class="link"><a href={resolve('/profile')}>Set up a firm profile</a></p>
	{:else if view.link?.kind === 'documents'}
		<p class="link"><DocumentsLink documents={view.link.documents} /></p>
	{/if}
	<p class="compared">{compared}</p>
</section>

<style>
	.lot-verdict {
		margin: 0.25rem 0 1.75rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--line);
	}

	.verdict-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem 2rem;
	}

	/* The loudest thing on the record. */
	.word {
		font-weight: 750;
		font-size: var(--step-4);
		line-height: 1;
		letter-spacing: -0.03em;
		text-transform: uppercase;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	/* Dashed is the mark for what is not settled, so an open question underlines itself that way. */
	.asking .word {
		padding-bottom: 0.5rem;
		border-bottom: 2px dashed var(--ink-2);
		max-width: 100%;
	}

	/* A criterion the firm misses on its own, set apart beside the verdict in reversed ink. */
	.slip {
		display: grid;
		gap: 0.2rem;
		max-width: 30rem;
		padding: 0.75rem 1.25rem 0.875rem;
		border-radius: var(--r);
		background: var(--ink);
		color: var(--bg);
	}

	.slip strong {
		font-weight: 700;
		font-size: var(--step--1);
		line-height: 1.2;
	}

	.slip p {
		font-size: var(--step-1);
		font-weight: 600;
		line-height: 1.3;
	}

	.figure,
	.ref {
		font-variant-numeric: tabular-nums;
	}

	.ref {
		font-size: var(--step--1);
	}

	.reason,
	.article {
		max-width: 52ch;
		font-size: var(--step-1);
		line-height: 1.45;
		text-wrap: pretty;
		color: var(--ink);
	}

	.reason {
		margin-top: 1rem;
	}

	.article {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--line);
	}

	/* A link standing alone on its line gets the full target height. */
	.link {
		margin-top: 0.5rem;
	}

	.link :global(a) {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}

	.compared {
		margin-top: 0.5rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	@media (max-width: 45em) {
		.slip {
			max-width: 100%;
		}
	}
</style>
