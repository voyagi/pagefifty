<script lang="ts">
	import type { FigureFile } from '$lib/snapshot/figure';
	import { figureWords } from '$lib/tenders/verdict-view';

	let { figure }: { figure: FigureFile } = $props();

	const { rows, lotRule } = figureWords();
	const words = $derived(figure.command?.split(' ') ?? []);
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
			<!-- One piece per word, so a narrow screen breaks the command at its spaces and never inside a
			     flag such as --open-after; the spaces stay text, so a copy is the command itself. -->
			Run with
			<code class="command" data-command
				>{#each words as word, index (index)}{index > 0 ? ' ' : ''}<span class="word">{word}</span
					>{/each}</code
			>
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
		font: 750 var(--step-2) / 1.2 var(--font);
		letter-spacing: -0.025em;
	}

	.lead {
		margin-top: 0.5rem;
		max-width: 62ch;
		font-size: var(--step-1);
		line-height: 1.45;
		color: var(--ink-2);
		text-wrap: pretty;
	}

	/* A table on hairlines, one verdict to a row: the word, its count in aligned figures, and what
	   it means. Every row has the same columns, so a sweep down the counts reads the run. */
	.tally {
		margin: 1.5rem 0 0;
		border-top: 1px solid var(--line);
	}

	.count {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 0.25rem 1.5rem;
		min-width: 0;
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--line);
	}

	.label {
		font: 600 var(--step-0) / 1.3 var(--font);
	}

	.number {
		margin: 0;
		font: 650 var(--step-2) / 1.1 var(--font);
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.count .gloss {
		grid-column: 1 / -1;
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

	/* A command a reader can copy and run, so it reads as code: the system's own monospace (no font
	   file to fetch) on a small white object with a hairline, cut cleanly where it wraps. */
	.command {
		padding: 0.0625rem 0.375rem;
		border: 1px solid var(--edge);
		border-radius: var(--r-sm);
		background: var(--bg);
		font:
			400 0.92em / 1.5 ui-monospace,
			'SF Mono',
			Menlo,
			Consolas,
			monospace;
		color: var(--ink);
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}

	/* A word moves to the next line whole; only a word wider than the line itself breaks inside. */
	.word {
		display: inline-block;
		max-width: 100%;
		overflow-wrap: anywhere;
	}

	@media (min-width: 45em) {
		.count {
			grid-template-columns: 12rem 5rem minmax(0, 1fr);
		}

		.count .gloss {
			grid-column: auto;
			padding-left: 1.5rem;
		}
	}
</style>
