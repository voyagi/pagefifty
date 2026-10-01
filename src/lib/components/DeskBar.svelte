<script lang="ts">
	import { resolve } from '$app/paths';
	import FirmSlot from './FirmSlot.svelte';
	import MainNav from './MainNav.svelte';
	import SkipLink from './SkipLink.svelte';
	import ThemeSwitch from './ThemeSwitch.svelte';

	let { path }: { path: string } = $props();
</script>

<header class="deskbar">
	<SkipLink />
	<a class="wordmark" href={resolve('/')}>Pagefifty</a>
	<div class="nav"><MainNav {path} /></div>
	<span class="spacer"></span>
	<FirmSlot {path} />
	<ThemeSwitch />
</header>

<style>
	.deskbar {
		position: relative;
		display: flex;
		align-items: center;
		gap: 2rem;
		padding: 0.875rem var(--gutter);
		background: var(--desk);
		color: var(--desk-ink);
	}

	.wordmark {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-family: var(--font-cond);
		font-weight: 700;
		font-size: var(--step-2);
		letter-spacing: -0.01em;
		color: var(--ink);
		text-decoration: none;
	}

	.spacer {
		flex: 1;
	}

	/* On a phone the demo label (the firm slot's own rule) sits right after the wordmark, so the
	   spacer and the theme switch follow it; the nav takes the second row. */
	@media (max-width: 45em) {
		.deskbar {
			flex-wrap: wrap;
			gap: 0.5rem 1rem;
		}

		.spacer {
			order: 1;
		}

		.deskbar > :global(.theme) {
			order: 2;
		}

		.nav {
			order: 3;
			width: 100%;
		}
	}
</style>
