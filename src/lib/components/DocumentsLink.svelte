<script lang="ts">
	import type { DocumentsLink } from '$lib/ingest/record';
	import ExternalIcon from './ExternalIcon.svelte';

	let { documents }: { documents: DocumentsLink } = $props();
</script>

<!-- A restricted link (BT-615) opens an access request, not the documents, so it never takes the
     open documents' wording. An address that is not http or https is shown as text only. The
     restricted prefix is one string because Svelte drops the space at the end of an {#if} block. -->
{#if documents.href !== undefined}
	<a href={documents.href} rel="external noreferrer"
		>{documents.restricted
			? 'Request access to the restricted procurement documents'
			: 'Open the procurement documents'}<ExternalIcon /></a
	>
{:else}
	<span class="published"
		>{documents.restricted ? 'Restricted procurement documents, published as ' : ''}<span
			class="mono">{documents.published}</span
		></span
	>
{/if}

<style>
	.published {
		overflow-wrap: anywhere;
	}
</style>
