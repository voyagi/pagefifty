<script module lang="ts">
	// The two things a verdict on this site never covers, said in exactly these words.
	export const AI_LIMITS: readonly [string, string] = [
		"A Go covers only the selection criteria read in the notice, never the exclusion grounds, the procurement documents or the buyer's shortlisting.",
		'Where a buyer names a category of references, staff or business lines, only the firm can judge whether its own match, so that criterion reads Ask first.'
	];
</script>

<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Facts from '$lib/components/Facts.svelte';
	import PageMain from '$lib/components/PageMain.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import PanelGrid from '$lib/components/PanelGrid.svelte';
	import ProviderFacts from '$lib/components/ProviderFacts.svelte';
	import RunRecord from '$lib/components/RunRecord.svelte';

	let { data } = $props();

	const searched = $derived(data.providers.includes('Tavily'));
</script>

<svelte:head>
	<title>How the AI is used - Pagefifty</title>
	<meta
		name="description"
		content="Which model reads the tender criteria for Pagefifty, where it runs, what it keeps, what code decides, and what a verdict does not cover."
	/>
</svelte:head>

<PageMain>
	<Panel id="model" labelledby="ai-title">
		<PanelGrid legal={false}>
			{#snippet margin()}
				<Facts head="The model and where it runs">
					{#snippet rows()}
						{#if data.run}
							<dt>Model</dt>
							<dd class="mono" data-fact="model">{data.run.model}</dd>
							<dt>Provider</dt>
							<dd data-fact="provider">{data.run.provider}</dd>
							<dt>Region</dt>
							<dd class="mono" data-fact="region">{data.run.region}</dd>
							<dt>Data retention</dt>
							<dd>Zero Data Retention on</dd>
							{#if searched}
								<dt>Web search</dt>
								<dd data-fact="search-provider">Tavily</dd>
							{/if}
						{/if}
					{/snippet}
				</Facts>
			{/snippet}
			<h1 id="ai-title">How the AI is used</h1>
			<p class="lede">
				When the snapshot is captured, one model reads the published selection criteria of the
				tender lots the capture run sends it. The criteria of a lot without a reading are shown as
				published and not compared with your firm. The site shows those readings as recorded and
				calls no model while you read.
			</p>
			{#if data.run}
				<p class="fact">
					Only the public criteria text of each lot is sent to the model. No firm profile, contact
					or personal data is sent to the model or the search provider.
				</p>
				<ProviderFacts {searched} />
			{/if}
		</PanelGrid>
	</Panel>

	<Panel id="code" labelledby="code-title">
		<PanelGrid legal={false}>
			{#snippet margin()}
				<Facts head="What code decides" headingId="code-title" />
			{/snippet}
			<p class="reading">
				The model points at the clause that states each requirement, quotes it, and writes a plain
				English reading of it. Each reading on a tender page carries an AI reading label.
			</p>
			<p class="reading">
				Code checks every quote against the notice's own text and rejects any quote it cannot find
				there. Code reads every figure from the checked quote, compares it with the firm profile in
				your browser, and decides each criterion's state and each lot's verdict. The model decides
				no state and no verdict.
			</p>
		</PanelGrid>
	</Panel>

	<Panel id="limits" labelledby="limits-title">
		<PanelGrid legal={false}>
			{#snippet margin()}
				<Facts head="What a verdict does not cover" headingId="limits-title" />
			{/snippet}
			{#each AI_LIMITS as limit (limit)}
				<p class="reading">{limit}</p>
			{/each}
		</PanelGrid>
	</Panel>

	<Panel id="run" labelledby="run-title">
		<PanelGrid>
			{#snippet margin()}
				<Facts head="The recorded run" headingId="run-title" />
			{/snippet}
			{#if data.run}
				<p class="reading">
					This run read the capture of <span class="mono">{data.capture}</span>. The example run
					shows its readings on each tender page.
				</p>
				<RunRecord run={data.run} />
				<div class="actions">
					<Button variant="secondary" href="/example">Open the example run</Button>
				</div>
			{:else}
				<p class="reading" data-run-record>No model read is recorded yet.</p>
			{/if}
		</PanelGrid>
	</Panel>
</PageMain>

<style>
	h1 {
		max-width: 20ch;
		font-weight: 750;
		font-size: var(--step-3);
		line-height: 1.15;
		letter-spacing: -0.03em;
		text-wrap: balance;
	}

	.lede,
	.reading {
		max-width: 52ch;
		font-size: var(--step-1);
		line-height: 1.45;
		text-wrap: pretty;
	}

	.lede {
		margin-top: 1rem;
	}

	.reading + .reading {
		margin-top: 1rem;
	}

	.fact {
		max-width: 70ch;
		margin-top: 1.25rem;
	}

	.actions {
		margin-top: 1.5rem;
	}
</style>
