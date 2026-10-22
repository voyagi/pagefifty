<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import TopBand from '$lib/components/TopBand.svelte';

	let { children } = $props();
</script>

<!-- Only the latin file: every page's own words are in it, and the latin-ext file loads on its own
	 the first time a buyer's name needs one of its letters. -->
<svelte:head>
	<link rel="icon" href={favicon} />
	<link
		rel="preload"
		as="font"
		type="font/woff2"
		href="/fonts/albert-sans-latin.woff2"
		crossorigin="anonymous"
	/>
</svelte:head>

<TopBand path={page.url.pathname} />

{@render children()}

<SiteFooter />
