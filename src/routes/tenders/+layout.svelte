<script lang="ts">
	import TenderSplit from '$lib/components/TenderSplit.svelte';

	let { data, params, children } = $props();
</script>

<TenderSplit
	{data}
	variant="tenders"
	basePath="/tenders"
	opened={params.notice ?? data.defaultNotice ?? undefined}
	onRecord={params.notice !== undefined}
>
	{@render children()}
</TenderSplit>
