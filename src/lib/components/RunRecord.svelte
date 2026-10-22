<script module lang="ts">
	import type { ReadingRun } from '$lib/snapshot/readings';

	interface RunRecordField {
		term: string;
		value: (run: ReadingRun) => string;
		mono: boolean;
	}

	const count = (value: number) => value.toLocaleString('en-GB');

	// The one order the record is shown in: the component iterates this list and nothing else.
	export const RUN_RECORD_FIELDS: readonly RunRecordField[] = [
		{ term: 'Model', value: (run) => run.model, mono: true },
		{ term: 'Provider', value: (run) => run.provider, mono: false },
		{ term: 'Region', value: (run) => run.region, mono: true },
		{ term: 'Run date', value: (run) => run.runDate, mono: true },
		{ term: 'Input tokens', value: (run) => count(run.tokens.input), mono: true },
		{ term: 'Output tokens', value: (run) => count(run.tokens.output), mono: true },
		{ term: 'Reasoning tokens', value: (run) => count(run.tokens.reasoning), mono: true },
		{ term: 'Cost in USD', value: (run) => run.costUsd, mono: true },
		{ term: 'Quotes verified', value: (run) => count(run.quotes.verified), mono: true },
		{ term: 'Quotes rejected', value: (run) => count(run.quotes.rejected), mono: true }
	];
</script>

<script lang="ts">
	let { run }: { run: ReadingRun | null } = $props();
</script>

{#if run !== null}
	<section class="run-record" data-run-record aria-labelledby="run-record-title">
		<h2 class="run-head" id="run-record-title">Model read of this capture</h2>
		<dl>
			{#each RUN_RECORD_FIELDS as field (field.term)}
				<div>
					<dt>{field.term}</dt>
					<dd>
						{#if field.mono}<span class="mono">{field.value(run)}</span>{:else}{field.value(
								run
							)}{/if}
					</dd>
				</div>
			{/each}
		</dl>
	</section>
{:else}
	<p class="run-record none" data-run-record>No model read in this capture.</p>
{/if}

<style>
	.run-record {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--line);
	}

	.run-head {
		margin-bottom: 0.75rem;
		font: 600 var(--step--1) / 1.3 var(--font);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-2);
	}

	dl {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr));
		gap: 0.75rem 1.75rem;
	}

	dt {
		font-size: var(--step--1);
		font-weight: 500;
		color: var(--ink-2);
	}

	dd {
		margin: 0.125rem 0 0;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.none {
		font-size: var(--step--1);
		color: var(--ink-2);
	}
</style>
