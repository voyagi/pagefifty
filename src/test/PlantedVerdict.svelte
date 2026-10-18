<script lang="ts">
	import type { TenderPageData } from '$lib/tenders/tender-page';
	import NoVerdictHarness from './NoVerdictHarness.svelte';

	// The planted defect for the no-verdict property: the tender page plus the shortcut phase 1 must
	// never take, a regex that reads a turnover floor out of criterion text and prints a verdict when
	// it exceeds the stored turnover. It lives only here and only the no-verdict test mounts it. With
	// region set, the verdict is drawn inside a [data-verdict] element, as if the page had given a
	// verdict to a notice the readings do not list.
	let {
		data,
		stored,
		active,
		region = false
	}: {
		data: TenderPageData;
		stored: string | null;
		active: 'own' | 'demo';
		region?: boolean;
	} = $props();

	const FLOOR = /(\d{1,3}(?:\.\d{3})+)\s*(?:Euro|EUR|€)/;

	const floor = $derived.by(() => {
		for (const lot of data.tender.lots) {
			for (const criterion of lot.criteria) {
				for (const description of criterion.descriptions) {
					const found = FLOOR.exec(description.text);
					if (found) return Number(found[1].replaceAll('.', ''));
				}
			}
		}
		return undefined;
	});

	const turnover = $derived.by(() => {
		const rows: { year: number; generalNet?: number }[] =
			stored === null ? [] : JSON.parse(stored).profile.turnover;
		const latest = [...rows].sort((a, b) => b.year - a.year)[0];
		return latest?.generalNet ?? 0;
	});
</script>

<NoVerdictHarness page={{ kind: 'tender', data }} variant="tenders" {stored} {active}>
	{#snippet extra()}
		{#if floor !== undefined && floor > turnover}
			{#if region}<p class="planted" data-verdict>No-go</p>{:else}<p class="planted">No-go</p>{/if}
		{/if}
	{/snippet}
</NoVerdictHarness>
