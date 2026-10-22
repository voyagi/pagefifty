<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { formatDay, usableTimeZone } from '$lib/core/deadline';
	import { DEMO_FIRM_SHORT } from '$lib/profile/demo-firm';
	import type { getProfileStore } from '$lib/profile/store.svelte';
	import Icon from './Icon.svelte';

	// Which firm the pages are read for. The profile lives in the browser, so outside the example the
	// server draws an empty box of the same height and the browser fills it once it has read storage;
	// an empty box is no link, since a link with no name fails the name rule. The example always runs
	// on the demo firm, so there the server writes the label itself and never touches the active firm.
	let { path }: { path: string } = $props();

	// The demo firm's monogram, where a list shows a company's logo. The own firm has no name in the
	// profile to draw one from, so its tile shows the people mark instead of made-up letters.
	const DEMO_INITIALS = DEMO_FIRM_SHORT.split(/\s+/)
		.map((word) => word.charAt(0))
		.join('');

	let shared = $state<ReturnType<typeof getProfileStore> | null>(null);
	let zone = $state('UTC');

	// The store and its schema load after the page is up, so no page waits on them to hydrate.
	onMount(async () => {
		const profile = await import('$lib/profile/store.svelte');
		zone = usableTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone);
		shared = profile.getProfileStore();
	});

	const onExample = $derived(path === '/example' || path.startsWith('/example/'));

	// spoken is the part of the name a screen reader hears that the Demo tag shows to the eye.
	interface Lines {
		first: string;
		spoken?: string;
		second: string;
		demo: boolean;
	}

	// With storage blocked the own profile is only on the profile page itself, so the slot says
	// nothing about it rather than something no other page can back up.
	const lines = $derived.by((): Lines | null => {
		if (onExample || shared?.store.activeFirm === 'demo') {
			return {
				first: DEMO_FIRM_SHORT,
				spoken: ' (demo firm)',
				second: 'Invented figures',
				demo: true
			};
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

<!-- On the demo the visible Demo tag stands in for "(demo firm)", which stays in the name for a
	 screen reader, so the label is read once either way. -->
{#if lines}
	<a class="firm" class:demo={lines.demo} href={resolve('/profile')} data-firm-slot>
		<span class="tile" aria-hidden="true"
			>{#if lines.demo}{DEMO_INITIALS}{:else}<Icon name="users" />{/if}</span
		>
		<span class="lines">
			<span class="name"
				><strong
					>{lines.first}{#if lines.spoken}<span class="visually-hidden">{lines.spoken}</span
						>{/if}</strong
				>{#if lines.demo}<span class="tag" aria-hidden="true">Demo</span>{/if}</span
			>
			<span class="second">{lines.second}</span>
		</span>
	</a>
{:else}
	<div class="firm" data-firm-slot></div>
{/if}

<style>
	/* The same height whether filled or not, so filling it never moves the band. */
	.firm {
		display: flex;
		align-items: center;
		gap: 0.5625rem;
		min-height: 38px;
		color: var(--band-ink);
		text-decoration: none;
	}

	a.firm {
		padding: 0 0.75rem 0 0.3125rem;
		border: 1px solid rgb(255 255 255 / 0.22);
		border-radius: var(--r);
		transition: background-color var(--quick) ease-out;
	}

	a.firm:hover {
		background: var(--band-hover);
	}

	.tile {
		display: grid;
		place-items: center;
		flex: none;
		width: 28px;
		height: 28px;
		border-radius: var(--r-sm);
		background: var(--band-ink);
		color: var(--band);
		font-weight: 750;
		font-size: 0.71875rem;
		letter-spacing: -0.02em;
	}

	.lines {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}

	.name {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	strong {
		font-weight: 600;
		font-size: 0.84375rem;
	}

	.tag {
		padding: 1px 7px;
		border-radius: var(--r-sm);
		background: rgb(255 255 255 / 0.16);
		font-weight: 600;
		font-size: 0.71875rem;
	}

	.second {
		color: var(--band-ink-2);
		font-size: 0.75rem;
	}

	/* On a phone the own firm hides, while the demo label stays on one line right after the
	   wordmark, so nobody reads the invented figures as their own. */
	@media (max-width: 45em) {
		.firm {
			display: none;
		}

		.firm.demo {
			display: flex;
			order: 0;
			white-space: nowrap;
		}

		.demo .second {
			display: none;
		}
	}
</style>
