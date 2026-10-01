<script lang="ts" module>
	export type Board = 'slate' | 'teal' | 'ultramarine' | 'yellow' | 'grass' | 'violet';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let { board, children }: { board: Board; children: Snippet } = $props();
</script>

<main id="main" class="binder board-{board}">
	<span class="binding" aria-hidden="true"></span>
	{@render children()}
</main>

<style>
	/* One board hue per page, read by every leaf's rim through --board. */
	.board-slate {
		--board: var(--slate);
	}
	.board-teal {
		--board: var(--teal);
	}
	.board-ultramarine {
		--board: var(--ultramarine);
	}
	.board-yellow {
		--board: var(--yellow);
	}
	.board-grass {
		--board: var(--grass);
	}
	.board-violet {
		--board: var(--violet);
	}

	/* The right margin leaves the rail free for the tabs that stand off the fore edge. */
	.binder {
		position: relative;
		margin: 0 calc(var(--gutter) + var(--rail)) 3rem var(--gutter);
		background: var(--board);
		border-radius: 6px 0 0 6px;
		padding: var(--board-pad) var(--board-pad) var(--board-pad) 3.5rem;
		box-shadow: var(--lift);
	}

	/* Punched binding: three holes cut through to the desk. An element rather than the mockup's
	   ::before, because axe cannot compute text contrast over an ancestor's painted pseudo element. */
	.binding {
		position: absolute;
		left: 1.25rem;
		top: 0;
		bottom: 0;
		width: 14px;
		background:
			radial-gradient(circle at 7px 7px, var(--desk) 6px, transparent 6.5px) 0 12% / 14px 14px
				no-repeat,
			radial-gradient(circle at 7px 7px, var(--desk) 6px, transparent 6.5px) 0 50% / 14px 14px
				no-repeat,
			radial-gradient(circle at 7px 7px, var(--desk) 6px, transparent 6.5px) 0 88% / 14px 14px
				no-repeat;
	}

	@media (max-width: 45em) {
		.binder {
			margin: 0 0.75rem 2rem;
			padding: 2.375rem var(--board-pad) var(--board-pad);
			border-radius: 6px;
		}

		.binding {
			display: none;
		}
	}
</style>
