<script lang="ts">
	import type { TextRun } from '$lib/tenders/display-text';

	// A buyer's words drawn by their runs (display-text.ts). Every character is in the document as
	// published; a hidden run is kept in the text and only not drawn, and a kept line or paragraph
	// adds a break element, which holds no text.
	let { runs }: { runs: readonly TextRun[] } = $props();
</script>

{#each runs as run (run.start)}{#if run.kind === 'hidden'}<span class="unbroken">{run.text}</span
		>{:else if run.kind === 'line'}{run.text}<br />{:else if run.kind === 'paragraph'}{run.text}<br
		/><br />{:else}{run.text}{/if}{/each}

<style>
	.unbroken {
		display: none;
	}
</style>
