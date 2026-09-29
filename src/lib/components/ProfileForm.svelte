<script lang="ts">
	import { untrack } from 'svelte';
	import { formatDay, usableTimeZone } from '$lib/core/deadline';
	import { EU_EEA_COUNTRIES, EU_LANGUAGES } from '$lib/profile/codes';
	import {
		clockTime,
		fieldErrorText,
		saveStatusText,
		type FieldError,
		type SaveStatus
	} from '$lib/profile/copy';
	import { averageTurnover, certificateStatus, turnoverYears } from '$lib/profile/derive';
	import { parseCount, type FieldResult } from '$lib/profile/fields';
	import { PROFILE_SCHEMA_VERSION, emptyProfile, type Profile } from '$lib/profile/schema';
	import type { ProfileStore } from '$lib/profile/store.svelte';
	import Button from './Button.svelte';
	import CheckChip from './CheckChip.svelte';
	import DateField from './DateField.svelte';
	import Facts from './Facts.svelte';
	import Field from './Field.svelte';
	import Leaf from './Leaf.svelte';
	import LoadingLines from './LoadingLines.svelte';
	import MoneyField from './MoneyField.svelte';
	import SelectField from './SelectField.svelte';
	import StatusLine from './StatusLine.svelte';
	import ToggleChip from './ToggleChip.svelte';

	// store is null until the page has read storage in the browser; until then every leaf shows its
	// loading lines, which is also all a server render ever draws.
	let {
		store,
		keptInMemory,
		clock = () => new Date()
	}: {
		store: ProfileStore | null;
		keptInMemory: boolean;
		clock?: () => Date;
	} = $props();

	const COMMON_CERTIFICATES = ['ISO 27001', 'ISO 9001', 'BSI C5', 'NEN 7510'];

	type FormEvent =
		| { kind: 'saved'; time: string }
		| { kind: 'removed'; name: string }
		| { kind: 'failed' }
		| { kind: 'refused' };

	type NumberKind = 'money' | 'staff' | 'years';

	// Drafts hold what is typed, errors what is wrong with it. Storage only ever gets a valid value,
	// so a field in error keeps its last valid value there until it is fixed.
	let drafts = $state<Record<string, string>>({});
	let errors = $state<Record<string, { label: string; error: FieldError }>>({});
	let lastEvent = $state<FormEvent | null>(null);
	let focusedKey: string | null = null;
	let adding = $state(false);
	let newName = $state('');
	let nameMissing = $state(false);

	const today = $derived(store ? clock() : null);
	const years = $derived(today ? turnoverYears(today) : null);
	const zone = $derived(
		store ? usableTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone) : 'UTC'
	);
	const profile = $derived(store?.stored?.profile ?? emptyProfile());
	const held = $derived(profile.certificates.map((certificate) => certificate.standard));
	const added = $derived(held.filter((standard) => !COMMON_CERTIFICATES.includes(standard)));
	const average = $derived(years ? averageTurnover(profile, years) : undefined);

	const turnoverKey = (year: number) => `turnover:${year}`;
	const certificateKey = (standard: string) => `certificate:${standard}`;
	const numberText = (value: number | undefined) => (value === undefined ? '' : String(value));
	const turnoverOf = (current: Profile, year: number) =>
		current.turnover.find((row) => row.year === year)?.generalNet;

	function storedDrafts(current: Profile): Record<string, string> {
		const next: Record<string, string> = {
			staff: numberText(current.staff.total),
			years: numberText(current.completedFinancialYears)
		};
		for (const year of years ?? []) next[turnoverKey(year)] = numberText(turnoverOf(current, year));
		for (const certificate of current.certificates) {
			next[certificateKey(certificate.standard)] = certificate.validUntil ?? '';
		}
		return next;
	}

	// Another tab's write shows in every field except one the user is typing in or has left in
	// error: that text is theirs until they finish it.
	function syncDrafts(keep: (key: string) => boolean) {
		const next = storedDrafts(store?.stored?.profile ?? emptyProfile());
		for (const [key, text] of Object.entries(drafts)) if (keep(key)) next[key] = text;
		drafts = next;
	}

	$effect(() => {
		if (!store) return;
		untrack(() => syncDrafts(() => false));
		const onStorage = () => syncDrafts((key) => key in errors || key === focusedKey);
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	});

	function setError(key: string, label: string, error: FieldError) {
		errors = { ...errors, [key]: { label, error } };
	}

	function clearError(key: string) {
		if (!(key in errors)) return;
		const rest = { ...errors };
		delete rest[key];
		errors = rest;
	}

	// Every change is one field set on the profile storage holds at this moment, never a snapshot of
	// this form, so a field another tab saved in the meantime is kept.
	function save(change: (current: Profile) => Profile, removed?: string) {
		if (!store) return;
		const now = clock();
		const result = store.updateProfile(change, now);
		if (result === 'saved') {
			lastEvent =
				removed === undefined
					? { kind: 'saved', time: clockTime(now, zone) }
					: { kind: 'removed', name: removed };
			store.requestPersistOnce(navigator);
		} else if (result === 'failed') {
			lastEvent = { kind: 'failed' };
		} else if (result === 'invalid') {
			lastEvent = { kind: 'refused' };
		}
	}

	function onNumber(
		key: string,
		label: string,
		kind: NumberKind,
		result: FieldResult,
		text: string,
		apply: (current: Profile, value: number | undefined) => Profile
	) {
		drafts[key] = text;
		if (!result.ok) {
			setError(key, label, { kind, reason: result.reason });
			return;
		}
		clearError(key);
		save((current) => apply(current, result.value));
	}

	// A row keeps its place; a year left with no figure and no business lines is dropped.
	function withTurnover(current: Profile, year: number, value: number | undefined): Profile {
		const row = current.turnover.find((entry) => entry.year === year);
		const next = { year, generalNet: value, specific: row?.specific ?? [] };
		const keep = value !== undefined || next.specific.length > 0;
		const rows = row
			? current.turnover.flatMap((entry) => (entry === row ? (keep ? [next] : []) : [entry]))
			: keep
				? [...current.turnover, next]
				: current.turnover;
		return { ...current, turnover: rows };
	}

	function toggleCertificate(standard: string) {
		if (held.includes(standard)) {
			clearError(certificateKey(standard));
			const rest = { ...drafts };
			delete rest[certificateKey(standard)];
			drafts = rest;
			save(
				(current) => ({
					...current,
					certificates: current.certificates.filter((entry) => entry.standard !== standard)
				}),
				COMMON_CERTIFICATES.includes(standard) ? undefined : standard
			);
			return;
		}
		save((current) =>
			current.certificates.some((entry) => entry.standard === standard)
				? current
				: { ...current, certificates: [...current.certificates, { standard }] }
		);
	}

	function setValidUntil(standard: string, value: string | undefined) {
		save((current) => ({
			...current,
			certificates: current.certificates.map((entry) => {
				if (entry.standard !== standard) return entry;
				const next = { ...entry };
				if (value === undefined) delete next.validUntil;
				else next.validUntil = value;
				return next;
			})
		}));
	}

	function addCertificate() {
		const name = newName.trim();
		if (name === '') {
			nameMissing = true;
			return;
		}
		nameMissing = false;
		newName = '';
		adding = false;
		if (!held.includes(name)) toggleCertificate(name);
	}

	function toggleCode(list: 'countries' | 'languages', target: EventTarget | null) {
		if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
		const { value: code, checked } = target;
		const next = (codes: string[]) => {
			const rest = codes.filter((entry) => entry !== code);
			return checked ? [...rest, code] : rest;
		};
		save((current) =>
			list === 'countries'
				? { ...current, countries: next(current.countries) }
				: { ...current, languages: next(current.languages) }
		);
	}

	function savedValue(key: string): string | undefined {
		const current = store?.stored?.profile;
		if (!current) return undefined;
		if (key === 'staff') return current.staff.total?.toString();
		if (key === 'years') return current.completedFinancialYears?.toString();
		const year = /^turnover:(\d+)$/.exec(key)?.[1];
		if (year !== undefined) return turnoverOf(current, Number(year))?.toString();
		const until = current.certificates.find(
			(entry) => certificateKey(entry.standard) === key
		)?.validUntil;
		return until === undefined ? undefined : formatDay(until, 'UTC');
	}

	function errorFor(key: string): string | undefined {
		const entry = errors[key];
		return entry ? fieldErrorText(entry.error, savedValue(key)) : undefined;
	}

	function certificateHint(standard: string): { text: string; strong: boolean } {
		const certificate = profile.certificates.find((entry) => entry.standard === standard);
		const status = certificate && today ? certificateStatus(certificate, today) : undefined;
		return status?.state === 'expired'
			? {
					text: `Expired on ${formatDay(status.on, 'UTC')}. It stays in your profile.`,
					strong: true
				}
			: { text: 'Leave empty if you do not know.', strong: false };
	}

	const isExpired = (standard: string) => certificateHint(standard).strong;

	const status = $derived.by((): SaveStatus => {
		const newer = store?.newerVersion;
		if (newer != null) return { kind: 'newer', version: newer, reads: PROFILE_SCHEMA_VERSION };
		const invalid = Object.values(errors).map((entry) => entry.label);
		if (invalid.length > 0) {
			const rest = keptInMemory ? 'memory' : store?.stored ? 'saved' : 'nothing';
			return { kind: 'not-saved', fields: invalid, rest };
		}
		if (lastEvent?.kind === 'failed' || lastEvent?.kind === 'refused') {
			return { kind: lastEvent.kind };
		}
		if (lastEvent?.kind === 'removed') return lastEvent;
		if (!store?.stored) return { kind: 'nothing', inMemory: keptInMemory };
		if (lastEvent?.kind === 'saved' && !keptInMemory) return lastEvent;
		return { kind: 'kept', inMemory: keptInMemory };
	});

	const exported = $derived(store?.stored?.lastExportedAt ?? null);
