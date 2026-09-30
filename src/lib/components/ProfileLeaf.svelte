<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Board } from './Binder.svelte';
	import Facts from './Facts.svelte';
	import Leaf from './Leaf.svelte';

	type LeafKey = 'firm' | 'turnover' | 'people' | 'certificates' | 'countries';

	// The five profile leaves as both modes draw them: the own form edits them, the demo shows them
	// read-only, in the same places.
	const LEAVES: Record<LeafKey, { tab: string; hue: Board; head: string; note: string }> = {
		firm: { tab: 'Firm', hue: 'ultramarine', head: '', note: '' },
		turnover: {
			tab: 'Turnover',
			hue: 'yellow',
			head: 'Turnover',
			note: 'Net yearly turnover in euros, from your filed accounts. Each year is the financial year that ends in it.'
		},
		people: { tab: 'People', hue: 'teal', head: 'People', note: 'People on your payroll today.' },
		certificates: {
			tab: 'Certificates',
			hue: 'grass',
			head: 'Certificates',
			note: 'Certificates your firm holds, with the date each one runs out.'
		},
		countries: {
			tab: 'Countries',
			hue: 'ultramarine',
			head: 'Countries and languages',
			note: 'Where the firm is registered, where it works and the languages the team works in.'
		}
	};

	// The Firm leaf brings its own margin and places its tab after its h1; every other leaf is
	// headed by its margin h2 with the tab right after it.
	let {
		leaf,
		margin,
		body
	}: {
		leaf: LeafKey;
		margin?: Snippet;
		body: Snippet<[Snippet]>;
	} = $props();

	const meta = $derived(LEAVES[leaf]);
	const firm = $derived(leaf === 'firm');
</script>

{#snippet none()}{/snippet}

<Leaf
	id={leaf}
	tab={meta.tab}
	hue={meta.hue}
	labelledby={firm ? 'profile-title' : `${leaf}-title`}
	ply={firm ? 1 : 2}
	open={firm}
>
	{#snippet children(tab)}
		<div class="grid">
			{#if firm}
				{@render margin?.()}
			{:else}
				<Facts head={meta.head} headingId="{leaf}-title"><p>{meta.note}</p></Facts>
				{@render tab()}
			{/if}
			<div class="main">
				{@render body(firm ? tab : none)}
			</div>
		</div>
	{/snippet}
</Leaf>

<style>
	/* The margin column, then four equal columns; the form grid inside drops to two, then one. */
	.grid {
		display: grid;
		grid-template-columns: minmax(12rem, 15rem) repeat(4, minmax(0, 1fr));
		column-gap: 1.75rem;
	}

	.main {
		grid-column: 2 / span 4;
		min-width: 0;
	}

	.main :global(.title) {
		font: 600 var(--step-4) / 1.1 var(--font-cond);
		letter-spacing: -0.015em;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	.main :global(.gloss) {
		margin-top: 0.35rem;
		max-width: 70ch;
		color: var(--ink-2);
	}

	.main :global(.form-grid) {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem 1.25rem;
		align-items: start;
	}

	.main :global(.chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	@media (max-width: 1100px) {
		.grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.main {
			grid-column: 1 / -1;
		}

		.main :global(.form-grid) {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 720px) {
		.grid,
		.main :global(.form-grid) {
			grid-template-columns: minmax(0, 1fr);
		}

		.main :global(.title) {
			font-size: var(--step-3);
		}
	}
</style>
