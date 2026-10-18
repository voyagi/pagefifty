<script lang="ts">
	import type { LotVerdictView } from '$lib/tenders/verdict-view';

	// Every word drawn from the verdict sits inside the one data-verdict region, so the no-verdict
	// property can tell this lot's verdict from anything else on the page.
	let { view, compared }: { view: LotVerdictView; compared: string } = $props();

	const asking = $derived(view.decision.verdict === 'ASK FIRST');
</script>

<section class="lot-verdict" class:asking data-verdict aria-label="Verdict for this lot">
	<p class="word" data-verdict-word>{view.label}</p>
	<p class="reason">{view.reason}</p>
	<p class="compared">{compared}</p>
</section>

<style>
	.lot-verdict {
		margin: 0.25rem 0 1.75rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--acetate-rule);
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
		width: fit-content;
		max-width: 100%;
	}

	.reason {
		max-width: 52ch;
		margin-top: 1rem;
		font-size: var(--step-1);
		line-height: 1.45;
		text-wrap: pretty;
		color: var(--ink);
	}

	.compared {
		margin-top: 0.5rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}
</style>
