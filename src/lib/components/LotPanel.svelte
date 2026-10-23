<script lang="ts">
	import type { LangText } from '$lib/ingest/record';
	import { displayRuns } from '$lib/tenders/display-text';
	import type { LotView } from '$lib/tenders/tender-page';
	import type { LotVerdictView } from '$lib/tenders/verdict-view';
	import CoverageList from './CoverageList.svelte';
	import CriterionRow from './CriterionRow.svelte';
	import DeadlineTime from './DeadlineTime.svelte';
	import Icon from './Icon.svelte';
	import Label from './Label.svelte';
	import LoadingLines from './LoadingLines.svelte';
	import LotVerdict from './LotVerdict.svelte';
	import NotReadLine from './NotReadLine.svelte';
	import Panel from './Panel.svelte';
	import ProseRuns from './ProseRuns.svelte';

	// verdict is absent for a lot that keeps the phase 1 view, and 'loading' while the browser has
	// not read which firm to compare with yet. notice is the TED notice every clause is quoted from.
	let {
		lot,
		notice,
		verdict
	}: {
		lot: LotView;
		notice: string;
		verdict?: { view: LotVerdictView; compared: string } | 'loading';
	} = $props();

	const shown = $derived(verdict === undefined || verdict === 'loading' ? undefined : verdict.view);
	const stateOf = (position: number) => shown?.criteria[position - 1];

	// The clause the verdict rests on comes first, right under it, and the rest fold away beneath.
	// With no verdict, or nothing left open, every criterion shows in published order.
	const deciding = $derived.by(() => {
		const position = shown?.deciding ?? null;
		return position === null
			? undefined
			: lot.criteria.find((criterion) => criterion.position === position);
	});
	const others = $derived(lot.criteria.filter((criterion) => criterion !== deciding));

	// The verdict's compared-firm line takes over from the coverage list's "Not compared" line,
	// which would otherwise say the opposite beside it.
	const coverage = $derived(
		verdict === undefined
			? lot.coverage
			: lot.coverage.filter((line) => line.status !== 'Not compared')
	);

	const count = $derived(lot.criteria.length);
	const headingId = $derived(`${lot.anchor}-title`);
	const published = $derived(
		[
			{ label: 'Note on the procedure', texts: lot.procedureNotes },
			{ label: 'Note on this lot', texts: lot.notes },
			{ label: 'Legal form for a group', texts: lot.groupLegalForm ? [lot.groupLegalForm] : [] }
		].filter((entry) => entry.texts.length > 0)
	);
</script>

