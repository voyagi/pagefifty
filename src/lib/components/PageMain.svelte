<script lang="ts">
	import type { Snippet } from 'svelte';

	// bleed is for the start page, whose picture runs the full width of the window; its own blocks
	// keep the page's 1280px measure.
	let { bleed = false, children }: { bleed?: boolean; children: Snippet } = $props();
</script>

<!-- The skip link's target on every page. -->
<main id="main" class="page" class:bleed>
	{@render children()}
</main>

<style>
	.page {
		max-width: 1280px;
		margin: 0 auto;
		padding: 2rem var(--gutter) 3.5rem;
	}

	.bleed {
		max-width: none;
		padding: 0 0 4rem;
	}
</style>
