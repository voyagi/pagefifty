<script lang="ts">
	import type { ReadingStatus } from '$lib/core/reading';
	import Icon from './Icon.svelte';

	// plain is set where the reading is the one most rows of the list share: it is written as muted
	// text, and only a reading that differs gets the tag's box.
	let {
		reading,
		plain = false
	}: { reading: Pick<ReadingStatus, 'tag' | 'text'>; plain?: boolean } = $props();

	const inDocuments = $derived(reading.tag === 'criteria-in-documents');
</script>

{#if plain}
	<span class="reading" class:facedown={inDocuments}>{reading.text}</span>
{:else}
	<span class="tag" class:facedown={inDocuments}
		><Icon name={inDocuments ? 'doc' : 'lines'} />{reading.text}</span
	>
{/if}

<style>
	/* A reading is never a verdict, so it takes no ink fill: a quiet outlined tag. The dashed edge
	   means "not read or not settled", here the documents nobody has read yet. */
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-height: 24px;
		padding: 0.125rem 0.5625rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r-sm);
		background: var(--bg);
		font-weight: 500;
		font-size: 0.78125rem;
		line-height: 1.2;
		color: var(--ink-2);
	}

	.tag.facedown {
		border-style: dashed;
	}

	.tag :global(.icon) {
		width: 14px;
		height: 14px;
	}
</style>
