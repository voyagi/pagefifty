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
		border-bottom: 1px solid var(--acetate-rule);
	}

	.verdict-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem 2rem;
	}

	/* The loudest thing in the system, in condensed caps on the leaf itself. */
	.word {
		font: 700 var(--step-6) / 0.85 var(--font-cond);
		letter-spacing: -0.02em;
		text-transform: uppercase;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	/* Dashed is the binder's mark for what is not settled, so an open question underlines itself
	   that way and never in vermilion. */
	.asking .word {
		padding-bottom: 0.5rem;
		border-bottom: 2px dashed var(--ink-3);
		max-width: 100%;
	}

	/* The errata slip: a separate strip of vermilion paper, punched and filed beside the verdict,
	   and the only vermilion on the page. It rules the firm out on its own, nothing else. */
	.slip {
		position: relative;
		display: grid;
		gap: 0.2rem;
		max-width: 30rem;
		padding: 0.75rem 1.25rem 0.875rem 2.5rem;
		border-radius: 2px;
		background: var(--errata);
		color: var(--errata-ink);
		box-shadow: var(--lift);
	}

	.slip::before {
		content: '';
		position: absolute;
		left: 0.875rem;
		top: 50%;
		width: 0.75rem;
		height: 0.75rem;
		margin-top: -0.375rem;
		border-radius: 50%;
		background: var(--acetate);
	}

	.slip strong {
		font: 700 var(--step--1) / 1.2 var(--font-cond);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.slip p {
		font-size: var(--step-1);
		font-weight: 600;
		line-height: 1.3;
	}

	.figure,
	.ref {
		font-family: var(--font-mono);
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
		border-top: 1px solid var(--acetate-rule);
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
