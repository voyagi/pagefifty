<script lang="ts">
	import { onMount } from 'svelte';
	import { DEMO_FIRM_NAME, DEMO_PROFILE } from '$lib/profile/demo-firm';
	import type { getProfileStore } from '$lib/profile/store.svelte';
	import { CANCEL_INTENT_LINE, initialsOf } from '$lib/tenders/list';
	import type { LotView, TenderPageData } from '$lib/tenders/tender-page';
	import {
		comparedLine,
		lotVerdict,
		type ComparedFirm,
		type FirmFacts
	} from '$lib/tenders/verdict-view';
	import BuyerSearch from './BuyerSearch.svelte';
	import DeadlineTime from './DeadlineTime.svelte';
	import ExternalIcon from './ExternalIcon.svelte';
	import Icon from './Icon.svelte';
	import Label from './Label.svelte';
	import LotPanel from './LotPanel.svelte';
	import RunRecord from './RunRecord.svelte';
	import SourceLinks from './SourceLinks.svelte';
	import UnreadDocuments from './UnreadDocuments.svelte';
	import UnreadStrip from './UnreadStrip.svelte';

	// One tender, as the pane beside the list shows it and as its own address shows it on a phone.
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
	// A joint procurement names many buyers: the head names the first and counts the rest, and the
	// facts below name every one.
	const lead = $derived(tender.buyers[0]);
	const others = $derived(tender.buyers.length - 1);
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
		const view = lotVerdict(lot, firm.facts, tender.now, tender.documents);
		return view === null ? undefined : { view, compared: comparedLine(firm.compared) };
	}
</script>

