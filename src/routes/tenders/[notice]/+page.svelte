<script lang="ts">
	import TenderPage from '$lib/components/TenderPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.tender.title.text} ({data.tender.noticeNumber}) - Pagefifty</title>
</svelte:head>

<TenderPage {data} variant="tenders" />
