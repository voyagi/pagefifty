<script lang="ts">
	import { DEMO_FIRM_NAME, DEMO_FIRM_SHORT } from '$lib/profile/demo-firm';

	// The example run names its capture day; the profile's demo view names the firm alone.
	let { capturedOn }: { capturedOn?: string } = $props();
</script>

{#if capturedOn}
	<p class="demo-note">
		Example run from a snapshot captured on {capturedOn}. {DEMO_FIRM_SHORT} is a demo firm with invented
		figures. Not legal advice.
	</p>
{:else}
	<p class="demo-note">{DEMO_FIRM_NAME} is a demo firm. Every figure on this page is invented.</p>
{/if}

<style>
	/* The page's last line, after everything the demo figures were used for. */
	.demo-note {
		margin-top: 2rem;
		max-width: 80ch;
		font-size: var(--step--1);
		color: var(--ink-2);
	}
</style>
