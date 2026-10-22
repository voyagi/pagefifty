<script lang="ts">
	import { linkTarget } from '$lib/ingest/link-target';
	import type { BuyerSearchView } from '$lib/tenders/tender-page';
	import ExternalIcon from './ExternalIcon.svelte';
	import Label from './Label.svelte';
	import Panel from './Panel.svelte';

	// What a web search found for the buyer when the snapshot was captured. Pages nobody checked: the
	// panel says so, sits apart from the tender's own panels, and nothing on it feeds a verdict.
	let { search }: { search: BuyerSearchView } = $props();

	// safeLink already kept only http and https; the rule runs again where the address becomes an
	// href, as DocumentsLink does, so a link never depends on where the page model came from.
	const results = $derived(
		'results' in search
			? search.results.map((result) => {
					const href = result.link.href === undefined ? undefined : linkTarget(result.link.href);
					return { title: result.title, href, host: href === undefined ? '' : new URL(href).host };
				})
			: []
	);
</script>

<Panel id="web-search" labelledby="web-search-title">
	<div class="grid">
		<h2 class="head" id="web-search-title">Earlier awards of this buyer</h2>
		<div class="body" data-web-search>
			<Label>Web search results, not checked</Label>
			<p class="note">
				Found by a web search for the buyer's name when this snapshot was captured. These results
				were not checked and do not change the verdict.
			</p>
			{#if results.length === 0}
				<p class="none">No earlier awards found by web search.</p>
			{:else}
				<ol class="results">
					{#each results as result, index (index)}
						<li>
							{#if result.href !== undefined}
								<a href={result.href} rel="external noreferrer"
									><span data-web-text>{result.title}</span><ExternalIcon /></a
								>
								<span class="host">{result.host}</span>
							{:else}
								<span class="title" data-web-text>{result.title}</span>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</div>
</Panel>

<style>
	/* Laid out as the documents panel: the heading takes up to 15rem and the body the rest, moving
	   under the heading when a long title leaves no room beside it. */
	.grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.75rem;
		align-items: start;
	}

	.head {
		flex: 0 1 15rem;
		min-width: 12rem;
		padding-right: 1.25rem;
		font-weight: 700;
		font-size: var(--step-0);
		line-height: 1.2;
	}

	.body {
		flex: 1 1 0%;
		max-width: 72ch;
	}

	.note,
	.none {
		color: var(--ink-2);
	}

	.none {
		margin-top: 0.75rem;
		font-weight: 600;
		color: var(--ink);
	}

	.results {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}

	.results li {
		border-top: 1px solid var(--line);
		overflow-wrap: anywhere;
	}

	/* Inline-block with padding, like a source link, so a long title wraps with its icon at the end of
	   the last line while the target stays 44px tall. */
	.results a {
		display: inline-block;
		padding-block: 0.8125rem 0.25rem;
		min-height: 2.75rem;
	}

	.title {
		display: block;
		padding-block: 0.8125rem 0.25rem;
	}

	.host {
		display: block;
		padding-bottom: 0.625rem;
		font-size: var(--step--1);
		line-height: 1.3;
		color: var(--ink-2);
	}

	@media (max-width: 45em) {
		.head,
		.body {
			flex-basis: 100%;
			min-width: 0;
		}
	}
</style>
