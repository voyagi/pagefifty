<script lang="ts">
	import type { DocumentsLink as Documents } from '$lib/ingest/record';
	import DocumentsLink from './DocumentsLink.svelte';
	import Leaf from './Leaf.svelte';

	// Shown when any lot's coverage names a source this version does not read, so the criteria on
	// the page may not be all there are. It says what was not read and never what the firm may do.
	// criteriaShown says whether any lot shows a criterion: on a notice that publishes none, there
	// are no criteria "shown above" to point at.
	let { documents, criteriaShown }: { documents?: Documents; criteriaShown: boolean } = $props();
</script>

<Leaf id="documents" tab="Documents" hue="facedown" labelledby="documents-title" ply={2}>
	{#snippet children(tab)}
		<div class="grid">
			<h2 class="head" id="documents-title">
				<svg
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					aria-hidden="true"
				>
					<rect x="3" y="3" width="14" height="14" rx="1" />
					<path d="M3 8h14M3 13h14" />
				</svg>
				Documents not read yet
			</h2>
			{@render tab()}
			<p class="body">
				<strong>The procurement documents have not been read.</strong>
				{criteriaShown
					? 'The criteria shown above come from the notice alone, and the documents can add more.'
					: 'The notice itself publishes no selection criteria, and the documents may set some.'}
				{#if documents !== undefined}<span class="link"><DocumentsLink {documents} /></span>{/if}
			</p>
		</div>
	{/snippet}
</Leaf>

<style>
	.grid {
		display: grid;
		grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr);
		column-gap: 1.75rem;
		align-items: center;
	}

	.head {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding-right: 1.25rem;
		font: 600 var(--step-0) / 1.2 var(--font-cond);
		letter-spacing: 0.02em;
	}

	svg {
		flex: none;
		width: 1.25rem;
		height: 1.25rem;
	}

	.body {
		max-width: 72ch;
	}

	strong {
		font-weight: 600;
		color: var(--ink);
	}

	.link {
		display: block;
		margin-top: 0.5rem;
	}

	@media (max-width: 720px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
			row-gap: 0.75rem;
		}
	}
</style>
