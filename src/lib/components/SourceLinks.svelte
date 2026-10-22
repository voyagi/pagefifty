<script lang="ts">
	import type { DocumentsLink as Documents } from '$lib/ingest/record';
	import DocumentsLink from './DocumentsLink.svelte';
	import ExternalIcon from './ExternalIcon.svelte';

	let { tedUrl, documents }: { tedUrl: string; documents?: Documents } = $props();
</script>

<!-- The tender's actions are its two sources: the documents first, where the criteria the notice
     leaves out are kept, then the notice itself on TED. -->
<p class="actions">
	{#if documents !== undefined}<span class="lead"><DocumentsLink {documents} /></span>{/if}
	<a class="ted" href={tedUrl} rel="external noreferrer">Open notice on TED<ExternalIcon /></a>
</p>

<style>
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1.125rem;
	}

	/* The links take the buttons' shape. A documents address that is not http or https stays the
	   text DocumentsLink makes of it, beside the button for the notice. */
	.lead :global(a),
	.ted {
		display: inline-flex;
		align-items: center;
		min-height: 38px;
		padding: 0.375rem 1rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r);
		font: 600 var(--step-0) / 1.2 var(--font);
		text-decoration: none;
		transition:
			background-color var(--quick) ease-out,
			border-color var(--quick) ease-out;
	}

	.lead :global(a) {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--brand-ink);
	}

	.lead :global(a:hover) {
		background: var(--brand-hover);
		border-color: var(--brand-hover);
	}

	.ted {
		background: var(--bg);
		color: var(--ink);
	}

	.ted:hover {
		background: var(--bg-2);
		border-color: var(--ink-2);
	}

	.lead :global(.published) {
		font-size: var(--step--1);
		color: var(--ink-2);
	}
</style>
