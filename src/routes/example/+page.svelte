<script lang="ts">
	import TenderListPage from '$lib/components/TenderListPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Example run, {data.capture.capturedOn} snapshot - Pagefifty</title>
</svelte:head>

<TenderListPage {data} variant="example" basePath="/example" />
