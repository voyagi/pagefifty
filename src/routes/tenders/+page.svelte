<script lang="ts">
	import TenderListPage from '$lib/components/TenderListPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Open IT tenders in NL, BE and DE - Pagefifty</title>
</svelte:head>

<TenderListPage {data} variant="tenders" basePath="/tenders" />
