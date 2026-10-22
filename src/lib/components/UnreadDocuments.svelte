<script lang="ts">
	import type { DocumentsLink as Documents } from '$lib/ingest/record';
	import DocumentsLink from './DocumentsLink.svelte';
	import Icon from './Icon.svelte';
	import Panel from './Panel.svelte';

	// Shown when any lot's coverage names a source this version does not read, so the criteria on
	// the page may not be all there are. It says what was not read and never what the firm may do.
	// criteriaShown says whether any lot shows a criterion: on a notice that publishes none, there
	// are no criteria "shown above" to point at. The unread source can be the procurement documents,
	// the ESPD or a source the buyer did not name, so the panel names none of them; each lot's
	// coverage list says which.
	let { documents, criteriaShown }: { documents?: Documents; criteriaShown: boolean } = $props();
</script>

<Panel id="documents" labelledby="documents-title">
	<div class="state">
		<Icon name="unread" />
		<div class="body">
			<h2 class="head" id="documents-title">Documents not read yet</h2>
			<p>
				<strong>Sources outside the notice have not been read.</strong>
				{criteriaShown
					? 'The criteria shown above come from the notice alone, and those sources can add more.'
					: 'The notice itself publishes no selection criteria, and those sources may set some.'}
			</p>
			{#if documents !== undefined}<p class="link"><DocumentsLink {documents} /></p>{/if}
		</div>
	</div>
</Panel>

<style>
	/* A dashed box, the one mark for "not read": the mark, then what was left unread. */
	.state {
		display: grid;
		grid-template-columns: 1.375rem minmax(0, 1fr);
		gap: 0.75rem;
		max-width: 40rem;
		padding: 0.875rem 1rem;
		border: 1px dashed var(--line-2);
		border-radius: var(--r);
		color: var(--ink-2);
	}

	.state > :global(svg.icon) {
		width: 1.25rem;
		height: 1.25rem;
	}

	.head {
		font-weight: 650;
		font-size: var(--step-0);
		line-height: 1.3;
		color: var(--ink);
	}

	p {
		margin-top: 0.125rem;
		line-height: 1.5;
	}

	strong {
		font-weight: 600;
		color: var(--ink);
	}

	.link {
		margin-top: 0.375rem;
	}

	.link :global(a) {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--ink);
	}
</style>
