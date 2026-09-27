<script lang="ts">
	import { onMount } from 'svelte';
	import { SERVER_TIME_ZONE, formatDeadline } from '$lib/core/deadline';

	let { instant, visitorTimeZone }: { instant: string; visitorTimeZone?: string } = $props();

	// The first client render must repeat the server's Central European label or hydration
	// mismatches; the visitor's own zone is only known in the browser, after mount (D-11).
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	const timeZone = $derived(
		mounted
			? (visitorTimeZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone)
			: SERVER_TIME_ZONE
	);
</script>

<time class="mono" datetime={instant}>{formatDeadline(instant, timeZone)}</time>

<style>
	time {
		white-space: nowrap;
	}
</style>
