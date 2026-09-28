<script module lang="ts">
	// Every card on a page is in the same browser, and building a default formatter only to read
	// its zone costs about as much as the label itself (363 cards: 24 ms read per card, 0.06 ms
	// read once, measured at ritual p8), so the zone is read once. Only called after mount, so the
	// server never reads its own zone here.
	let browserZone: string | undefined;

	function ownTimeZone(): string {
		browserZone ??= new Intl.DateTimeFormat().resolvedOptions().timeZone;
		return browserZone;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { SERVER_TIME_ZONE, formatDeadline, usableTimeZone } from '$lib/core/deadline';

	let { instant, visitorTimeZone }: { instant: string; visitorTimeZone?: string } = $props();

	// The first client render must repeat the server's Central European label or hydration
	// mismatches; the visitor's own zone is only known in the browser, after mount (D-11).
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	const timeZone = $derived(
		mounted ? usableTimeZone(visitorTimeZone ?? ownTimeZone()) : SERVER_TIME_ZONE
	);
</script>

<time class="mono" datetime={instant}>{formatDeadline(instant, timeZone)}</time>

<style>
	time {
		white-space: nowrap;
	}
</style>
