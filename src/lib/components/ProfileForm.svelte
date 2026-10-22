<script lang="ts">
	import { untrack, type ComponentProps } from 'svelte';
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
	import LoadingLines from './LoadingLines.svelte';
	import MoneyField from './MoneyField.svelte';
	import ProfileActions from './ProfileActions.svelte';
	import ProfileLeaf from './ProfileLeaf.svelte';
	import SelectField from './SelectField.svelte';
	import ToggleChip from './ToggleChip.svelte';

	// store is null until the page has read storage in the browser; until then every panel shows its
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
		| { kind: 'refused' }
		| { kind: 'imported'; file: string };

	type NumberKind = 'money' | 'staff' | 'years';

	// Drafts hold what is typed, errors what is wrong with it. Storage only ever gets a valid value,
	// so a field in error keeps its last valid value there until it is fixed. What a field shows
	// follows one rule: the typed text while the user is in the field or it shows an error, otherwise
	// what storage holds. syncDrafts (load, another tab, an import), left (leaving a field) and
	// toggleCertificate (a removal storage kept) each apply it at their moment.
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

	// A certificate another tab removed takes its error with it: its field is gone, and an error left
	// behind would name a field nobody can see or fix.
	function dropGoneErrors() {
		const present = new Set(
			(store?.stored?.profile.certificates ?? []).map((entry) => certificateKey(entry.standard))
		);
		for (const key of Object.keys(errors)) {
			if (key.startsWith('certificate:') && !present.has(key)) clearError(key);
		}
	}

	$effect(() => {
		if (!store) return;
		untrack(() => syncDrafts(() => false));
		const onStorage = () => {
			dropGoneErrors();
			syncDrafts((key) => key in errors || key === focusedKey);
		};
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	});

	// Leaving a field shows what storage holds for it, unless the field shows an error: a value
	// another tab saved while the user was in the field, or one this browser refused to store, must
	// never stay on screen as if it were the profile, where the export and the save status would
	// both disagree with it.
	function left(key: string) {
		focusedKey = null;
		if (key in errors) return;
		drafts[key] = storedDrafts(store?.stored?.profile ?? emptyProfile())[key] ?? '';
	}

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
	// this form, so a field another tab saved in the meantime is kept. The answer says whether the
	// change is now in storage ('saved' or 'unchanged') or was refused.
	function save(change: (current: Profile) => Profile, removed?: string): boolean {
		if (!store) return false;
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
		return result === 'saved' || result === 'unchanged';
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

	// The answer says whether the change is in storage. A removal takes the certificate's date and
	// error with it only once it is stored: a refused one leaves the certificate held, and its field
	// must still show the date storage holds.
	function toggleCertificate(standard: string): boolean {
		const key = certificateKey(standard);
		if (held.includes(standard)) {
			const kept = save(
				(current) => ({
					...current,
					certificates: current.certificates.filter((entry) => entry.standard !== standard)
				}),
				COMMON_CERTIFICATES.includes(standard) ? undefined : standard
			);
			if (kept) {
				clearError(key);
				const rest = { ...drafts };
				delete rest[key];
				drafts = rest;
			}
			return kept;
		}
		return save((current) =>
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
		// A refused save keeps the name typed and the panel open, so nothing is lost.
		if (!held.includes(name) && !toggleCertificate(name)) return;
		newName = '';
		adding = false;
	}

	function toggleCode(list: 'countries' | 'languages', target: EventTarget | null) {
		if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
		const { value: code, checked } = target;
		const next = (codes: string[]) => {
			const rest = codes.filter((entry) => entry !== code);
			return checked ? [...rest, code] : rest;
		};
		const kept = save((current) =>
			list === 'countries'
				? { ...current, countries: next(current.countries) }
				: { ...current, languages: next(current.languages) }
		);
		// A tick box has no error line: a refused change shows the box as storage holds it.
		if (!kept) target.checked = profile[list].includes(code);
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

	// An imported file replaces the whole profile, so every field shows it and no error is left over
	// from what was typed before. Files settle in the order picked, so the first one listed is the one
	// settling. While any is still being read the status names the latest pick; a refused file leaves
	// the status as it stood, since only an import changes the profile.
	type ImportEvent = Parameters<ComponentProps<typeof ProfileActions>['onimport']>[0];
	let readingFiles = $state<string[]>([]);
	function onimport(event: ImportEvent) {
		if (event.kind === 'reading') {
			readingFiles = [...readingFiles, event.file];
			return;
		}
		readingFiles = readingFiles.slice(1);
		if (event.kind === 'imported') {
			errors = {};
			syncDrafts(() => false);
			lastEvent = event;
		}
	}

	// A removed profile leaves every field empty and no error or last save behind.
	function onremove() {
		errors = {};
		lastEvent = null;
		syncDrafts(() => false);
	}

	const status = $derived.by((): SaveStatus => {
		const newer = store?.newerVersion;
		if (newer != null) return { kind: 'newer', version: newer, reads: PROFILE_SCHEMA_VERSION };
		const latestPick = readingFiles.at(-1);
		if (latestPick !== undefined) return { kind: 'reading', file: latestPick };
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
		if (lastEvent?.kind === 'imported') return { ...lastEvent, inMemory: keptInMemory };
		if (lastEvent?.kind === 'saved' && !keptInMemory) return lastEvent;
		return { kind: 'kept', inMemory: keptInMemory };
	});

	const exported = $derived(store?.stored?.lastExportedAt ?? null);
</script>

<ProfileLeaf leaf="firm">
	{#snippet margin()}
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
	{/snippet}
	{#snippet body()}
		<h1 class="title" id="profile-title">Your firm profile</h1>
		{#if store && !store.stored && store.newerVersion !== null}
			<p class="lede">
				This browser holds a profile saved by a newer version of Pagefifty, which this page cannot
				read. It stays as it is, and nothing typed here is saved.
			</p>
		{:else if store && !store.stored}
			<p class="lede">
				Nothing saved yet. Fill in what you can prove with a document, or try the pages with the
				demo firm.
			</p>
		{:else}
			<p class="gloss">
				The figures Pagefifty will check each tender's criteria against. Fill in what you can prove
				with a document.
			</p>
		{/if}
		<noscript>
			<p class="noscript">
				The firm profile is kept in this browser and needs JavaScript to read and save it.
			</p>
		</noscript>
		{#if store}
			<ProfileActions {store} {clock} statusText={saveStatusText(status)} {onimport} {onremove} />
		{:else}
			<LoadingLines label="Reading the profile kept in this browser." />
		{/if}
	{/snippet}
</ProfileLeaf>

<ProfileLeaf leaf="turnover">
	{#snippet body()}
		<div>
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
							onblur={() => left(key)}
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
							onblur={() => left('years')}
						/>
					</div>
				</div>
			{:else}
				<LoadingLines />
			{/if}
		</div>
	{/snippet}
</ProfileLeaf>

<ProfileLeaf leaf="people">
	{#snippet body()}
		<div>
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
						onblur={() => left('staff')}
					/>
				</div>
			{:else}
				<LoadingLines />
			{/if}
		</div>
	{/snippet}
</ProfileLeaf>

<ProfileLeaf leaf="certificates">
	{#snippet body()}
		<div>
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
								hintStrong={hint.strong}
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
								onblur={() => left(key)}
							/>
						{/each}
					</div>
				{/if}
			{:else}
				<LoadingLines />
			{/if}
		</div>
	{/snippet}
</ProfileLeaf>

<ProfileLeaf leaf="countries">
	{#snippet body()}
		<div>
			{#if store}
				<div class="form-grid">
					<SelectField
						id="registration-country"
						label="Country of registration"
						placeholder="Choose a country"
						options={EU_EEA_COUNTRIES}
						value={profile.registration.country ?? ''}
						onchange={(code, select) => {
							const kept = save((current) => ({
								...current,
								registration: { ...current.registration, country: code || undefined }
							}));
							// Like a tick box, a refused choice shows what storage holds.
							if (!kept) select.value = profile.registration.country ?? '';
						}}
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
	{/snippet}
</ProfileLeaf>

<style>
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

	.row-start {
		grid-column: 1;
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

	@media (max-width: 45em) {
		.add > :global(.btn) {
			margin-bottom: 0;
		}
	}
</style>
