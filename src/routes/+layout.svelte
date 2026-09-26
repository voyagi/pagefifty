<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link
		rel="preload"
		as="font"
		type="font/woff2"
		href="/fonts/plex-sans-400.woff2"
		crossorigin="anonymous"
	/>
	<link
		rel="preload"
		as="font"
		type="font/woff2"
		href="/fonts/plex-sans-condensed-600.woff2"
		crossorigin="anonymous"
	/>
</svelte:head>

{@render children()}
