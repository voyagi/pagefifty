<script lang="ts">
	import type { DocumentsLink as Documents } from '$lib/ingest/record';
	import DocumentsLink from './DocumentsLink.svelte';
	import ExternalIcon from './ExternalIcon.svelte';

	let { tedUrl, documents }: { tedUrl: string; documents?: Documents } = $props();
</script>

<p class="provenance">
	<a href={tedUrl} rel="external noreferrer">Open notice on TED<ExternalIcon /></a>
	{#if documents !== undefined}<DocumentsLink {documents} />{/if}
</p>

<style>
	.provenance {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
		margin-top: 1rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}
</style>
