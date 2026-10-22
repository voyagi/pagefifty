<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import TenderPage from '$lib/components/TenderPage.svelte';
	import TenderSplit from '$lib/components/TenderSplit.svelte';
	import TopBand from '$lib/components/TopBand.svelte';
	import { ACTIVE_FIRM_KEY, PROFILE_KEY, resetProfileStore } from '$lib/profile/store.svelte';
	import type { TenderListData } from '$lib/tenders/list';
	import type { TenderPageData } from '$lib/tenders/tender-page';

	// A whole page as a visitor gets it: the header, whose firm slot is the one profile-dependent
	// text in phase 1, above the list or the tender page. Storage is seeded here, before any child
	// mounts, and the shared store is dropped so it reads this page's storage and not the last one's.
	let {
		page,
		variant,
		stored,
		active,
		extra
	}: {
		page: { kind: 'list'; data: TenderListData } | { kind: 'tender'; data: TenderPageData };
		variant: 'tenders' | 'example';
		stored: string | null;
		active: 'own' | 'demo';
		extra?: Snippet;
	} = $props();

	untrack(() => {
		resetProfileStore();
		localStorage.clear();
		if (stored !== null) localStorage.setItem(PROFILE_KEY, stored);
		localStorage.setItem(ACTIVE_FIRM_KEY, active);
	});

	const base = $derived(variant === 'example' ? '/example' : '/tenders');
	const path = $derived(page.kind === 'list' ? base : `${base}/${page.data.tender.noticeNumber}`);
</script>

<TopBand {path} />
{#if page.kind === 'list'}
	<TenderSplit data={page.data} {variant} basePath={base} />
{:else}
	<TenderPage data={page.data} {variant} />
{/if}
{@render extra?.()}
