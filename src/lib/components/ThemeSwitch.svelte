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
	/* A segmented control drawn on the bar. Each button is 28px tall inside the 32px group, past
	   the 24px minimum target of WCAG 2.2 (2.5.8); on a phone the first bar row is already 44px
	   tall for the wordmark, so there the group grows to the full 44px. */
	.theme {
		display: inline-flex;
		flex: none;
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--bar-rule);
		border-radius: var(--r-pill);
		background: var(--bar);
	}

	button {
		min-height: 28px;
		padding: 0 0.6875rem;
		border: 0;
		border-radius: var(--r-pill);
		background: var(--bar);
		color: var(--bar-ink-2);
		font: 500 var(--step--1) / 1 var(--font);
		cursor: pointer;
		transition:
			background-color var(--quick) ease-out,
			color var(--quick) ease-out;
	}

	button:hover {
		color: var(--bar-ink);
	}

	button[aria-pressed='true'] {
		background: var(--bar-hover);
		color: var(--bar-ink);
	}

	/* Narrower on a phone, so the switch shares the band's first row with the wordmark and the demo
	   label. */
	@media (max-width: 45em) {
		button {
			min-height: 40px;
			padding: 0 0.5rem;
		}
	}
</style>
