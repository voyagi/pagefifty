<script lang="ts">
	import type { Snippet } from 'svelte';

	// The leaf's margin column, then its main text across the four columns beside it. The margin
	// snippet also carries the leaf's tab when the margin holds the leaf's heading.
	let { margin, children }: { margin: Snippet; children: Snippet } = $props();
</script>

<div class="grid">
	{@render margin()}
	<div class="main">
		{@render children()}
		<p class="legal">This is not legal advice.</p>
	</div>
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: minmax(12rem, 15rem) repeat(4, minmax(0, 1fr));
		column-gap: 1.75rem;
	}

	.main {
		grid-column: 2 / span 4;
		min-width: 0;
	}

	.legal {
		margin-top: 1.5rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	@media (max-width: 68.75em) {
		.grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.main {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 45em) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
