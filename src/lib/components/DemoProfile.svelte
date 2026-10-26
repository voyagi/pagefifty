<script lang="ts">
	import { formatDay } from '$lib/core/deadline';
	import { EU_EEA_COUNTRIES, EU_LANGUAGES, type CodeName } from '$lib/profile/codes';
	import { DEMO_FIRM_NAME, DEMO_PROFILE } from '$lib/profile/demo-firm';
	import { averageTurnover } from '$lib/profile/derive';
	import { wholeEuros as euros } from '$lib/profile/euros';
	import Button from './Button.svelte';
	import Facts from './Facts.svelte';
	import ProfilePanel from './ProfilePanel.svelte';

	// The demo firm read-only: facts where the own form has fields, never disabled inputs. It shows
	// the years the demo holds, not the years the form would ask for, so it stays whole after 2026.
	let { onback }: { onback: () => void } = $props();

	interface Fact {
		term: string;
		detail: string;
	}

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

<ProfilePanel panel="firm">
	{#snippet margin()}
		<Facts head="Invented figures">
			<p>Nothing on this page is stored. Your own profile stays in this browser as it was.</p>
		</Facts>
	{/snippet}
	<!-- The firm's name is the heading; the tag after it says whose figures these are. -->
	<div class="head">
		<h1 class="title" id="profile-title">{DEMO_FIRM_NAME}</h1>
		<p class="tag">Demo firm</p>
	</div>
	<p class="gloss">
		A demo firm with invented figures, for trying the pages. Your own profile is kept as it was.
	</p>
	<div class="actions">
		<Button onclick={onback}>Back to your own profile</Button>
	</div>
</ProfilePanel>

<ProfilePanel panel="turnover">{@render facts(turnover)}</ProfilePanel>

<ProfilePanel panel="people">{@render facts(people)}</ProfilePanel>

<ProfilePanel panel="certificates">{@render facts(certificates)}</ProfilePanel>

<ProfilePanel panel="countries">{@render facts(countries)}</ProfilePanel>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}

	.head .title {
		min-width: 0;
	}

	/* The quiet outlined tag the record's reading status wears: it names the mode, it is no
	   verdict and no control. */
	.tag {
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		padding: 0.125rem 0.5625rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r-sm);
		font-weight: 500;
		font-size: 0.78125rem;
		line-height: 1.2;
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
