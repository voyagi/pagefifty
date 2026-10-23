<script lang="ts">
	import ExampleLayout from '../routes/example/+layout.svelte';
	import ExamplePage from '../routes/example/+page.svelte';
	import TendersLayout from '../routes/tenders/+layout.svelte';
	import TendersPage from '../routes/tenders/+page.svelte';
	import type { TenderListData } from '$lib/tenders/list';

	// The bare list of /tenders or /example, opening no tender, as SvelteKit renders it: the route's
	// layout with the route's own page inside, so a test sees what the layout leaves out of the page,
	// its <svelte:head> included. The page gets the layout's data and its record, as SvelteKit merges
	// them, and with no tender chosen its loader reads no record.
	let {
		variant,
		data
	}: {
		variant: 'tenders' | 'example';
		data: TenderListData & { defaultNotice: null; now: Date };
	} = $props();

	const pageData = $derived({ ...data, record: null });
</script>

{#if variant === 'example'}
	<ExampleLayout {data} params={{}}>
		<ExamplePage data={pageData} />
	</ExampleLayout>
{:else}
	<TendersLayout {data} params={{}}>
		<TendersPage data={pageData} />
	</TendersLayout>
{/if}
