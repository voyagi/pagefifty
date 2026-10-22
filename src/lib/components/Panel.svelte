<script lang="ts">
	import type { Snippet } from 'svelte';

	// A block of the page, named by its own heading. A tender record is an article, since it stands
	// on its own; every other block is a section.
	let {
		id,
		labelledby,
		element = 'section',
		children
	}: {
		id?: string;
		labelledby: string;
		element?: 'section' | 'article';
		children: Snippet;
	} = $props();
</script>

<svelte:element this={element} class="panel" {id} aria-labelledby={labelledby}>
	{@render children()}
</svelte:element>

<style>
	/* No card box: panels sit on the page itself and a hairline separates one from the next. */
	.panel {
		min-width: 0;
	}

	/* Svelte cannot see a sibling panel rendered by another Panel instance, so the earlier one is
	   global. */
	:global(.panel) + .panel {
		margin-top: 2.5rem;
		padding-top: 1.75rem;
		border-top: 1px solid var(--line);
	}
</style>
