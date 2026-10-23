<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- The skip link's target on every page. -->
<main id="main" class="page">
	{@render children()}
</main>

<style>
	.page {
		max-width: 1280px;
		margin: 0 auto;
		padding: 1.75rem var(--gutter) 3rem;
	}
</style>