</script>

<Leaf id="firm" tab="Firm" hue="ultramarine" labelledby="profile-title" open>
	{#snippet children(tab)}
		<div class="grid">
			<Facts head="Kept in this browser">
				<p>
					Nothing here is sent to a server. This browser may delete it without asking, so export the
					file and keep it.
				</p>
				{#if store}
					<p class="exported">
						Last exported: {exported === null ? 'never' : formatDay(exported, zone)}
					</p>
				{/if}
			</Facts>
			<div class="main">
				<h1 class="title" id="profile-title">Your firm profile</h1>
				{@render tab()}
				{#if store && !store.stored}
					<p class="lede">
						Nothing saved yet. Fill in what you can prove with a document, or try the pages with the
						demo firm.
					</p>
				{:else}
					<p class="gloss">
						The figures Pagefifty will check each tender's criteria against. Fill in what you can
						prove with a document.
					</p>
				{/if}
				<noscript>
					<p class="noscript">
						The firm profile is kept in this browser and needs JavaScript to read and save it.
					</p>
				</noscript>
				{#if store}
					<StatusLine text={saveStatusText(status)} />
				{:else}
					<LoadingLines label="Reading the profile kept in this browser." />
				{/if}
			</div>
		</div>
	{/snippet}
</Leaf>

<Leaf id="turnover" tab="Turnover" hue="yellow" labelledby="turnover-title" ply={2}>
	{#snippet children(tab)}
		<div class="grid">
			<Facts head="Turnover" headingId="turnover-title">
				<p>
					Net yearly turnover in euros, from your filed accounts. Each year is the financial year
					that ends in it.
				</p>
			</Facts>
			{@render tab()}
			<div class="main">
				{#if store && years}
					<div class="form-grid">
						{#each years as year (year)}
							{@const key = turnoverKey(year)}
							<MoneyField
								id="turnover-{year}"
								label={String(year)}
								value={drafts[key] ?? ''}
								error={errorFor(key)}
								onchange={(result, text) =>
									onNumber(key, String(year), 'money', result, text, (current, value) =>
										withTurnover(current, year, value)
									)}
								onfocus={() => (focusedKey = key)}
								onblur={() => (focusedKey = null)}
							/>
						{/each}
						<Field
							id="turnover-average"
							label="Average"
							value={average === undefined ? '' : String(Math.round(average))}
							hint="Worked out once all three years are numbers"
							readonly
						/>
						<div class="row-start">
							<Field
								id="completed-years"
								label="Completed financial years"
								hint="Years with filed accounts, like 3."
								inputmode="numeric"
								value={drafts.years ?? ''}
								error={errorFor('years')}
								oninput={(text) =>
									onNumber(
										'years',
										'Completed financial years',
										'years',
										parseCount(text),
										text,
										(current, value) => ({ ...current, completedFinancialYears: value })
									)}
								onfocus={() => (focusedKey = 'years')}
								onblur={() => (focusedKey = null)}
							/>
						</div>
					</div>
				{:else}
					<LoadingLines />
				{/if}
			</div>
		</div>
	{/snippet}
</Leaf>

<Leaf id="people" tab="People" hue="teal" labelledby="people-title" ply={2}>
	{#snippet children(tab)}
		<div class="grid">
			<Facts head="People" headingId="people-title">
				<p>People on your payroll today.</p>
			</Facts>
			{@render tab()}
			<div class="main">
				{#if store}
					<div class="form-grid">
						<Field
							id="total-staff"
							label="Total staff"
							hint="Everyone on the payroll, like 19."
							inputmode="numeric"
							value={drafts.staff ?? ''}
							error={errorFor('staff')}
							oninput={(text) =>
								onNumber(
									'staff',
									'Total staff',
									'staff',
									parseCount(text),
									text,
									(current, value) => ({
										...current,
										staff: { ...current.staff, total: value }
									})
								)}
							onfocus={() => (focusedKey = 'staff')}
							onblur={() => (focusedKey = null)}
						/>
					</div>
				{:else}
					<LoadingLines />
				{/if}
			</div>
		</div>
	{/snippet}
</Leaf>

<Leaf id="certificates" tab="Certificates" hue="grass" labelledby="certificates-title" ply={2}>
	{#snippet children(tab)}
		<div class="grid">
			<Facts head="Certificates" headingId="certificates-title">
				<p>Certificates your firm holds, with the date each one runs out.</p>
			</Facts>
			{@render tab()}
			<div class="main">
				{#if store}
					<div class="chips" role="group" aria-label="Certificates held">
						{#each [...COMMON_CERTIFICATES, ...added] as standard (standard)}
							<ToggleChip
								label={standard}
								pressed={held.includes(standard)}
								dashed={held.includes(standard) && isExpired(standard)}
								onclick={() => toggleCertificate(standard)}
							/>
						{/each}
						<ToggleChip
							label="Add another"
							expanded={adding}
							controls="add-certificate"
							onclick={() => (adding = !adding)}
						/>
					</div>
					<div class="add" id="add-certificate" hidden={!adding}>
						<Field
							id="certificate-name"
							label="Certificate name"
							hint="Like ISO 22301."
							maxlength={80}
							bind:value={newName}
							error={nameMissing
								? fieldErrorText({ kind: 'certificate-name', reason: 'empty' })
								: undefined}
							oninput={() => (nameMissing = false)}
						/>
						<Button variant="secondary" onclick={addCertificate}>Add certificate</Button>
					</div>
					{#if profile.certificates.length > 0}
						<div class="form-grid dates">
							{#each profile.certificates as certificate, index (certificate.standard)}
								{@const key = certificateKey(certificate.standard)}
								{@const hint = certificateHint(certificate.standard)}
								<DateField
									id="certificate-until-{index}"
									label="{certificate.standard} valid until"
									hint={hint.text}
									value={drafts[key] ?? ''}
									error={errorFor(key)}
									onchange={(result, text) => {
										drafts[key] = text;
										if (!result.ok) {
											setError(key, `${certificate.standard} valid until`, {
												kind: 'certificate-date',
												reason: 'not-a-date'
											});
											return;
										}
										clearError(key);
										setValidUntil(certificate.standard, result.value);
									}}
									onfocus={() => (focusedKey = key)}
									onblur={() => (focusedKey = null)}
								/>
							{/each}
						</div>
					{/if}
				{:else}
					<LoadingLines />
				{/if}
			</div>
		</div>
	{/snippet}
</Leaf>

<Leaf id="countries" tab="Countries" hue="ultramarine" labelledby="countries-title" ply={2}>
	{#snippet children(tab)}
		<div class="grid">
			<Facts head="Countries and languages" headingId="countries-title">
				<p>Where the firm is registered, where it works and the languages the team works in.</p>
			</Facts>
			{@render tab()}
			<div class="main">
				{#if store}
					<div class="form-grid">
						<SelectField
							id="registration-country"
							label="Country of registration"
							placeholder="Choose a country"
							options={EU_EEA_COUNTRIES}
							value={profile.registration.country ?? ''}
							onchange={(code) =>
								save((current) => ({
									...current,
									registration: { ...current.registration, country: code || undefined }
								}))}
						/>
					</div>
					<fieldset onchange={(changed) => toggleCode('countries', changed.target)}>
						<legend>Countries you work in</legend>
						<div class="chips">
							{#each EU_EEA_COUNTRIES as country (country.code)}
								<CheckChip
									name="countries"
									value={country.code}
									label={country.name}
									checked={profile.countries.includes(country.code)}
								/>
							{/each}
						</div>
					</fieldset>
					<fieldset onchange={(changed) => toggleCode('languages', changed.target)}>
						<legend>Languages your team works in</legend>
						<div class="chips">
							{#each EU_LANGUAGES as language (language.code)}
								<CheckChip
									name="languages"
									value={language.code}
									label={language.name}
									checked={profile.languages.includes(language.code)}
								/>
							{/each}
						</div>
					</fieldset>
				{:else}
					<LoadingLines />
				{/if}
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

	.title {
		font: 600 var(--step-4) / 1.1 var(--font-cond);
		letter-spacing: -0.015em;
		text-wrap: balance;
	}

	.gloss {
		margin-top: 0.35rem;
		max-width: 70ch;
		color: var(--ink-2);
	}

	.lede {
		margin-top: 0.35rem;
		max-width: 52ch;
		font-size: var(--step-1);
		line-height: 1.45;
	}

	.noscript {
		margin-top: 1rem;
		font-weight: 600;
	}

	.exported {
		margin-top: 0.75rem;
		color: var(--ink);
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem 1.25rem;
		align-items: start;
	}

	.row-start {
		grid-column: 1;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem 1rem;
		margin-top: 1rem;
		max-width: 40rem;
	}

	.add[hidden] {
		display: none;
	}

	.add > :global(.field) {
		flex: 1 1 16rem;
	}

	/* The button sits level with the input, above the hint line. */
	.add > :global(.btn) {
		margin-bottom: calc(var(--step--1) * 1.35 + 0.35rem);
	}

	.dates {
		margin-top: 1.5rem;
	}

	fieldset {
		margin: 1.5rem 0 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	legend {
		padding: 0;
		margin-bottom: 0.5rem;
		font-weight: 500;
		font-size: var(--step--1);
	}

	@media (max-width: 1100px) {
		.grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.main {
			grid-column: 1 / -1;
		}

		.form-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 720px) {
		.grid,
		.form-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.title {
			font-size: var(--step-3);
		}

		.add > :global(.btn) {
			margin-bottom: 0;
		}
	}
</style>
