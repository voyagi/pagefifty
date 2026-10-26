<script lang="ts">
	import { resolve } from '$app/paths';
	import FirmSlot from './FirmSlot.svelte';
	import MainNav from './MainNav.svelte';
	import SkipLink from './SkipLink.svelte';
	import ThemeSwitch from './ThemeSwitch.svelte';

	let { path }: { path: string } = $props();
</script>

<!-- A white bar on every page, one hairline under it; the green is in the "50" mark only. -->
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
		gap: 0.75rem 2rem;
		min-height: var(--bar-h);
		padding: 0.5rem var(--gutter);
		border-bottom: 1px solid var(--bar-rule);
		background: var(--bar);
		color: var(--bar-ink);
	}

	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		min-height: 44px;
		font-weight: 800;
		font-size: 1.25rem;
		letter-spacing: -0.035em;
		color: var(--bar-ink);
		text-decoration: none;
		white-space: nowrap;
	}

	/* The mark is the page number on the one green. The stylesheet draws the number, so the link's
	   text is the name alone for every reader and every tool, and the mark stays decoration. */
	.logo::before {
		content: '50';
	}

	.logo {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: var(--mark);
		color: var(--mark-ink);
		font-weight: 800;
		font-size: 0.78125rem;
		letter-spacing: -0.04em;
	}

	.spacer {
		flex: 1;
	}

	/* On a phone the band wraps to two rows: the wordmark, the demo label (the firm slot's own rule)
	   and the theme switch pushed to the right on the first, the nav across the whole second, so the
	   band grows past its --bar-h there. */
	@media (max-width: 45em) {
		.band {
			flex-wrap: wrap;
			gap: 0.25rem 0.5rem;
		}

		.spacer {
			display: none;
		}

		.band > :global(.theme) {
			order: 2;
			margin-left: auto;
		}

		.nav {
			order: 3;
			width: 100%;
		}
	}
</style>
