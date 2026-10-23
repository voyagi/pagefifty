<script lang="ts">
	import TenderSplit from '$lib/components/TenderSplit.svelte';

	let { data, params, children } = $props();
</script>

<TenderSplit
	{data}
	variant="example"
	basePath="/example"
	opened={params.notice ?? data.defaultNotice ?? undefined}
	onRecord={params.notice !== undefined}
>
	{@render children()}
</TenderSplit>