{#snippet noticeText(text: LangText)}
	<span lang={text.lang} data-notice-text>{text.text}</span>
{/snippet}

<!-- A model answer for a clause this lot does not have holds the lot at ASK FIRST, and no clause
     below would show why, so the lot says it once. -->
{#snippet unplaced()}
	{#if lot.reading?.status === 'read'}
		{#each lot.reading.unplaced ?? [] as line (line)}
			<NotReadLine {line} />
		{/each}
	{/if}
{/snippet}

<!-- A record reads as the portals' do: the lot's name, its verdict, the clause that decides it, the
     other requirements, then the lot's facts with the rest of what the notice publishes. -->
<Panel id={lot.anchor} labelledby={headingId} ruled>
	<div class="lot-name">
		<h2 id={headingId}>Lot {lot.number}</h2>
		{#if lot.title}
			<p class="lot-title">{@render noticeText(lot.title)}</p>
		{/if}
		<p class="lot-id mono">{lot.id}</p>
	</div>

	{#if verdict === 'loading'}
		<div class="verdict-pending">
			<LoadingLines label="Reading the firm profile kept in this browser" />
		</div>
	{:else if verdict !== undefined}
		<LotVerdict view={verdict.view} compared={verdict.compared} />
	{/if}

	<div class="requirements">
		{#if deciding !== undefined}
			<Label>The clause that decides</Label>
			<ol class="clauses">
				<CriterionRow
					criterion={deciding}
					{notice}
					state={stateOf(deciding.position)}
					decides={shown?.decidingQuotes}
				/>
			</ol>
			{#if others.length > 0}
				<details class="others">
					<!-- One text item in the flex row, so the row's gap never opens around the count. -->
					<summary
						><Icon name="chev" /><span
							>Other requirements in this lot (<span class="mono">{others.length}</span>)</span
						></summary
					>
					<ol class="clauses">
						{#each others as criterion (criterion.position)}
							<CriterionRow {criterion} {notice} state={stateOf(criterion.position)} />
						{/each}
					</ol>
				</details>
			{/if}
			{@render unplaced()}
		{:else}
			<Label>Requirements in this lot</Label>
			{#if lot.reading?.status === 'not-read'}
				<NotReadLine line={lot.reading.line} />
			{/if}
			{@render unplaced()}
			{#if count > 0}
				<ol class="clauses">
					{#each lot.criteria as criterion (criterion.position)}
						<CriterionRow {criterion} {notice} state={stateOf(criterion.position)} />
					{/each}
				</ol>
			{:else}
				<p class="note">This lot publishes no selection criteria in the notice.</p>
			{/if}
		{/if}
	</div>

	<dl class="lot-facts">
		<div>
			<dt>Deadline</dt>
			<dd>
				{#if lot.deadline.kind === 'in-notice'}
					In notice
				{:else}
					{#if lot.closed}<span class="closed">Closed</span>{/if}
					<DeadlineTime instant={lot.deadline.instant} />
					<span class="sub">{lot.deadlineKind}</span>
				{/if}
			</dd>
		</div>
		<div>
			<dt>Estimated value</dt>
			<dd>
				{#if lot.value !== null}<span class="mono">{lot.value}</span>{:else}Value not published{/if}
			</dd>
		</div>
		<div>
			<dt>Selection criteria</dt>
			<dd><span class="mono">{count}</span></dd>
		</div>
		{#if lot.criteriaSource !== undefined}
			<div>
				<dt>Criteria source</dt>
				<dd>{lot.criteriaSource}</dd>
			</div>
		{/if}
		<div>
			<dt>Legal basis</dt>
			<dd>
				{#if lot.legalBasis.name !== undefined}{lot.legalBasis.name}{:else}<span class="mono"
						>{lot.legalBasis.code}</span
					>{/if}
				{#each lot.legislation as reference, index (index)}
					<span class="sub"
						><span class="mono">{reference.id}</span>{#if reference.description}, {@render noticeText(
								reference.description
							)}{/if}</span
					>
				{/each}
			</dd>
		</div>
		{#if lot.reserved !== undefined}
			<div>
				<dt>Reserved participation</dt>
				<dd><span class="mono">{lot.reserved}</span></dd>
			</div>
		{:else if lot.reservedUnstated}
			<div>
				<dt>Reserved participation</dt>
				<dd>Not stated in the notice</dd>
			</div>
		{/if}
	</dl>

	{#each published as entry (entry.label)}
		<section class="published" aria-label={entry.label}>
			<Label>{entry.label}</Label>
			{#each entry.texts as text, index (index)}
				<p class="published-text">
					<span lang={text.lang} data-notice-text><ProseRuns runs={displayRuns(text.text)} /></span>
				</p>
			{/each}
		</section>
	{/each}
	<CoverageList lines={coverage} documents={lot.documents} />
</Panel>

<style>
	/* The lot's name and title on one line where they fit. */
	.lot-name {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.125rem 0.75rem;
	}

	h2 {
		font-weight: 700;
		font-size: var(--step-1);
		line-height: 1.3;
	}

	.lot-title {
		flex: 1 1 20rem;
		min-width: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.lot-id {
		font-size: var(--step--1);
		font-weight: 400;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	/* The lot's facts as one strip on a wash, so they read as a set and not as loose lines. They follow
	   the requirements, as the rest of what the notice publishes does. */
	.lot-facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.625rem 1.75rem;
		margin: 1.75rem 0 0;
		padding: 0.75rem 1rem 0.8125rem;
		border-radius: var(--r);
		background: var(--bg-2);
	}

	.lot-facts > div {
		min-width: 0;
		max-width: 22rem;
	}

	dt {
		font-weight: 500;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	dd {
		margin: 0.125rem 0 0;
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	dd .mono {
		font-weight: inherit;
	}

	/* Written as the notice's own closed deadline is: the word, then the date beside it. */
	.closed {
		margin-right: 0.25rem;
	}

	.sub {
		display: block;
		margin-top: 0.125rem;
		font-weight: 400;
		font-size: var(--step--1);
		color: var(--ink-2);
		hyphens: auto;
	}

	.verdict-pending {
		margin-top: 1.25rem;
		padding-block: 1rem;
		border-block: 1px solid var(--line);
	}

	.requirements {
		margin-top: 1.75rem;
	}

	.clauses {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.others {
		margin-top: 0.5rem;
	}

	/* The fold is a bar with its own edge, so the rest of the lot reads as one closed set. */
	summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		padding: 0 1rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r);
		background: var(--bg);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
		transition: background-color var(--quick) ease-out;
	}

	summary:hover {
		background: var(--bg-2);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary :global(.icon) {
		transition: transform var(--quick) ease-out;
	}

	.others[open] > summary :global(.icon) {
		transform: rotate(180deg);
	}

	.others .clauses {
		margin-top: 0.5rem;
	}

	.note {
		max-width: 70ch;
		font-size: var(--step--1);
		color: var(--ink-2);
	}

	.published {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--line);
	}

	/* Drawn for reading as a quote is (display-text.ts): the PDF's hard line ends read as spaces. */
	.published-text {
		max-width: 72ch;
		overflow-wrap: anywhere;
		hyphens: auto;
	}

	.published-text + .published-text {
		margin-top: 0.75rem;
	}
</style>
