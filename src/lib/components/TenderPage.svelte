<script lang="ts">
	import { onMount } from 'svelte';
	import { DEMO_FIRM_NAME, DEMO_PROFILE } from '$lib/profile/demo-firm';
	import type { getProfileStore } from '$lib/profile/store.svelte';
	import { CANCEL_INTENT_LINE } from '$lib/tenders/list';
	import type { LotView, TenderPageData } from '$lib/tenders/tender-page';
	import {
		comparedLine,
		lotVerdict,
		type ComparedFirm,
		type FirmFacts
	} from '$lib/tenders/verdict-view';
	import Binder from './Binder.svelte';
	import DeadlineTime from './DeadlineTime.svelte';
	import DemoNote from './DemoNote.svelte';
	import FacedownLeaf from './FacedownLeaf.svelte';
	import Facts from './Facts.svelte';
	import Label from './Label.svelte';
	import Leaf from './Leaf.svelte';
	import LeafGrid from './LeafGrid.svelte';
	import LotLeaf from './LotLeaf.svelte';
	import RunRecord from './RunRecord.svelte';
	import SourceLinks from './SourceLinks.svelte';
	import UnreadStrip from './UnreadStrip.svelte';

	let {
		data,
		variant = 'tenders'
	}: {
		data: TenderPageData;
		variant?: 'tenders' | 'example';
	} = $props();

	const tender = $derived(data.tender);
	const deadline = $derived(tender.deadline);
	const criteriaShown = $derived(tender.lots.some((lot) => lot.criteria.length > 0));
	// The example counts the time left from the capture instant, so a visitor months later must not
	// read it as days still left today; "Closed" needs no such note, since closed then is closed now.
	const timeLeftTerm = $derived(
		variant === 'example' ? 'Time left at the capture time' : 'Time left'
	);

	// The example always compares with the demo firm. Anywhere else the firm is whatever this
	// browser keeps, read only after mount from the store the header shares, so a server render
	// never sees a profile and the store follows a save in another tab.
	let shared = $state<ReturnType<typeof getProfileStore> | null>(null);

	onMount(async () => {
		if (variant === 'example') return;
		const profile = await import('$lib/profile/store.svelte');
		shared = profile.getProfileStore();
	});

	const DEMO: ComparedFirm = { kind: 'demo', name: DEMO_FIRM_NAME };

	const firm = $derived.by((): { facts: FirmFacts | null; compared: ComparedFirm } | null => {
		if (variant === 'example') return { facts: DEMO_PROFILE, compared: DEMO };
		if (shared === null) return null;
		if (shared.store.activeFirm === 'demo') return { facts: DEMO_PROFILE, compared: DEMO };
		if (shared.store.newerVersion !== null) return { facts: null, compared: { kind: 'newer' } };
		const stored = shared.store.stored;
		return stored
			? { facts: stored.profile, compared: { kind: 'own' } }
			: { facts: null, compared: { kind: 'none' } };
	});

	// Whether a lot gets a verdict at all does not depend on the firm, so before the firm is read
	// the lots that will carry one show their loading lines and no word of it.
	function verdictOf(lot: LotView) {
		if (firm === null) return lotVerdict(lot, null, tender.now) === null ? undefined : 'loading';
		const view = lotVerdict(lot, firm.facts, tender.now);
		return view === null ? undefined : { view, compared: comparedLine(firm.compared) };
	}
</script>

