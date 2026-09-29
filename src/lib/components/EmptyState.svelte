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
	.empty {
		padding-block: 1.5rem;
		border-top: 1px solid var(--acetate-edge);
	}

	h2 {
		font: 600 var(--step-0) / 1.25 var(--font-cond);
		letter-spacing: 0.01em;
	}

	p {
		max-width: 70ch;
		margin-top: 1rem;
		color: var(--ink-2);
		text-wrap: pretty;
	}

	.actions {
		margin-top: 1.5rem;
	}
</style>
