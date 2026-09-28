<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import type { Snippet } from 'svelte';

	let {
		variant = 'primary',
		href,
		type = 'button',
		children
	}: {
		variant?: 'primary' | 'secondary';
		href?: Pathname;
		type?: 'button' | 'submit';
		children: Snippet;
	} = $props();
</script>

{#if href !== undefined}
	<a class="btn {variant}" href={resolve(href)}>{@render children()}</a>
{:else}
	<button class="btn {variant}" {type}>{@render children()}</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		padding: 0 1.125rem;
		font: 600 var(--step-0) / 1 var(--font-sans);
		border-radius: 3px;
		border: 1px solid var(--ink);
		text-decoration: none;
		cursor: pointer;
		transition: transform var(--hinge) steps(2, end);
	}

	.primary {
		background: var(--ink);
		color: var(--acetate);
	}

	/* Solid acetate rather than the mockup's transparent fill: buttons only ever sit on a leaf. */
	.secondary {
		background: var(--acetate);
		color: var(--ink);
	}

	.btn:hover {
		transform: translateY(-1px);
	}

	.btn:active {
		transform: translateY(1px);
	}
</style>
