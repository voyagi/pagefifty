<script lang="ts">
	import { resolve } from '$app/paths';
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
	<!-- The firm slot is filled in the browser, where the profile lives (plan 01-14). The server
	     renders it empty at its full two-line height so filling it never moves the bar. -->
	<div class="firm" data-firm-slot></div>
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

	.firm {
		min-height: calc(var(--step-0) * 1.35 + var(--step--1) * 1.35);
		font-size: var(--step--1);
		line-height: 1.35;
		text-align: right;
	}

	@media (max-width: 720px) {
		.deskbar {
			flex-wrap: wrap;
			gap: 0.5rem 1rem;
		}

		.nav {
			order: 3;
			width: 100%;
		}

		.firm {
			display: none;
		}
	}
</style>
