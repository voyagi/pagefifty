<script lang="ts">
	import type { ReadingStatus } from '$lib/core/reading';

	let { reading }: { reading: Pick<ReadingStatus, 'tag' | 'text' | 'reason'> } = $props();
</script>

<div class="vcell">
	<span class="vtag" class:facedown={reading.tag === 'criteria-in-documents'}>{reading.text}</span>
	<small>{reading.reason}</small>
</div>

<style>
	.vcell {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
		min-width: 15rem;
	}

	/* The dashed stroke means "not read or not settled" (DESIGN.md Shapes); the solid ink tag
	   belongs to a verdict, which phase 1 never shows. */
	.vtag {
		font: 700 var(--step--1) / 1 var(--font-cond);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.35rem 0.5rem;
		border-radius: 2px;
		border: 1px dashed var(--ink);
		background: var(--acetate);
		color: var(--ink);
		white-space: nowrap;
	}

	/* Face down, like a document leaf nobody has turned over yet. */
	.facedown {
		background: var(--leaf-back);
		color: var(--leaf-back-ink);
		border-color: var(--leaf-back-ink);
	}

	small {
		font-size: var(--step--1);
		line-height: 1.35;
		color: var(--ink-2);
		max-width: 44ch;
	}

	/* Follows TenderTable's switch to cards. */
	@media (max-width: 1340px) {
		.vcell {
			min-width: 0;
			margin-top: 0.5rem;
		}
	}
</style>
