<script lang="ts">
	import { onMount } from 'svelte';
	import { THEME_CHOICES, type ThemeChoice } from '$lib/theme/theme';
	import { createThemeController, type ThemeController } from '$lib/theme/theme.svelte';

	let { win }: { win?: Window } = $props();

	const LABELS: Record<ThemeChoice, string> = { light: 'Light', dark: 'Dark', device: 'Device' };

	// Raw: only the reference changes, from null to the controller, and its choice is already
	// reactive through the controller's own $state, so a deep proxy would add nothing.
	let controller = $state.raw<ThemeController | null>(null);

	onMount(() => {
		const created = createThemeController(win ?? window);
		controller = created;
		return () => created.destroy();
	});
</script>

<div class="theme" role="group" aria-label="Theme">
	{#each THEME_CHOICES as choice (choice)}
		<button
			type="button"
			aria-pressed={controller?.choice === choice ? 'true' : 'false'}
			onclick={() => controller?.pick(choice)}>{LABELS[choice]}</button
		>
	{/each}
</div>

<style>
	/* A segmented control drawn on the band. Each button is 28px tall inside the 32px group, past
	   the 24px minimum target of WCAG 2.2 (2.5.8); on a phone the first band row is already 44px
	   tall for the wordmark, so there the group grows to the full 44px. */
	.theme {
		display: inline-flex;
		flex: none;
		gap: 2px;
		padding: 1px;
		border: 1px solid rgb(255 255 255 / 0.22);
		border-radius: 7px;
	}

	button {
		min-height: 28px;
		padding: 0 0.625rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--band-ink-2);
		font: 500 var(--step--1) / 1 var(--font);
		cursor: pointer;
		transition:
			background-color var(--quick) ease-out,
			color var(--quick) ease-out;
	}

	button:hover {
		color: var(--band-ink);
	}

	button[aria-pressed='true'] {
		background: var(--band-hover);
		color: var(--band-ink);
	}

	@media (max-width: 45em) {
		button {
			min-height: 40px;
		}
	}
</style>
