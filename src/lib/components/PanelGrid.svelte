<script lang="ts">
	import type { Snippet } from 'svelte';

	// The panel's facts column, then its main text beside it. The facts snippet also holds the
	// panel's heading when the facts column carries it. A page that says it once, on its last panel,
	// turns the legal line off on the others.
	let {
		margin,
		legal = true,
		children
	}: { margin: Snippet; legal?: boolean; children: Snippet } = $props();
</script>

<div class="grid">
	{@render margin()}
	<div class="main">
		{@render children()}
		{#if legal}<p class="legal">This is not legal advice.</p>{/if}
	</div>
</div>

<style>
	/* One column until there is room for the facts beside the text; then the facts take 15rem. */
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		column-gap: 2.5rem;
	}

	.main {
		min-width: 0;
	}

	.legal {
		margin-top: 1.5rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	@media (min-width: 68.75em) {
		.grid {
			grid-template-columns: 15rem minmax(0, 1fr);
		}
	}
</style>
