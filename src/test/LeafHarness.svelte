<script lang="ts">
	import Leaf from '$lib/components/Leaf.svelte';

	let { open = false, count }: { open?: boolean; count?: number } = $props();
</script>

<Leaf id="open-group" tab="Open" hue="slate" labelledby="open-title" {open} {count}>
	{#snippet children(tab)}
		<h2 id="open-title">Open IT tenders</h2>
		{@render tab()}
		<p>After the tab.</p>
	{/snippet}
</Leaf>
