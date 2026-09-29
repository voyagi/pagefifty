<script lang="ts">
	import type { DocumentsLink } from '$lib/ingest/record';
	import { linkTarget } from '$lib/ingest/link-target';
	import ExternalIcon from './ExternalIcon.svelte';

	let { documents }: { documents: DocumentsLink } = $props();

	// safeLink already kept only http and https; the same rule runs again here, where the address
	// becomes an href, so the link never depends on where the record came from.
	const target = $derived(documents.href === undefined ? undefined : linkTarget(documents.href));
</script>

<!-- A restricted link (BT-615) opens an access request, not the documents, so it never takes the
     open documents' wording. An address that is not http or https is shown as text only, still
     named as the documents it stands for. The prefix is one string because Svelte drops the space
     at the end of an {#if} block. -->
{#if target !== undefined}
	<a href={target} rel="external noreferrer"
		>{documents.restricted
			? 'Request access to the restricted procurement documents'
			: 'Open the procurement documents'}<ExternalIcon /></a
	>
{:else}
	<span class="published"
		>{documents.restricted
			? 'Restricted procurement documents, published as '
			: 'Procurement documents, published as '}<span class="mono">{documents.published}</span></span
	>
{/if}

<style>
	.published {
		overflow-wrap: anywhere;
	}
</style>