<article class="record" aria-labelledby="tender-title">
	<header class="head" id="tender">
		<div class="who">
			{#if lead}<span class="tile" aria-hidden="true">{initialsOf(lead.text)}</span>{/if}
			<p class="who-text">
				<span class="buyer-line">
					{#if lead}
						<span class="buyer" lang={lead.lang} data-notice-text>{lead.text}</span>
					{/if}
					{#if others > 0}
						<span class="others"
							>and <span class="mono">{others}</span>
							{others === 1 ? 'other buyer' : 'other buyers'}</span
						>
					{/if}
				</span>
				{#if tender.countries.length > 0}
					<span class="where">{tender.countries.join(', ')}</span>
				{/if}
			</p>
		</div>
		<!-- Focusable from script only: on a phone, opening a tender moves focus here. -->
		<h1 class="title" id="tender-title" tabindex="-1" lang={tender.title.lang} data-notice-text>
			{tender.title.text}
		</h1>
		{#if tender.cancelIntent}
			<p class="cancel" data-cancel-intent>{CANCEL_INTENT_LINE}</p>
		{/if}
		<aside aria-label="Tender facts">
			<dl class="facts">
				<div>
					<dt><Icon name="cal" />Deadline</dt>
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
						<dt><Icon name="clock" />{timeLeftTerm}</dt>
						<dd><span class="mono">{tender.timeLeft}</span></dd>
					</div>
				{/if}
				<div>
					<dt><Icon name="euro" />Estimated value</dt>
					<dd>
						{#if tender.value !== null}<span class="mono">{tender.value}</span>{:else}Value not
							published{/if}
					</dd>
				</div>
				<div>
					<dt><Icon name="doc" />TED notice</dt>
					<dd>
						<a href={tender.tedUrl} rel="external noreferrer"
							><span class="mono">{tender.noticeNumber}</span><ExternalIcon /></a
						>
					</dd>
				</div>
			</dl>
		</aside>
		<SourceLinks tedUrl={tender.tedUrl} documents={tender.documents} />
		<UnreadStrip />
	</header>

	{#each tender.lots as lot (lot.anchor)}
		<LotPanel {lot} notice={tender.noticeNumber} verdict={verdictOf(lot)} />
	{/each}

	{#if tender.search !== undefined}
		<BuyerSearch search={tender.search} />
	{/if}

	{#if tender.documentsUnread}
		<UnreadDocuments documents={tender.documents} {criteriaShown} />
	{/if}

	<!-- The capture day comes from the capture itself, so a new capture renames it. -->
	<p class="record-foot">
		Criteria as published in TED notice <span class="mono">{tender.noticeNumber}</span>. Source:
		TED, the EU's Tenders Electronic Daily, snapshot captured {data.capture.capturedOn}. Not legal
		advice.
	</p>

	<section class="about" aria-labelledby="about-title">
		<h2 class="about-head" id="about-title">About this tender</h2>
		{#if others > 0 || tender.kind !== undefined}
			<dl class="about-facts">
				{#if others > 0}
					<div class="wide">
						<dt>Buyers</dt>
						<dd>
							<ul class="buyers">
								{#each tender.buyers as buyer, index (index)}
									<li lang={buyer.lang} data-notice-text>{buyer.text}</li>
								{/each}
							</ul>
						</dd>
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
			</dl>
		{/if}
		{#if tender.lotIndex.length > 0}
			<nav class="lot-index" aria-labelledby="lot-index-title">
				<Label id="lot-index-title">
					Lots in this notice (<span class="mono">{tender.lotIndex.length}</span>)
				</Label>
				<ol>
					{#each tender.lotIndex as entry (entry.anchor)}
						<li>
							<a href="#{entry.anchor}"
								>Lot {entry.number}{#if entry.title}: <span lang={entry.title.lang} data-notice-text
										>{entry.title.text}</span
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
	</section>
</article>

<style>
	.who {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.tile {
		display: grid;
		flex: none;
		place-items: center;
		width: 52px;
		height: 52px;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--bg-2);
		color: var(--ink-2);
		font-weight: 700;
		font-size: 1rem;
		letter-spacing: -0.02em;
	}

	.who-text {
		min-width: 0;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.buyer-line,
	.where {
		display: block;
	}

	.buyer {
		font-size: var(--step-0);
		font-weight: 650;
		color: var(--ink);
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	/* Focus lands here by script after a tender opens; the heading is not a control, so it draws no
	   ring for that. */
	.title {
		max-width: 30ch;
		margin-top: 1rem;
		font-weight: 750;
		font-size: var(--step-3);
		line-height: 1.15;
		letter-spacing: -0.03em;
		text-wrap: balance;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.title:focus {
		outline: none;
	}

	.cancel {
		max-width: 62ch;
		margin-top: 0.5rem;
		font-weight: 600;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
		margin: 0.875rem 0 0;
	}

	.facts > div {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 0.375rem;
	}

	dt {
		font-weight: 500;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.facts dt :global(.icon) {
		margin-right: 0.375rem;
		vertical-align: -3px;
	}

	dd {
		margin: 0;
		font-weight: 600;
	}

	dd .mono {
		font-weight: inherit;
	}

	.facts a {
		text-decoration-color: var(--line-2);
	}

	.facts a:hover {
		text-decoration-color: currentColor;
	}

	.closed {
		margin-right: 0.375rem;
	}

	.sub {
		display: block;
		margin-top: 0.125rem;
		font-weight: 400;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	/* The first lot follows the head, not another panel, so it takes the panel rule from here. */
	.head + :global(.panel) {
		margin-top: 2rem;
		padding-top: 1.75rem;
		border-top: 1px solid var(--line);
	}

	.record-foot {
		max-width: 80ch;
		margin-top: 2.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.about {
		margin-top: 2rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--line);
	}

	.about-head {
		font-weight: 700;
		font-size: 1rem;
		letter-spacing: -0.01em;
	}

	.about-facts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
		gap: 0.875rem 1.5rem;
		margin: 0.875rem 0 0;
	}

	.about-facts .wide {
		grid-column: 1 / -1;
	}

	.about-facts dd {
		margin-top: 0.125rem;
	}

	.buyers {
		margin: 0;
		padding: 0;
		list-style: none;
		columns: 16rem auto;
		column-gap: 1.5rem;
	}

	.buyers li {
		overflow-wrap: anywhere;
		hyphens: auto;
		break-inside: avoid;
	}

	.lot-index {
		margin-top: 1.25rem;
	}

	/* Each link already names its lot number, so the list carries no second one; seventeen lots
	   pack into columns instead of one long run. */
	.lot-index ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
		gap: 0.75rem 1.75rem;
	}

	.lot-index li {
		max-width: 60ch;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.lot-closed {
		font-weight: 600;
	}
</style>
