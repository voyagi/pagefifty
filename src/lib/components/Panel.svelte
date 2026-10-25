<script lang="ts">
	import type { Snippet } from 'svelte';

	// A block of the page, named by its own heading. A tender record is an article, since it stands
	// on its own; every other block is a section. A page's panels are soft grey cards with no edge on
	// the white page, so each reads as its own area. ruled is for a panel that already sits inside
	// one (a lot inside the opened tender) or stands on the page itself: it keeps to the page it is
	// on and a rule separates it from the panel before it, since a card inside a card would only add
	// edges.
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
		padding: 1.75rem clamp(1rem, 3vw, 2.25rem) 2rem;
		border-radius: var(--r-card);
		background: var(--panel);
	}

	/* Svelte cannot see a sibling panel rendered by another Panel instance, so the earlier one is
	   global. Cards stand apart by the white between them; a ruled panel takes a rule. */
	:global(.panel) + .panel {
		margin-top: 1.25rem;
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
