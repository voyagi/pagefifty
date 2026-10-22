<script lang="ts">
	import { resolve } from '$app/paths';
	import type { LotVerdictView } from '$lib/tenders/verdict-view';
	import DocumentsLink from './DocumentsLink.svelte';
	import Icon from './Icon.svelte';
	import VerdictHead from './VerdictHead.svelte';

	// Every word drawn from the verdict sits inside the one data-verdict region, so the no-verdict
	// property can tell this lot's verdict from anything else on the page.
	let { view, compared }: { view: LotVerdictView; compared: string } = $props();
</script>

<section class="lot-verdict" data-verdict aria-label="Verdict for this lot">
	<VerdictHead {view} />
	<div class="body">
		<p class="gloss">{view.gloss}</p>
		<p class="reason">{view.reason}</p>
		{#if view.shortfalls.length > 0}
			<ul class="shortfalls" aria-label="Criteria the firm does not meet on its own">
				{#each view.shortfalls as shortfall (shortfall.position)}
					<li class="shortfall">
						<Icon name="short" />
						<span class="what"
							><strong>Short on its own:</strong>
							{shortfall.label}{#if shortfall.floor !== null}, floor
								<span class="mono">{shortfall.floor}</span>{/if}</span
						>
						<span class="ref">Criterion {shortfall.position} of {shortfall.of}</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if view.article63 !== null}
			<p class="article">{view.article63}</p>
		{/if}
		{#if view.link?.kind === 'profile'}
			<p class="link"><a href={resolve('/profile')}>Set up a firm profile</a></p>
		{:else if view.link?.kind === 'documents'}
			<p class="link"><DocumentsLink documents={view.link.documents} /></p>
		{/if}
		<p class="compared">{compared}</p>
		<p class="decided">{view.decidedBy}</p>
	</div>
</section>

<style>
	.lot-verdict {
		margin: 1.25rem 0 0;
	}

	.body {
		max-width: 62ch;
		padding-top: 0.875rem;
	}

	.gloss {
		font-weight: 600;
		color: var(--ink);
	}

	.reason,
	.article {
		margin-top: 0.375rem;
		font-size: var(--step-1);
		line-height: 1.45;
		text-wrap: pretty;
		color: var(--ink);
	}

	.article {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--line);
	}

	.shortfalls {
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--line);
	}

	/* Each criterion missed on its own is a row: what and its floor, then where it sits. */
	.shortfall {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}

	.shortfall :global(.icon) {
		align-self: center;
	}

	.what {
		flex: 1 1 14rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.what strong {
		font-weight: 650;
	}

	.ref {
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	/* A link standing alone on its line gets the full target height. */
	.link {
		margin-top: 0.25rem;
	}

	.link :global(a) {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}

	.compared,
	.decided {
		margin-top: 0.375rem;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.decided {
		margin-top: 0.125rem;
	}
</style>
