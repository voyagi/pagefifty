<script lang="ts">
	import { onMount } from 'svelte';
	import { THEME_CHOICES, type ThemeChoice } from '$lib/theme/theme';
	import { createThemeController, type ThemeController } from '$lib/theme/theme.svelte';

	let { win }: { win?: Window } = $props();

	const LABELS: Record<ThemeChoice, string> = { light: 'Light', dark: 'Dark', device: 'Device' };

	// Raw, because a deep $state proxy would wrap the controller's own getter and signal.
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
	.theme {
		display: inline-flex;
		flex: none;
		border: 1px solid var(--acetate-edge);
		border-radius: 4px;
		background: var(--acetate);
		padding: 2px;
	}

	button {
		font: 500 var(--step--1) / 1 var(--font-sans);
		color: var(--ink-2);
		background: var(--acetate);
		border: 0;
		border-radius: 3px;
		padding: 0.5rem 0.625rem;
		min-height: 44px;
		cursor: pointer;
	}

	button:hover {
		color: var(--ink);
	}

	button[aria-pressed='true'] {
		background: var(--ink);
		color: var(--acetate);
	}
</style>
