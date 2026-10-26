<script lang="ts">
	import type { LotVerdictView } from '$lib/tenders/verdict-view';
	import Icon from './Icon.svelte';

	// The verdict as a tag beside what to check next, on one tinted row between hairlines. It is
	// drawn inside its caller's data-verdict region, the only place a verdict word may stand.
	let { view }: { view: Pick<LotVerdictView, 'label' | 'mark' | 'next'> } = $props();
</script>

<div class="verdict-head">
	<p class="tag" data-verdict-word><Icon name={view.mark} />{view.label}</p>
	<p class="next"><strong>Next:</strong> {view.next}</p>
</div>

<style>
	.verdict-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem 0.875rem;
		padding: 0.875rem 1rem;
		border-block: 1px solid var(--line);
		background: var(--bg-2);
	}

	/* The loudest thing on the record, in reversed ink so it reads before any colour does. */
	.tag {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.4375rem;
		min-height: 30px;
		padding: 0 0.8125rem 0 0.5625rem;
		border-radius: var(--r-pill);
		background: var(--ink);
		color: var(--bg);
		font-weight: 700;
		font-size: 0.84375rem;
		white-space: nowrap;
	}

	.next {
		flex: 1 1 16rem;
		min-width: 0;
		font-size: 0.875rem;
		line-height: 1.45;
		text-wrap: pretty;
	}

	.next strong {
		font-weight: 650;
	}
</style>
