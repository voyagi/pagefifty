<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Board } from './Binder.svelte';

	// The leaf hands its tab to the caller as a snippet, so the page places the tab right after the
	// leaf heading: the tab is drawn on the fore edge, but keyboard order follows the reading order.
	let {
		id,
		tab,
		hue,
		labelledby,
		ply = 1,
		count,
		open = false,
		tabMono = false,
		tabLabel,
		element = 'section',
		children
	}: {
		id: string;
		tab: string;
		// A face-down leaf is a document not read yet: it has no division hue, only the leaf back.
		hue: Board | 'facedown';
		labelledby: string;
		ply?: 1 | 2;
		count?: number;
		open?: boolean;
		tabMono?: boolean;
		tabLabel?: string;
		element?: 'section' | 'article';
		children: Snippet<[Snippet]>;
	} = $props();
</script>

{#snippet tabLink()}
	<a
		class="tab hue-{hue}"
		href="#{id}"
		aria-current={open ? 'true' : undefined}
		aria-label={tabLabel}
	>
		<span class:mono-label={tabMono}>{tab}</span>
		{#if count !== undefined}<span class="count">{count}</span>{/if}
	</a>
{/snippet}

<svelte:element
	this={element}
	class="leaf"
	class:ply-2={ply === 2}
	class:facedown={hue === 'facedown'}
	{id}
	aria-labelledby={labelledby}
>
	{@render children(tabLink)}
</svelte:element>

<style>
	.leaf {
		--inset: var(--board-pad);
		position: relative;
		background: var(--acetate);
		border: 1px solid var(--acetate-edge);
		border-radius: 3px;
		padding: 1.75rem 2rem;
		box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--board) 14%, transparent);
	}

	/* Dashed edges mean "not read or not settled"; the board rim stays off a leaf lying face down. */
	.leaf.facedown {
		background: var(--leaf-back);
		color: var(--leaf-back-ink);
		border: 1px dashed var(--leaf-back-ink);
		padding: 1.25rem 2rem;
		box-shadow: none;
	}

	/* Svelte cannot see a sibling leaf rendered by another Leaf instance, so the earlier one is global. */
	:global(.leaf) + .leaf {
		margin-top: 0.875rem;
	}

	.ply-2 {
		--inset: calc(var(--board-pad) + 0.75rem);
		margin-inline: 0.75rem;
	}

	/* A tab spans exactly the leaf it indexes; the open one is wider and stands proud. */
	.tab {
		position: absolute;
		top: -1px;
		bottom: -1px;
		right: calc(-1 * (var(--inset) + var(--rail)) - 1px);
		width: calc(var(--rail) - 0.625rem);
		display: flex;
		align-items: center;
		justify-content: center;
		writing-mode: vertical-rl;
		text-decoration: none;
		font: 600 var(--step-0) / 1.1 var(--font-cond);
		letter-spacing: 0.02em;
		border-radius: 0 8px 8px 0;
		padding: 0.75rem 0.25rem;
		white-space: nowrap;
	}

	.tab[aria-current='true'] {
		width: var(--rail);
		right: calc(-1 * (var(--inset) + var(--rail)) - 1px - 0.625rem);
	}

	/* The ring alone measures near 1:1 against a board hue; the acetate halo fills the offset gap so
	   the ring always meets acetate (UI-SPEC measured contrast). */
	.tab:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
		box-shadow: 0 0 0 2px var(--acetate);
	}

	.count {
		font-family: var(--font-mono);
		font-weight: 500;
		margin-top: 0.5rem;
	}

	/* A status code is evidence, so it reads in Mono like a count. */
	.mono-label {
		font-family: var(--font-mono);
		font-weight: 500;
	}

	.hue-slate {
		background: var(--slate);
		color: var(--on-slate);
	}
	.hue-teal {
		background: var(--teal);
		color: var(--on-teal);
	}
	.hue-ultramarine {
		background: var(--ultramarine);
		color: var(--on-ultramarine);
	}
	.hue-yellow {
		background: var(--yellow);
		color: var(--on-yellow);
	}
	.hue-grass {
		background: var(--grass);
		color: var(--on-grass);
	}
	.hue-violet {
		background: var(--violet);
		color: var(--on-violet);
	}
	.hue-facedown {
		background: var(--leaf-back);
		color: var(--leaf-back-ink);
		outline: 1px dashed var(--leaf-back-ink);
		outline-offset: -4px;
	}

	@media (max-width: 720px) {
		.leaf,
		.ply-2 {
			margin-inline: 0;
			padding: 1.25rem 1rem;
		}

		.leaf.facedown {
			padding: 1rem;
		}

		:global(.leaf) + .leaf {
			margin-top: 2.5rem;
		}

		/* On a phone the fore edge becomes the top edge: each tab stands up above its leaf. */
		.tab,
		.tab[aria-current='true'] {
			top: -1.875rem;
			bottom: auto;
			left: 0.75rem;
			right: auto;
			width: auto;
			height: 1.875rem;
			writing-mode: horizontal-tb;
			border-radius: 8px 8px 0 0;
			padding: 0 0.875rem;
			gap: 0.5rem;
			font-size: var(--step--1);
		}

		.count {
			margin-top: 0;
		}
	}
</style>
