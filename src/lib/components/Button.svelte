<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import type { Snippet } from 'svelte';

	// With `pick` the button is a label wrapping a visually hidden file input: the native control
	// keeps its keyboard and screen reader behaviour, and the label carries the look and the focus.
	// size 'lg' is for the one call to action that leads a page.
	let {
		variant = 'primary',
		size,
		href,
		type = 'button',
		onclick,
		pick,
		accept,
		children
	}: {
		variant?: 'primary' | 'secondary';
		size?: 'lg';
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
	<a class="btn {variant}" class:lg={size === 'lg'} href={resolve(href)}>{@render children()}</a>
{:else if pick !== undefined}
	<label class="btn {variant} file" class:lg={size === 'lg'}>
		<input class="visually-hidden" type="file" {accept} onchange={picked} />
		{@render children()}
	</label>
{:else}
	<button class="btn {variant}" class:lg={size === 'lg'} {type} {onclick}
		>{@render children()}</button
	>
{/if}

<style>
	/* Colour goes on the primary only; every other button is a plain outlined box. */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 38px;
		padding: 0.375rem 1rem;
		font: 600 var(--step-0) / 1.2 var(--font);
		border-radius: var(--r);
		border: 1px solid var(--line-2);
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--quick) ease-out,
			border-color var(--quick) ease-out;
	}

	.lg {
		min-height: 44px;
		padding: 0.5rem 1.25rem;
	}

	.primary {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--brand-ink);
	}

	.primary:hover {
		background: var(--brand-hover);
		border-color: var(--brand-hover);
	}

	/* A solid page fill, never transparent, so a button reads the same on any panel. */
	.secondary {
		background: var(--bg);
		color: var(--ink);
	}

	.secondary:hover {
		background: var(--bg-2);
		border-color: var(--ink-2);
	}

	.file:focus-within {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.btn :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: none;
	}
</style>
