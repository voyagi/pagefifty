<script lang="ts">
	import type { RefusalText } from '$lib/profile/copy';

	// File names and found values come from the chosen file, so they render as text only and may
	// break anywhere: a 200-character name must not push the panel sideways on a phone.
	let { text }: { text: RefusalText } = $props();
</script>

<div class="error-block" role="alert">
	<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
		<path d="M8 1.5 15 14H1L8 1.5Z" />
		<path d="M8 6v3.5M8 11.5v.5" />
	</svg>
	<div class="body">
		{#if text.fields.length === 0}
			<p>{text.lead} {text.closing}</p>
		{:else}
			<p>{text.lead}</p>
			<ul>
				{#each text.fields as line, index (index)}
					<li>{line}</li>
				{/each}
			</ul>
			<p>{text.closing}</p>
		{/if}
	</div>
</div>

<style>
	/* The field error pattern at block size: shape and weight, never colour. The tint is a solid
	   mix of ink into the page colour, not a see-through fill. */
	.error-block {
		display: flex;
		gap: 0.625rem;
		align-items: flex-start;
		max-width: 70ch;
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		border: 2px dashed var(--ink);
		border-radius: 3px;
		background: color-mix(in srgb, var(--ink) 6%, var(--bg));
		color: var(--ink);
		font-size: var(--step--1);
		font-weight: 600;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}

	svg {
		flex: none;
		width: 1rem;
		height: 1rem;
		margin-top: 0.1rem;
	}

	.body {
		min-width: 0;
	}

	ul {
		margin: 0.4rem 0;
		padding-left: 1.25rem;
		font-weight: 500;
	}

	li + li {
		margin-top: 0.2rem;
	}
</style>
