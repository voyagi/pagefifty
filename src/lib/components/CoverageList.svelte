<script lang="ts">
	import type { CoverageLine } from '$lib/core/reading';
	import DocumentsLink from './DocumentsLink.svelte';
	import Label from './Label.svelte';

	// Renders coverageLines output as given: the lines, their order and their wording are decided
	// once, by the same coverage function as the list's reading-status tag.
	let { lines }: { lines: readonly CoverageLine[] } = $props();

	const uid = $props.id();
	const links = $derived(lines.flatMap((line) => (line.link ? [line.link] : [])));
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
		border-top: 1px solid var(--acetate-rule);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.5rem;
		max-width: 72ch;
	}

	strong {
		font-weight: 600;
	}

	.documents {
		margin-top: 0.75rem;
	}
</style>
