<script lang="ts">
	import { resolve } from '$app/paths';
	import FirmSlot from './FirmSlot.svelte';
	import MainNav from './MainNav.svelte';
	import SkipLink from './SkipLink.svelte';
	import ThemeSwitch from './ThemeSwitch.svelte';

	let { path }: { path: string } = $props();
</script>

<!-- The band is the one place the colour lives at size, on every page. -->
<header class="band">
	<SkipLink />
	<a class="wordmark" href={resolve('/')}><span class="logo" aria-hidden="true"></span>Pagefifty</a>
	<div class="nav"><MainNav {path} /></div>
	<span class="spacer"></span>
	<ThemeSwitch />
	<FirmSlot {path} />
</header>

<style>
	.band {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.75rem 1.625rem;
		min-height: var(--band-h);
		padding: 0.5rem var(--gutter);
		background: var(--band);
		color: var(--band-ink);
	}

	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.5625rem;
		min-height: 44px;
		font-weight: 750;
		font-size: 1.1875rem;
		letter-spacing: -0.025em;
		color: var(--band-ink);
		text-decoration: none;
		white-space: nowrap;
	}

	/* The mark is the page number in the band's own colours. The stylesheet draws the number, so the
	   link's text is the name alone for every reader and every tool, and the mark stays decoration. */
	.logo::before {
		content: '50';
	}

	.logo {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 7px;
		background: var(--band-ink);
		color: var(--band);
		font-weight: 800;
		font-size: 0.78125rem;
		letter-spacing: -0.04em;
	}

	.spacer {
		flex: 1;
	}

	/* On a phone the band wraps: the wordmark, the demo label (the firm slot's own rule) and the
	   theme switch on the first row, the nav across the whole second row, so the band grows past
	   its 60px there. */
	@media (max-width: 45em) {
		.band {
			flex-wrap: wrap;
			gap: 0.25rem 0.75rem;
		}

		.spacer {
			order: 1;
		}

		.band > :global(.theme) {
			order: 2;
		}

		.nav {
			order: 3;
			width: 100%;
		}
	}
</style>
