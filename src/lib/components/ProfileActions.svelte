<script lang="ts">
	import { tick } from 'svelte';
	import {
		REMOVE_COPY,
		exportDateText,
		importAppliedText,
		importFaultText,
		importRefusalLines,
		shownFileName,
		type RefusalText
	} from '$lib/profile/copy';
	import { downloadProfile } from '$lib/profile/export';
	import { createImportQueue } from '$lib/profile/import';
	import type { ProfileStore } from '$lib/profile/store.svelte';
	import Button from './Button.svelte';
	import ErrorBlock from './ErrorBlock.svelte';
	import StatusLine from './StatusLine.svelte';

	type ImportEvent =
		| { kind: 'reading'; file: string }
		| { kind: 'imported'; file: string }
		| { kind: 'refused'; file: string };

	// Export, import and the switch to the demo firm, with the save status and the import result.
	// All of it acts on the own profile only: the page never shows this in demo mode.
	let {
		store,
		statusText,
		clock = () => new Date(),
		onimport,
		onremove
	}: {
		store: ProfileStore;
		statusText: string;
		clock?: () => Date;
		onimport: (event: ImportEvent) => void;
		// The form shows storage again once the profile is gone, so no removed figure stays in a field.
		onremove: () => void;
	} = $props();

	let refusal = $state<RefusalText | null>(null);
	// Kept apart from the import refusal, so an export never clears or replaces what an import said.
	let exportRefusal = $state<RefusalText | null>(null);

	// Files apply in the order they were picked, whatever order their reads finish in; the store's
	// answer is kept so a write the browser refused is never reported as an import.
	const enqueue = createImportQueue((stored) => store.replaceFromImport(stored));

	// Picks settle in the order made, so a later import that stored its file makes an earlier pick's
	// refusal stale, and it goes.
	async function pick(file: File) {
		const name = shownFileName(file.name);
		refusal = null;
		onimport({ kind: 'reading', file: name });
		let result: Awaited<ReturnType<typeof enqueue>>;
		try {
			result = await enqueue(file);
		} catch (fault) {
			// Every step of an import catches its own failure, so this is a fault nobody foresaw, never
			// a storage refusal, and the words say so. The pick still settles, so the status never
			// stays on reading; the store writes nothing before it could have thrown. The page names no
			// cause, and nothing leaves the browser, so the console is the one record of the fault.
			console.error('Pagefifty: the profile import stopped on an unexpected error', fault);
			refusal = importFaultText(name);
			onimport({ kind: 'refused', file: name });
			return;
		}
		if (!result.ok) {
			refusal = importRefusalLines({ ...result, fileName: name });
		} else if (result.applied === 'saved' || result.applied === 'unchanged') {
			refusal = null;
			onimport({ kind: 'imported', file: name });
			store.requestPersistOnce(navigator);
			return;
		} else {
			refusal = importAppliedText(result.applied, name);
		}
		onimport({ kind: 'refused', file: name });
	}

	// The question opens inline under the control, focus moves to its safe answer, and closing it in
	// either direction hands focus back to the control the keyboard user started from.
	let confirming = $state(false);
	let removeArea = $state<HTMLElement>();
	let confirmArea = $state<HTMLElement>();
	// The answer stays only while the profile is the one it was about: a later save, import or
	// another tab's write replaces it, so it never sits beside a status it no longer describes.
	let removeNote = $state.raw<{ text: string; about: ProfileStore['stored'] } | null>(null);
	const shownNote = $derived(removeNote?.about === store.stored ? removeNote.text : '');

	const control = () => removeArea?.querySelector('button');

	// Asked of storage, not of this page's copy: another tab can save a profile before its storage
	// event reaches this page. So the shortcut says nothing is stored only when the removal would, and
	// a read the browser refuses opens the question, after which the removal says what happened.
	async function askRemove() {
		if (store.profileKeyState() === 'empty') {
			removeNote = { text: REMOVE_COPY.nothingStored, about: store.stored };
			return;
		}
		confirming = true;
		await tick();
		confirmArea?.querySelectorAll('button')[1]?.focus();
	}

	async function closeQuestion() {
		confirming = false;
		await tick();
		control()?.focus();
	}

	function remove() {
		const result = store.removeProfile();
		const text = {
			removed: REMOVE_COPY.removed,
			'nothing-stored': REMOVE_COPY.nothingStored,
			failed: REMOVE_COPY.failed
		}[result];
		removeNote = { text, about: store.stored };
		if (result === 'removed') onremove();
		void closeQuestion();
	}

	function exportFile() {
		const current = store.stored;
		if (!current) return;
		const now = clock();
		downloadProfile(current, now);
		const result = store.markExported(now);
		exportRefusal =
			result === 'failed' || result === 'newer-version' ? exportDateText(result) : null;
	}
</script>

<div class="actions">
	{#if store.stored}
		<Button onclick={exportFile}>
			<svg
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				aria-hidden="true"
			>
				<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10" />
			</svg>
			Export profile file
		</Button>
	{/if}
	<Button variant="secondary" pick={(file) => void pick(file)} accept="application/json,.json">
		Import a profile file
	</Button>
	<Button variant="secondary" onclick={() => store.useDemo()}>Use the demo firm</Button>
</div>
<p class="hint">Importing replaces the profile in this browser. Export first to keep a copy.</p>
<StatusLine text={statusText} />
{#if refusal}
	<ErrorBlock text={refusal} />
{/if}
{#if exportRefusal}
	<ErrorBlock text={exportRefusal} />
{/if}
<div class="remove" bind:this={removeArea}>
	<Button variant="secondary" onclick={() => void askRemove()}>{REMOVE_COPY.control}</Button>
	{#if confirming}
		<div class="question" role="group" aria-labelledby="remove-question" bind:this={confirmArea}>
			<p id="remove-question">{REMOVE_COPY.question}</p>
			<div class="answers">
				<Button onclick={remove}>{REMOVE_COPY.confirm}</Button>
				<Button variant="secondary" onclick={() => void closeQuestion()}>{REMOVE_COPY.keep}</Button>
			</div>
		</div>
	{/if}
	<p class="remove-note" data-remove-note aria-live="polite">{shownNote}</p>
</div>

<style>
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.hint {
		margin-top: 0.75rem;
		font-size: var(--step--1);
		color: var(--ink-3);
	}

	/* Set apart under a hairline, so the one control that deletes reads apart from export and import. */
	.remove {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--acetate-rule);
	}

	.question {
		max-width: 52ch;
		margin-top: 1rem;
		padding: 1rem 1.25rem;
		border: 1px solid var(--ink-3);
		border-radius: 3px;
		background: var(--acetate);
	}

	.answers {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.875rem;
	}

	/* Always in the page, empty or not: a live region added at the moment it speaks is not read out. */
	.remove-note {
		margin-top: 0.75rem;
		color: var(--ink-2);
	}
</style>