{#snippet buyers()}
	{#each tender.buyers as buyer, index (index)}
		<span class="buyer" lang={buyer.lang} data-notice-text>{buyer.text}</span>
	{/each}
{/snippet}

{#snippet facts()}
	<div>
		<dt>Deadline</dt>
		<dd>
			{#if deadline.shown.kind === 'in-notice'}
				In notice
			{:else}
				{#if !deadline.open}<span class="closed">Closed</span>{/if}
				<DeadlineTime instant={deadline.shown.instant} />
				{#if deadline.lotsDiffer}<span class="sub">Lots have different deadlines</span>{/if}
			{/if}
		</dd>
	</div>
	{#if tender.timeLeft !== undefined}
		<div>
			<dt>{timeLeftTerm}</dt>
			<dd><span class="mono">{tender.timeLeft}</span></dd>
		</div>
	{/if}
	<div>
		<dt>TED notice</dt>
		<dd><span class="mono">{tender.noticeNumber}</span></dd>
	</div>
	{#if tender.countries.length > 0}
		<div>
			<dt>Country</dt>
			<dd>{tender.countries.join(', ')}</dd>
		</div>
	{/if}
	{#if tender.kind !== undefined}
		<div>
			<dt>Kind</dt>
			<dd>
				{tender.kind.label}, CPV
				<span class="mono">{tender.kind.code}</span>{#if tender.kind.main !== undefined}<span
						class="sub">Main CPV <span class="mono">{tender.kind.main}</span></span
					>{/if}
			</dd>
		</div>
	{/if}
	<div>
		<dt>Estimated value</dt>
		<dd>
			{#if tender.value !== null}<span class="mono">{tender.value}</span>{:else}Value not published{/if}
		</dd>
	</div>
{/snippet}

<Binder board="yellow">
	<Leaf
		id="tender"
		tab={variant === 'example' ? 'Example' : 'Tender'}
		hue="yellow"
		labelledby="tender-title"
		element="article"
		open
	>
		{#snippet children(tab)}
			<LeafGrid>
				{#snippet margin()}
					<Facts head={buyers} label="Tender facts" rows={facts} />
				{/snippet}
				<h1 class="title" id="tender-title" lang={tender.title.lang} data-notice-text>
					{tender.title.text}
				</h1>
				{@render tab()}
				<!-- After the tab, so the tab still follows its heading in DOM order. -->
				{#if tender.cancelIntent}
					<p class="sub" data-cancel-intent>{CANCEL_INTENT_LINE}</p>
				{/if}
				<UnreadStrip />
				<SourceLinks tedUrl={tender.tedUrl} documents={tender.documents} />
				{#if tender.lotIndex.length > 0}
					<nav class="lot-index" aria-labelledby="lot-index-title">
						<Label id="lot-index-title">
							Lots in this notice (<span class="mono">{tender.lotIndex.length}</span>)
						</Label>
						<ol>
							{#each tender.lotIndex as entry (entry.anchor)}
								<li>
									<a href="#{entry.anchor}"
										>Lot {entry.number}{#if entry.title}: <span
												lang={entry.title.lang}
												data-notice-text>{entry.title.text}</span
											>{/if}</a
									>
									{#if entry.deadline.kind === 'in-notice'}
										<span class="sub">In notice</span>
									{:else}
										<span class="sub"
											>{#if entry.closed}<span class="lot-closed">Closed</span>{/if}
											<DeadlineTime instant={entry.deadline.instant} /></span
										>
									{/if}
								</li>
							{/each}
						</ol>
					</nav>
				{/if}
				<RunRecord run={data.readingRun ?? null} />
			</LeafGrid>
		{/snippet}
	</Leaf>

	{#each tender.lots as lot (lot.anchor)}
		<LotLeaf {lot} verdict={verdictOf(lot)} />
	{/each}

	{#if tender.documentsUnread}
		<FacedownLeaf documents={tender.documents} {criteriaShown} />
	{/if}

	<!-- The capture day comes from the capture itself, so a new capture renames it. -->
	<p class="leaf-foot">
		Criteria as published in TED notice <span class="mono">{tender.noticeNumber}</span>. Source:
		TED, the EU's Tenders Electronic Daily, snapshot captured {data.capture.capturedOn}. Not legal
		advice.
	</p>
</Binder>
{#if variant === 'example'}
	<DemoNote capturedOn={data.capture.capturedOn} />
{/if}

<style>
	.buyer {
		display: block;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.buyer + .buyer {
		margin-top: 0.35rem;
	}

	.closed {
		display: block;
		font-weight: 600;
	}

	.sub {
		display: block;
		margin-top: 0.125rem;
		color: var(--ink-2);
	}

	.title {
		max-width: 40ch;
		font: 600 var(--step-4) / 1.1 var(--font-cond);
		letter-spacing: -0.015em;
		text-wrap: balance;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.lot-index {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--acetate-rule);
	}

	/* Each link already names its lot number, so the list carries no second one; seventeen lots
	   pack into columns instead of one long run. */
	.lot-index ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
		gap: 0.75rem 1.75rem;
	}

	.lot-index li {
		max-width: 60ch;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.lot-index .sub {
		font-size: var(--step--1);
	}

	.lot-closed {
		font-weight: 600;
	}

	/* The foot is set on the yellow board itself, so it takes the board's own ink. */
	.leaf-foot {
		max-width: 80ch;
		margin-top: 1rem;
		font-size: var(--step--1);
		font-weight: 500;
		color: var(--on-yellow);
	}

	@media (max-width: 45em) {
		.title {
			font-size: var(--step-3);
		}
	}
</style>
