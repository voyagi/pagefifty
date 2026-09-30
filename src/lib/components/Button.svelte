<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import type { Snippet } from 'svelte';

	// With `pick` the button is a label wrapping a visually hidden file input: the native control
	// keeps its keyboard and screen reader behaviour, and the label carries the look and the focus.
	let {
		variant = 'primary',
		href,
		type = 'button',
		onclick,
		pick,
		accept,
		children
	}: {
		variant?: 'primary' | 'secondary';
		href?: Pathname;
		type?: 'button' | 'submit';
		onclick?: () => void;
		pick?: (file: File) => void;
		accept?: string;
		children: Snippet;
	} = $props();

	// The input is emptied after each pick, so choosing the same file again still counts as a change.
	function picked(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		input.value = '';
		if (file) pick?.(file);
	}
</script>

{#if href !== undefined}
	<a class="btn {variant}" href={resolve(href)}>{@render children()}</a>
{:else if pick !== undefined}
	<label class="btn {variant} file">
		<input class="visually-hidden" type="file" {accept} onchange={picked} />
		{@render children()}
	</label>
{:else}
	<button class="btn {variant}" {type} {onclick}>{@render children()}</button>
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

	.file:focus-within {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	.btn :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: none;
	}
</style>
