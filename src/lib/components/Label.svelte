<script lang="ts">
	import type { Snippet } from 'svelte';

	let { id, children }: { id?: string; children: Snippet } = $props();
</script>

<p class="label" {id}>{@render children()}</p>

<style>
	/* Sentence case at the body face's own spacing: a label is read, not shouted. */
	.label {
		font-weight: 600;
		font-size: var(--step--1);
		line-height: 1.3;
		color: var(--ink-2);
		margin-bottom: 0.4rem;
	}
</style>
