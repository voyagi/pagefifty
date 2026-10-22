<script lang="ts">
	import type { Snippet } from 'svelte';
	import Facts from './Facts.svelte';
	import Panel from './Panel.svelte';

	type LeafKey = 'firm' | 'turnover' | 'people' | 'certificates' | 'countries';

	// The five profile panels as both modes draw them: the own form edits them, the demo shows them
	// read-only, in the same places.
	const LEAVES: Record<LeafKey, { head: string; note: string }> = {
		firm: { head: '', note: '' },
		turnover: {
			head: 'Turnover',
			note: 'Net yearly turnover in euros, from your filed accounts. Each year is the financial year that ends in it.'
		},
		people: { head: 'People', note: 'People on your payroll today.' },
		certificates: {
			head: 'Certificates',
			note: 'Certificates your firm holds, with the date each one runs out.'
		},
		countries: {
			head: 'Countries and languages',
			note: 'Where the firm is registered, where it works and the languages the team works in.'
		}
	};

	// The Firm panel brings its own facts column and is headed by its h1; every other panel is
	// headed by its facts column's h2.
	let {
		leaf,
		margin,
		body
	}: {
		leaf: LeafKey;
		margin?: Snippet;
		body: Snippet;
	} = $props();

	const meta = $derived(LEAVES[leaf]);
	const firm = $derived(leaf === 'firm');
</script>

<Panel id={leaf} labelledby={firm ? 'profile-title' : `${leaf}-title`}>
	<div class="grid">
		{#if firm}
			{@render margin?.()}
		{:else}
			<Facts head={meta.head} headingId="{leaf}-title"><p>{meta.note}</p></Facts>
		{/if}
		<div class="main">
			{@render body()}
		</div>
	</div>
</Panel>

<style>
	/* The facts column, then the form; the form grid inside drops to two columns, then one. */
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		column-gap: 2.5rem;
	}

	.main {
		min-width: 0;
	}

	.main :global(.title) {
		font-weight: 750;
		font-size: var(--step-3);
		line-height: 1.15;
		letter-spacing: -0.03em;
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
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem 1.25rem;
		align-items: start;
	}

	.main :global(.chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	@media (min-width: 68.75em) {
		.grid {
			grid-template-columns: 15rem minmax(0, 1fr);
		}

		.main :global(.form-grid) {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	@media (max-width: 45em) {
		.main :global(.form-grid) {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
