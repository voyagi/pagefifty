<script lang="ts">
	import type { FigureFile } from '$lib/snapshot/figure';
	import { figureWords } from '$lib/tenders/verdict-view';

	let { figure }: { figure: FigureFile } = $props();

	const { rows, lotRule } = figureWords();
</script>

<!-- Every number here is read from the committed figure file; none is computed on the page. The
	 panel it sits in on the start page is labelled by its heading. -->
<div class="figure" data-figure>
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
</div>

<style>
	.figure {
		min-width: 0;
	}

	.head {
		font: 700 var(--step-2) / 1.2 var(--font);
		letter-spacing: -0.02em;
	}

	.lead {
		margin-top: 0.5rem;
		max-width: 62ch;
		font-size: var(--step-1);
		line-height: 1.45;
		color: var(--ink-2);
		text-wrap: pretty;
	}

	/* Four counts side by side on hairlines, each with its label and what it means. */
	.tally {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		margin: 1.25rem 0 0;
		border-block: 1px solid var(--line);
	}

	.count {
		display: grid;
		grid-template-rows: auto auto 1fr;
		row-gap: 0.25rem;
		min-width: 0;
		padding: 1rem 1.25rem;
	}

	.count + .count {
		border-left: 1px solid var(--line);
	}

	.count:first-child {
		padding-left: 0;
	}

	.label {
		font: 600 var(--step-0) / 1.3 var(--font);
	}

	.number {
		margin: 0;
		font: 700 var(--step-4) / 1 var(--font);
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
	}

	.gloss {
		margin: 0;
		font-size: var(--step--1);
		line-height: 1.4;
		color: var(--ink-2);
		text-wrap: pretty;
	}

	dd {
		margin: 0;
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

	/* The command is set in the page's one face, as every figure is, not in a code face. */
	.command {
		font: inherit;
		font-weight: 500;
		overflow-wrap: anywhere;
		color: var(--ink);
	}

	@media (max-width: 45em) {
		.tally {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.count + .count:nth-child(odd) {
			padding-left: 0;
			border-left: 0;
		}

		.count:nth-child(n + 3) {
			border-top: 1px solid var(--line);
		}

		.number {
			font-size: var(--step-3);
		}
	}
</style>
