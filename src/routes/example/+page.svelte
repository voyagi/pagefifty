<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import TenderPage from '$lib/components/TenderPage.svelte';

	let { data } = $props();
</script>

<PageHead title="Example run, {data.capture.capturedOn} snapshot - Pagefifty" />

{#if data.record !== null}
	<TenderPage data={data.record} variant="example" />
{/if}
