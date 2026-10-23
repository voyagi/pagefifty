<script lang="ts">
	import TenderPage from '$lib/components/TenderPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Example run, {data.capture.capturedOn} snapshot - Pagefifty</title>
</svelte:head>

{#if data.record !== null}
	<TenderPage data={data.record} variant="example" />
{/if}
