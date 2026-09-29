<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { formatDay, usableTimeZone } from '$lib/core/deadline';
	import { DEMO_FIRM_SHORT } from '$lib/profile/demo-firm';
	import type { getProfileStore } from '$lib/profile/store.svelte';

	// Which firm the pages are read for. The profile lives in the browser, so outside the example the
	// server draws an empty box of the same height and the browser fills it once it has read storage;
	// an empty box is no link, since a link with no name fails the name rule. The example always runs
	// on the demo firm, so there the server writes the label itself and never touches the active firm.
	let { path }: { path: string } = $props();

	let shared = $state<ReturnType<typeof getProfileStore> | null>(null);
	let zone = $state('UTC');

	// The store and its schema load after the page is up, so no page waits on them to hydrate.
	onMount(async () => {
		const profile = await import('$lib/profile/store.svelte');
		zone = usableTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone);
		shared = profile.getProfileStore();
	});

	const onExample = $derived(path === '/example' || path.startsWith('/example/'));

	// With storage blocked the own profile is only on the profile page itself, so the slot says
	// nothing about it rather than something no other page can back up.
	const lines = $derived.by(() => {
		if (onExample || shared?.store.activeFirm === 'demo') {
			return { first: `${DEMO_FIRM_SHORT} (demo firm)`, second: 'Invented figures', demo: true };
		}
		if (!shared || shared.keptInMemory) return null;
		// A profile this page cannot read is still a profile, as the profile page itself says.
		if (shared.store.newerVersion !== null) {
			return { first: 'Your firm', second: 'Saved by a newer version', demo: false };
		}
		const stored = shared.store.stored;
		if (!stored) return { first: 'Your firm', second: 'No profile yet', demo: false };
		const exported = stored.lastExportedAt;
		return {
			first: 'Your firm',
			second: `Last exported: ${exported === null ? 'never' : formatDay(exported, zone)}`,
			demo: false
		};
	});
</script>

{#if lines}
	<a class="firm" class:demo={lines.demo} href={resolve('/profile')} data-firm-slot>
		<strong>{lines.first}</strong>
		<span class="second">{lines.second}</span>
	</a>
{:else}
	<div class="firm" data-firm-slot></div>
{/if}

<style>
	/* The same box whether filled or not, so filling it never moves the bar. */
	.firm {
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-height: 44px;
		font-size: var(--step--1);
		line-height: 1.35;
		text-align: right;
		color: var(--desk-ink);
		text-decoration: none;
	}

	strong {
		color: var(--ink);
		font-weight: 600;
		font-size: var(--step-0);
	}

	a.firm:hover strong {
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	a.firm:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	/* On a phone the own firm hides, while the demo label stays as one line right after the
	   wordmark, so nobody reads the invented figures as their own. */
	@media (max-width: 720px) {
		.firm {
			display: none;
		}

		.firm.demo {
			display: flex;
			order: 0;
			text-align: left;
			white-space: nowrap;
		}

		.demo strong {
			font-size: var(--step--1);
		}

		.demo .second {
			display: none;
		}
	}
</style>
