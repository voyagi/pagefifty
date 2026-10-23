<script lang="ts">
	import type { Snippet } from 'svelte';

	// A block of the page, named by its own heading. A tender record is an article, since it stands
	// on its own; every other block is a section. A page's panels are white boxes on the ground, so
	// each reads as its own area. ruled is for a panel that already sits inside a box (a lot inside
	// the opened tender) or holds one (the start page's claim beside the example card): it keeps to
	// the page it is on and a rule separates it from the panel before it, since a box inside a box
	// would only add edges.
	let {
		id,
		labelledby,
		element = 'section',
		ruled = false,
		children
	}: {
		id?: string;
		labelledby: string;
		element?: 'section' | 'article';
		ruled?: boolean;
		children: Snippet;
	} = $props();
</script>

<svelte:element this={element} class="panel" class:ruled {id} aria-labelledby={labelledby}>
	{@render children()}
</svelte:element>

<style>
	.panel {
		min-width: 0;
	}

	.panel:not(.ruled) {
		padding: 1.5rem clamp(1rem, 2.5vw, 1.75rem) 1.75rem;
		border: 1px solid var(--edge);
		border-radius: var(--r);
		background: var(--bg);
	}

	/* Svelte cannot see a sibling panel rendered by another Panel instance, so the earlier one is
	   global. Boxes stand apart by the ground between them; a ruled panel takes a rule. */
	:global(.panel) + .panel {
		margin-top: 1rem;
	}

	:global(.panel) + .panel.ruled {
		margin-top: 2.5rem;
		padding-top: 1.75rem;
		border-top: 1px solid var(--line);
	}

	/* A box after an unboxed panel, as under the start page's claim, gets the room a rule would. */
	:global(.panel.ruled) + .panel:not(.ruled) {
		margin-top: 2.5rem;
	}
</style>
