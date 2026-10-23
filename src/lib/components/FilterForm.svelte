<script lang="ts">
	import { resolve } from '$app/paths';
	import { isActive, toSearch, type FilterState } from '$lib/core/filters';
	import { filterSummary } from '$lib/tenders/list';
	import Button from './Button.svelte';
	import CheckChip from './CheckChip.svelte';
	import Field from './Field.svelte';
	import Icon from './Icon.svelte';

	// Read as filters here, since a local named state would shadow the $state rune.
	let { state: filters, basePath }: { state: FilterState; basePath: '/tenders' | '/example' } =
		$props();

	const COUNTRIES = [
		{ value: 'NL', label: 'Netherlands' },
		{ value: 'BE', label: 'Belgium' },
		{ value: 'DE', label: 'Germany' }
	] as const;
	const WORK = [
		{ value: '72', label: 'IT services' },
		{ value: '48', label: 'Software packages' }
	] as const;
	const DATES = [
		{ id: 'filter-from', name: 'from', label: 'Deadline on or after' },
		{ id: 'filter-to', name: 'to', label: 'Deadline on or before' }
	] as const;

	const countries = $derived(new Set<string>(filters.countries));
	const groups = $derived(new Set<string>(filters.cpv));
	// The router keeps this form across a filter navigation, and Svelte writes a field only when its
	// value changes, so a chip ticked or a date typed but never applied would survive Clear filters
	// and show a filter the list does not apply. The form is drawn afresh whenever the applied
	// filters change, and an unapplied change stays while they do not.
	const applied = $derived(toSearch(filters));

	// How many filters the list applies: each country, each type of work and each date.
	const active = $derived(
		filters.countries.length + filters.cpv.length + (filters.from ? 1 : 0) + (filters.to ? 1 : 0)
	);

	// On a phone the filters fold behind one button so the list starts on the first screen. The
	// panel is open for the filters it was opened on, so applying them folds it again.
	let openFor = $state<string | null>(null);
	const open = $derived(openFor === applied);
</script>

<div class="filter-shell" class:open>
	<div class="toggle-line">
		<button
			type="button"
			class="toggle"
			aria-expanded={open}
			aria-controls="filter-panel"
			onclick={() => (openFor = open ? null : applied)}
			><Icon name="chev" /><span>Filters (<span class="mono">{active}</span>)</span></button
		>
		<!-- The applied filters stay in view while the panel is folded. -->
		{#if active > 0}<p class="applied">{filterSummary(filters)}</p>{/if}
	</div>

	<!-- A plain GET form: the filters live only in the address, so the page works without scripts
	     and a filtered list can be shared by its link (D-10). -->
	{#key applied}
		<form
			id="filter-panel"
			class="filters"
			method="get"
			action={resolve(basePath)}
			role="search"
			aria-label="Filter tenders"
		>
			<fieldset>
				<legend>Country</legend>
				<div class="chips">
					{#each COUNTRIES as country (country.value)}
						<CheckChip
							name="country"
							value={country.value}
							label={country.label}
							code={country.value}
							codeHidden
							checked={countries.has(country.value)}
						/>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Type of work</legend>
				<div class="chips">
					{#each WORK as group (group.value)}
						<CheckChip
							name="cpv"
							value={group.value}
							label={group.label}
							code={group.value}
							checked={groups.has(group.value)}
						/>
					{/each}
				</div>
			</fieldset>

			<!-- Both dates share one hint, so each input points at it rather than at a hint of its own. -->
			<div class="dates">
				{#each DATES as date (date.name)}
					<Field id={date.id} label={date.label}>
						{#snippet control()}
							<input
								id={date.id}
								type="date"
								name={date.name}
								value={filters[date.name] ?? ''}
								aria-describedby="filter-days"
							/>
						{/snippet}
					</Field>
				{/each}
				<p class="hint" id="filter-days">Whole days in Central European Time.</p>
			</div>

			<div class="actions">
				<Button type="submit">Apply filters</Button>
				{#if isActive(filters)}
					<Button variant="secondary" href={basePath}>Clear filters</Button>
				{/if}
			</div>
		</form>
	{/key}

	<!-- Without scripts the button cannot unfold the panel, so a phone shows the filters open. -->
	<noscript>
		<style>
			.filter-shell .toggle-line {
				display: none !important;
			}
			.filter-shell .filters {
				display: flex !important;
			}
		</style>
	</noscript>
</div>

<style>
	/* One row on a wide screen: each group keeps its controls together, labelled above them, and the
	   row wraps between groups only when it must. */
	.filters {
		display: flex;
		flex: 1 1 auto;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem 1rem;
		min-width: 0;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	/* Set like the date fields' labels beside them, so the row's labels read as one set. */
	legend {
		margin-bottom: 0.35rem;
		padding: 0;
		font-weight: 500;
		font-size: var(--step--1);
		line-height: 1.3;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	/* Compact chips and dates, so the whole set fits one row above the list. */
	.chips :global(.chip) {
		gap: 0.375rem;
		min-height: 36px;
		padding: 0 0.625rem;
	}

	.dates {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, 8.25rem);
		gap: 0.35rem 0.5rem;
	}

	.dates :global(input) {
		min-height: 36px;
		padding: 0 0.5rem;
		font-size: 0.875rem;
	}

	/* The shared hint shows under the dates while one of them is in use, over the list rather than
	   pushing it down; a screen reader hears it on each date through aria-describedby. */
	.hint {
		position: absolute;
		top: calc(100% + 0.25rem);
		left: 0;
		z-index: 1;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r-sm);
		background: var(--bg);
		font-size: var(--step--1);
		color: var(--ink-2);
		white-space: nowrap;
		clip-path: inset(50%);
	}

	.dates:focus-within .hint,
	.dates:hover .hint {
		clip-path: none;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.actions :global(.btn) {
		min-height: 36px;
	}

	/* Clearing is the quiet action beside Apply: a link's weight, a button's target. */
	.actions :global(a.btn.secondary) {
		padding-inline: 0.5rem;
		border-color: transparent;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	.toggle-line {
		display: none;
	}

	/* A phone folds the filters behind one button that counts them, and keeps the applied ones in
	   view beside it. */
	@media (max-width: 40em) {
		.toggle-line {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.25rem 0.75rem;
		}

		.toggle {
			display: inline-flex;
			align-items: center;
			gap: 0.375rem;
			min-height: 44px;
			padding: 0 0.875rem;
			border: 1px solid var(--line-2);
			border-radius: var(--r);
			background: var(--bg);
			color: var(--ink);
			font: 600 var(--step-0) / 1.2 var(--font);
			cursor: pointer;
		}

		.toggle :global(.icon) {
			transition: transform var(--quick) ease-out;
		}

		.open .toggle :global(.icon) {
			transform: rotate(180deg);
		}

		.applied {
			min-width: 0;
			font-size: var(--step--1);
			color: var(--ink-2);
		}

		.filters {
			display: none;
			margin-top: 0.75rem;
		}

		.open .filters {
			display: flex;
		}

		.dates {
			grid-template-columns: minmax(0, 1fr);
			width: 100%;
		}

		.hint {
			position: static;
			padding: 0;
			border: 0;
			white-space: normal;
			clip-path: none;
		}
	}
</style>
