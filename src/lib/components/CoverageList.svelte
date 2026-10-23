<script lang="ts">
	import type { CoverageLine } from '$lib/core/reading';
	import type { DocumentsLink as Documents } from '$lib/ingest/record';
	import DocumentsLink from './DocumentsLink.svelte';
	import Label from './Label.svelte';

	// Renders coverageLines output as given: the lines, their order and their wording are decided
	// once, by the same coverage function as the list's reading-status tag. documents is the lot's
	// own link when no line and nothing else on the page carries it (LotView.documents).
	let { lines, documents }: { lines: readonly CoverageLine[]; documents?: Documents } = $props();

	const uid = $props.id();
	const links = $derived([
		...lines.flatMap((line) => (line.link ? [line.link] : [])),
		...(documents ? [documents] : [])
	]);
</script>

<section class="coverage" aria-labelledby="{uid}-coverage">
	<Label id="{uid}-coverage">What was read and what was not</Label>
	<ul aria-labelledby="{uid}-coverage">
		{#each lines as line, index (index)}
			<li><strong data-status>{line.status}:</strong> {line.text}</li>
		{/each}
	</ul>
	{#each links as documents, index (index)}
		<p class="documents"><DocumentsLink {documents} /></p>
	{/each}
</section>

<style>
	.coverage {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--line);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.375rem;
		max-width: 72ch;
		font-size: var(--step--1);
		line-height: 1.5;
		color: var(--ink-2);
	}

	/* The status word leads each line in the text colour; what it qualifies follows, quieter. */
	strong {
		font-weight: 600;
		color: var(--ink);
	}

	.documents {
		margin-top: 0.75rem;
	}
</style>
