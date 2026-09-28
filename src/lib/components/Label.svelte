<script lang="ts">
	import type { Snippet } from 'svelte';

	let { id, children }: { id?: string; children: Snippet } = $props();
</script>

<p class="label" {id}>{@render children()}</p>

<style>
	.label {
		font: 600 var(--step--1) / 1.3 var(--font-cond);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
		margin-bottom: 0.4rem;
	}
</style>
