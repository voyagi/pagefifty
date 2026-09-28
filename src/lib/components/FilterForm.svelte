<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { isActive, type FilterState } from '$lib/core/filters';
	import Button from './Button.svelte';
	import CheckChip from './CheckChip.svelte';

	let { state, basePath }: { state: FilterState; basePath: '/tenders' | '/example' } = $props();

	const COUNTRIES = [
		{ value: 'NL', label: 'Netherlands' },
		{ value: 'BE', label: 'Belgium' },
		{ value: 'DE', label: 'Germany' }
	] as const;
	const WORK = [
		{ value: '72', label: 'IT services' },
		{ value: '48', label: 'Software packages' }
	] as const;

	// /example has no route until a later plan, so Pathname does not list it yet.
	const listPath = $derived(basePath as Pathname);
	const countries = $derived(new Set<string>(state.countries));
	const groups = $derived(new Set<string>(state.cpv));
</script>

<!-- A plain GET form: the filters live only in the address, so the page works without scripts and
     a filtered list can be shared by its link (D-10). -->
<form
	class="filters"
	method="get"
	action={resolve(listPath)}
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

	<div class="dates">
		<div class="field">
			<label for="filter-from">Deadline on or after</label>
			<input
				id="filter-from"
				type="date"
				name="from"
				value={state.from ?? ''}
				aria-describedby="filter-days"
			/>
		</div>
		<div class="field">
			<label for="filter-to">Deadline on or before</label>
			<input
				id="filter-to"
				type="date"
				name="to"
				value={state.to ?? ''}
				aria-describedby="filter-days"
			/>
		</div>
		<p class="hint" id="filter-days">Whole days in Central European Time.</p>
	</div>

	<div class="actions">
		<Button type="submit">Apply filters</Button>
		{#if isActive(state)}
			<Button variant="secondary" href={listPath}>Clear filters</Button>
		{/if}
	</div>
</form>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1rem 1.5rem;
		margin-bottom: 1.5rem;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	legend,
	label {
		padding: 0;
		font-weight: 500;
		font-size: var(--step--1);
	}

	legend {
		margin-bottom: 0.5rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.dates {
		display: grid;
		grid-template-columns: repeat(2, minmax(10rem, 1fr));
		gap: 0.35rem 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	input {
		min-height: 44px;
		padding: 0 0.75rem;
		font: 500 var(--step-0) / 1.2 var(--font-mono);
		color: var(--ink);
		background: var(--acetate);
		border: 1px solid var(--ink-3);
		border-radius: 3px;
		caret-color: var(--ink);
	}

	input:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 0;
		border-color: var(--ink);
	}

	.hint {
		grid-column: 1 / -1;
		font-size: var(--step--1);
		color: var(--ink-3);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		/* Lifted by the shared hint's line and gap, so the buttons sit level with the date inputs. */
		margin-bottom: calc(var(--step--1) * 1.5 + 0.35rem);
	}

	@media (max-width: 720px) {
		.dates {
			grid-template-columns: minmax(0, 1fr);
		}

		.actions {
			margin-bottom: 0;
		}
	}
</style>
