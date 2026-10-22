<script lang="ts">
	import type { Snippet } from 'svelte';
	import Facts from './Facts.svelte';
	import Panel from './Panel.svelte';
	import PanelGrid from './PanelGrid.svelte';

	type PanelKey = 'firm' | 'turnover' | 'people' | 'certificates' | 'countries';

	// The five profile panels as both modes draw them: the own form edits them, the demo shows them
	// read-only, in the same places.
	const PANELS: Record<PanelKey, { head: string; note: string }> = {
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
	// headed by its facts column's h2. The profile reads no tender, so its panels carry no legal
	// line of their own: the footer's line covers the page.
	let {
		panel,
		margin: firmMargin,
		children
	}: {
		panel: PanelKey;
		margin?: Snippet;
		children: Snippet;
	} = $props();

	const meta = $derived(PANELS[panel]);
	const firm = $derived(panel === 'firm');
</script>

<Panel id={panel} labelledby={firm ? 'profile-title' : `${panel}-title`}>
	<PanelGrid legal={false}>
		{#snippet margin()}
			{#if firm}
				{@render firmMargin?.()}
			{:else}
				<Facts head={meta.head} headingId="{panel}-title"><p>{meta.note}</p></Facts>
			{/if}
		{/snippet}
		<div class="body">
			{@render children()}
		</div>
	</PanelGrid>
</Panel>

<style>
	.body :global(.title) {
		font-weight: 750;
		font-size: var(--step-3);
		line-height: 1.15;
		letter-spacing: -0.03em;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	.body :global(.gloss) {
		margin-top: 0.5rem;
		max-width: 62ch;
		color: var(--ink-2);
		text-wrap: pretty;
	}

	/* Four fields to a row once the facts column stands beside the form, two below that, one on a
	   phone. */
	.body :global(.form-grid) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem 1.25rem;
		align-items: start;
	}

	.body :global(.chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	@media (min-width: 68.75em) {
		.body :global(.form-grid) {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	@media (max-width: 45em) {
		.body :global(.form-grid) {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
