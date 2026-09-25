<script lang="ts">
	import { onMount } from 'svelte';
	import { parseCount, type FieldProblem } from '$lib/profile/fields';
	import { emptyProfile } from '$lib/profile/schema';
	import { browserStorage, createProfileStore, type SaveResult } from '$lib/profile/store.svelte';

	// Storage is read only here, after mount, so the server never renders or receives a profile.
	let store = $state<ReturnType<typeof createProfileStore> | null>(null);
	let totalStaff = $state('');
	let problem = $state<FieldProblem | null>(null);
	let lastSave = $state<SaveResult | null>(null);

	const FIELD_HELP: Record<FieldProblem, string> = {
		'not-a-number': 'Not a whole number yet. Write the number of people, like 19.',
		'below-zero': 'Staff cannot be below 0. Write the number of people, like 19.',
		'too-long': 'That number is too long for a staff count. Write the number of people, like 19.'
	};

	onMount(() => {
		const created = createProfileStore(browserStorage());
		totalStaff = created.load()?.profile.staff.total?.toString() ?? '';
		store = created;
	});

	function save() {
		if (!store) return;
		const parsed = parseCount(totalStaff);
		if (!parsed.ok) {
			problem = parsed.reason;
			return;
		}
		problem = null;
		const profile = store.stored?.profile ?? emptyProfile();
		lastSave = store.saveProfile(
			{ ...profile, staff: { ...profile.staff, total: parsed.value } },
			new Date()
		);
	}

	const savedAtTime = (iso: string) =>
		new Intl.DateTimeFormat('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).format(new Date(iso));

	const status = $derived.by(() => {
		if (problem) return 'Not saved: Total staff needs a valid value. The rest is saved.';
		if (lastSave === 'failed') return 'Not saved: this browser refused to store the profile.';
		const savedAt = store?.stored?.savedAt;
		return savedAt ? `Saved in this browser at ${savedAtTime(savedAt)}.` : 'Nothing saved yet.';
	});
</script>

<svelte:head>
	<title>Firm profile - Pagefifty</title>
</svelte:head>

<main id="main">
	<h1>Your firm profile</h1>
	<noscript>
		<p>The firm profile is kept in this browser and needs JavaScript to read and save it.</p>
	</noscript>

	{#if store}
		<div class="field" class:error={problem}>
			<label for="total-staff">Total staff</label>
			<input
				id="total-staff"
				name="total-staff"
				inputmode="numeric"
				autocomplete="off"
				bind:value={totalStaff}
				oninput={save}
				aria-invalid={problem ? 'true' : undefined}
				aria-describedby="total-staff-hint"
			/>
			<p class="hint" id="total-staff-hint">
				{problem ? FIELD_HELP[problem] : 'Everyone on the payroll, like 19.'}
			</p>
		</div>
		<p class="status" role="status">{status}</p>
	{:else}
		<div class="loading" aria-busy="true">
			<p class="visually-hidden">Reading the profile kept in this browser.</p>
			<span></span><span></span><span></span>
		</div>
	{/if}
</main>

<style>
	.field {
		display: grid;
		gap: 0.375rem;
		max-width: 20rem;
	}

	label {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	input {
		font-family: 'IBM Plex Mono', ui-monospace, monospace;
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		min-height: 44px;
		padding: 0 0.75rem;
		border: 1px solid #5f646b;
		border-radius: 3px;
	}

	.error input {
		border: 2px dashed currentColor;
	}

	.error .hint {
		font-weight: 600;
	}

	.hint,
	.status {
		font-size: 0.8125rem;
		margin: 0;
	}

	.loading {
		display: grid;
		gap: 0.5rem;
		max-width: 20rem;
	}

	.loading span {
		display: block;
		height: 0.875rem;
		border-radius: 2px;
		background: rgb(20 20 20 / 0.12);
	}

	.loading span:nth-of-type(1) {
		width: 80%;
	}

	.loading span:nth-of-type(2) {
		width: 60%;
	}

	.loading span:nth-of-type(3) {
		width: 40%;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
