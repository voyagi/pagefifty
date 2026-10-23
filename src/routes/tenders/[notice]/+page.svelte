<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import TenderPage from '$lib/components/TenderPage.svelte';

	let { data } = $props();
</script>

<PageHead title="{data.tender.title.text} ({data.tender.noticeNumber}) - Pagefifty" />

<TenderPage {data} variant="tenders" />
