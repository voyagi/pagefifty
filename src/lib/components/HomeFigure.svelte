<script lang="ts">
	import type { FigureFile } from '$lib/snapshot/figure';
	import { figureWords } from '$lib/tenders/verdict-view';

	let { figure }: { figure: FigureFile } = $props();

	const { rows, lotRule } = figureWords();
</script>

<!-- Every number here is read from the committed figure file; none is computed on the page. -->
<section class="figure" data-figure aria-labelledby="figure-title">
	<h2 class="head" id="figure-title">What one run found</h2>
	<p class="lead">
		Of <span class="mono" data-population>{figure.population}</span> IT notices in the {figure.capturedOn}
		snapshot, this is how each one reads for the demo firm.
	</p>
	<dl class="tally">
		{#each rows as row (row.key)}
			<div class="count" data-count={row.key}>
				<dt class="label">{row.label}</dt>
				<dd class="number" data-number>{figure.counts[row.key]}</dd>
				<dd class="gloss">{row.gloss}</dd>
			</div>
		{/each}
	</dl>
	<p class="rule">{lotRule}</p>
	<p class="frame">
		From one run over the {figure.capturedOn} snapshot, at a model cost of
		<span class="mono">USD {figure.costUsd}</span>.
		{#if figure.command !== null}
			Run with <code class="command" data-command>{figure.command}</code>
		{:else}
			The model read was a one-off, so no command line is recorded for it.
		{/if}
	</p>
	<p class="frame">
		It counts what that run read in each notice's own text, for the demo firm only. It is not advice
		to bid and does not say any firm qualifies.
	</p>
</section>

<style>
	.figure {
		grid-column: 1 / -1;
		border-top: 2px solid var(--ink);
		padding-top: 0.75rem;
		min-width: 0;
	}

	.head {
		font: 600 var(--step-2) / 1.1 var(--font-cond);
		letter-spacing: -0.015em;
	}

	.lead {
		margin-top: 0.5rem;
		max-width: 52ch;
		font-size: var(--step-1);
		line-height: 1.45;
		text-wrap: pretty;
	}

	.tally {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		column-gap: 1.75rem;
		margin-top: 1.25rem;
		border-top: 1px solid var(--acetate-rule);
		border-bottom: 1px solid var(--acetate-rule);
	}

	.count {
		display: grid;
		grid-template-rows: auto auto 1fr;
		row-gap: 0.25rem;
		padding: 0.875rem 0;
		min-width: 0;
	}

	.label {
		font: 600 var(--step-0) / 1.25 var(--font-cond);
		letter-spacing: 0.01em;
	}

	.number {
		font: 500 var(--step-5) / 1 var(--font-mono);
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
	}

	.gloss {
		font-size: var(--step--1);
		line-height: 1.4;
		color: var(--ink-2);
		text-wrap: pretty;
	}

	.rule {
		margin-top: 0.875rem;
		max-width: 70ch;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.frame {
		margin-top: 0.5rem;
		max-width: 70ch;
		font-size: var(--step--1);
		color: var(--ink-2);
		text-wrap: pretty;
	}

	.mono,
	.command {
		font-family: var(--font-mono);
		font-size: 0.9375em;
	}

	.command {
		overflow-wrap: anywhere;
		color: var(--ink);
	}

	@media (max-width: 45em) {
		.tally {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			column-gap: 1rem;
		}

		.number {
			font-size: var(--step-3);
		}
	}
</style>
