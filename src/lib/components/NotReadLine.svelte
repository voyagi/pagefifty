<script lang="ts">
	// What was not read and why, for a lot or for one requirement in a clause.
	let { line }: { line: string } = $props();
</script>

<p class="not-read">{line}</p>

<style>
	/* Dashed is the one mark for "not read". */
	.not-read {
		max-width: 70ch;
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		border: 1px dashed var(--line-2);
		border-radius: var(--r);
		background: var(--bg);
		font-size: var(--step--1);
		color: var(--ink-2);
	}
</style>
