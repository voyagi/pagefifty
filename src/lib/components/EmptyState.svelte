<script lang="ts">
	import type { Pathname } from '$app/types';
	import Button from './Button.svelte';

	let { heading, body, clearHref }: { heading: string; body: string; clearHref: Pathname } =
		$props();
</script>

<div class="empty">
	<h2>{heading}</h2>
	<p>{body}</p>
	<div class="actions">
		<Button variant="secondary" href={clearHref}>Clear filters</Button>
	</div>
</div>

<style>
	/* A named state in its own box on the page, so an empty list never reads as a page that failed
	   to load. */
	.empty {
		padding: 1.25rem 1.5rem 1.5rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--bg);
	}

	h2 {
		font: 700 var(--step-1) / 1.3 var(--font);
		letter-spacing: -0.01em;
	}

	p {
		max-width: 62ch;
		margin-top: 0.5rem;
		color: var(--ink-2);
		text-wrap: pretty;
	}

	.actions {
		margin-top: 1.25rem;
	}
</style>
