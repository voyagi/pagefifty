<script lang="ts">
	import { resolve } from '$app/paths';
	import { isActive, toSearch, type FilterState } from '$lib/core/filters';
	import Button from './Button.svelte';
	import CheckChip from './CheckChip.svelte';
	import Field from './Field.svelte';

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
	const DATES = [
		{ id: 'filter-from', name: 'from', label: 'Deadline on or after' },
		{ id: 'filter-to', name: 'to', label: 'Deadline on or before' }
	] as const;

	const countries = $derived(new Set<string>(state.countries));
	const groups = $derived(new Set<string>(state.cpv));
	// The router keeps this form across a filter navigation, and Svelte writes a field only when its
	// value changes, so a chip ticked or a date typed but never applied would survive Clear filters
	// and show a filter the list does not apply. The form is drawn afresh whenever the applied
	// filters change, and an unapplied change stays while they do not.
	const applied = $derived(toSearch(state));
</script>

<!-- A plain GET form: the filters live only in the address, so the page works without scripts and
     a filtered list can be shared by its link (D-10). -->
{#key applied}
	<form
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
							value={state[date.name] ?? ''}
							aria-describedby="filter-days"
						/>
					{/snippet}
				</Field>
			{/each}
			<p class="hint" id="filter-days">Whole days in Central European Time.</p>
		</div>

		<div class="actions">
			<Button type="submit">Apply filters</Button>
			{#if isActive(state)}
				<Button variant="secondary" href={basePath}>Clear filters</Button>
			{/if}
		</div>
	</form>
{/key}

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

	legend {
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

	@media (max-width: 45em) {
		.dates {
			grid-template-columns: minmax(0, 1fr);
		}

		.actions {
			margin-bottom: 0;
		}
	}
</style>
