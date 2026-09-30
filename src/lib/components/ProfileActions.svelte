<script lang="ts">
	import { importAppliedText, importRefusalLines, type RefusalText } from '$lib/profile/copy';
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
		onimport
	}: {
		store: ProfileStore;
		statusText: string;
		clock?: () => Date;
		onimport: (event: ImportEvent) => void;
	} = $props();

	let refusal = $state<RefusalText | null>(null);

	// Files apply in the order they were picked, whatever order their reads finish in; the store's
	// answer is kept so a write the browser refused is never reported as an import.
	const enqueue = createImportQueue((stored) => store.replaceFromImport(stored));

	// Picks settle in the order made, so a later import that stored its file makes an earlier pick's
	// refusal stale, and it goes.
	async function pick(file: File) {
		refusal = null;
		onimport({ kind: 'reading', file: file.name });
		let result: Awaited<ReturnType<typeof enqueue>>;
		try {
			result = await enqueue(file);
		} catch {
			// Every step of an import catches its own failure, so this is a fault nobody foresaw. The
			// pick still settles, so the status never stays on reading; the store writes nothing
			// before it could have thrown.
			refusal = importAppliedText('failed', file.name);
			onimport({ kind: 'refused', file: file.name });
			return;
		}
		if (!result.ok) {
			refusal = importRefusalLines(result);
		} else if (result.applied === 'saved' || result.applied === 'unchanged') {
			refusal = null;
			onimport({ kind: 'imported', file: file.name });
			store.requestPersistOnce(navigator);
			return;
		} else {
			refusal = importAppliedText(result.applied, file.name);
		}
		onimport({ kind: 'refused', file: file.name });
	}

	function exportFile() {
		const current = store.stored;
		if (!current) return;
		const now = clock();
		downloadProfile(current, now);
		store.markExported(now);
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
</style>
