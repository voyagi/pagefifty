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
		margin-top: 0.25rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		overflow-wrap: anywhere;
	}
</style>
