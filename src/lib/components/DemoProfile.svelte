<script lang="ts">
	import { formatDay } from '$lib/core/deadline';
	import { EU_EEA_COUNTRIES, EU_LANGUAGES, type CodeName } from '$lib/profile/codes';
	import { DEMO_FIRM_NAME, DEMO_PROFILE } from '$lib/profile/demo-firm';
	import { averageTurnover } from '$lib/profile/derive';
	import Button from './Button.svelte';
	import Facts from './Facts.svelte';
	import ProfileLeaf from './ProfileLeaf.svelte';

	// The demo firm read-only: facts where the own form has fields, never disabled inputs. It shows
	// the years the demo holds, not the years the form would ask for, so it stays whole after 2026.
	let { onback }: { onback: () => void } = $props();

	interface Fact {
		term: string;
		detail: string;
	}

	const euros = (value: number) => `EUR ${Math.round(value).toLocaleString('en-GB')}`;
	const namesOf = (codes: readonly string[], list: readonly CodeName[]) =>
		codes.map((code) => list.find((entry) => entry.code === code)?.name ?? code).join(', ');

	const rows = [...DEMO_PROFILE.turnover].sort((a, b) => a.year - b.year);
	const average = averageTurnover(
		DEMO_PROFILE,
		rows.map((row) => row.year)
	);

	const turnover: Fact[] = [
		...rows.map((row) => ({
			term: String(row.year),
			detail: row.generalNet === undefined ? 'unknown' : euros(row.generalNet)
		})),
		{ term: 'Average', detail: average === undefined ? 'unknown' : euros(average) },
		{
			term: 'Completed financial years',
			detail: String(DEMO_PROFILE.completedFinancialYears ?? 'unknown')
		}
	];
	const people: Fact[] = [{ term: 'Total staff', detail: String(DEMO_PROFILE.staff.total) }];
	const certificates: Fact[] = DEMO_PROFILE.certificates.map((certificate) => ({
		term: certificate.standard,
		detail:
			certificate.validUntil === undefined
				? 'no date given'
				: `valid until ${formatDay(certificate.validUntil, 'UTC')}`
	}));
	const countries: Fact[] = [
		{
			term: 'Country of registration',
			detail: namesOf(
				DEMO_PROFILE.registration.country ? [DEMO_PROFILE.registration.country] : [],
				EU_EEA_COUNTRIES
			)
		},
		{ term: 'Countries you work in', detail: namesOf(DEMO_PROFILE.countries, EU_EEA_COUNTRIES) },
		{ term: 'Languages your team works in', detail: namesOf(DEMO_PROFILE.languages, EU_LANGUAGES) }
	];
</script>

{#snippet facts(list: Fact[])}
	<dl class="form-grid facts">
		{#each list as fact (fact.term)}
			<div>
				<dt>{fact.term}</dt>
				<dd class="mono">{fact.detail}</dd>
			</div>
		{/each}
	</dl>
{/snippet}

<ProfileLeaf leaf="firm">
	{#snippet margin()}
		<Facts head="Invented figures">
			<p>Nothing on this page is stored. Your own profile stays in this browser as it was.</p>
		</Facts>
	{/snippet}
	{#snippet body()}
		<p class="label">Demo firm</p>
		<h1 class="title" id="profile-title">{DEMO_FIRM_NAME}</h1>
		<p class="gloss">
			A demo firm with invented figures, for trying the pages. Your own profile is kept as it was.
		</p>
		<div class="actions">
			<Button onclick={onback}>Back to your own profile</Button>
		</div>
	{/snippet}
</ProfileLeaf>

<ProfileLeaf leaf="turnover">
	{#snippet body()}{@render facts(turnover)}{/snippet}
</ProfileLeaf>

<ProfileLeaf leaf="people">
	{#snippet body()}{@render facts(people)}{/snippet}
</ProfileLeaf>

<ProfileLeaf leaf="certificates">
	{#snippet body()}{@render facts(certificates)}{/snippet}
</ProfileLeaf>

<ProfileLeaf leaf="countries">
	{#snippet body()}{@render facts(countries)}{/snippet}
</ProfileLeaf>

<style>
	.label {
		display: block;
		margin-bottom: 0.4rem;
		font-weight: 600;
		font-size: var(--step--1);
		line-height: 1.3;
		color: var(--ink-2);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.facts {
		margin: 0;
	}

	dt {
		font-size: var(--step--1);
		font-weight: 500;
		color: var(--ink-2);
	}

	dd {
		margin: 0.35rem 0 0;
		color: var(--ink);
		font-weight: 500;
		overflow-wrap: anywhere;
	}
</style>
