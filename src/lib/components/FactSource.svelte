<script lang="ts">
	import type { Snippet } from 'svelte';
	import ExternalIcon from './ExternalIcon.svelte';

	// The provider's own page a fact was read on, set right under the sentence that states it.
	let { href, children }: { href: string; children: Snippet } = $props();
</script>

<p class="source">
	<a {href} rel="external noreferrer">Source: {@render children()}<ExternalIcon /></a>
</p>

<style>
	.source {
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	/* Inline-block with padding rather than a flex box, so a long source name wraps with its icon at
	   the end of the last line while the target stays 44px tall. */
	a {
		display: inline-block;
		padding-block: 0.8125rem;
		overflow-wrap: anywhere;
	}
</style>
