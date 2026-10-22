<script lang="ts">
	import TenderPage from '$lib/components/TenderPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Open IT tenders in NL, BE and DE - Pagefifty</title>
</svelte:head>

{#if data.record !== null}
	<TenderPage data={data.record} variant="tenders" />
{/if}
