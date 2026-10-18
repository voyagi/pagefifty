<script module lang="ts">
	// The two things a verdict on this site never covers, said in exactly these words.
	export const AI_LIMITS: readonly [string, string] = [
		"A Go covers only the selection criteria read in the notice, never the exclusion grounds, the procurement documents or the buyer's shortlisting.",
		'Where a buyer names a category of references, staff or business lines, only the firm can judge whether its own match, so that criterion reads Ask first.'
	];

	const LEGAL_GUIDE = 'https://docs.tokenfactory.nebius.com/legal/legal-quick-guide';
	const TAVILY_PRIVACY = 'https://tavily.com/privacy';
</script>

<script lang="ts">
	import Binder from '$lib/components/Binder.svelte';
	import Button from '$lib/components/Button.svelte';
	import FactSource from '$lib/components/FactSource.svelte';
	import Facts from '$lib/components/Facts.svelte';
	import Leaf from '$lib/components/Leaf.svelte';
	import LeafGrid from '$lib/components/LeafGrid.svelte';
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

<Binder board="grass">
	<Leaf id="model" tab="Model" hue="grass" labelledby="ai-title" open>
		{#snippet children(tab)}
			<LeafGrid legal={false}>
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
				{@render tab()}
				<p class="lede">
					One model reads the published selection criteria of each tender lot when the snapshot is
					captured. The site shows those readings as recorded and calls no model while you read.
				</p>
				{#if data.run}
					<div class="fact">
						<p>
							The region is the one the provider's model list names for this model. For a public
							model endpoint, Nebius says the processing location is decided dynamically and is not
							tied to any single data center.
						</p>
						<FactSource href={LEGAL_GUIDE}>Nebius Token Factory, Legal Quick Guide, 5.1</FactSource>
					</div>
					<div class="fact">
						<p>
							Zero Data Retention is switched on for the account that runs the read. With it, Nebius
							says, inputs and outputs are not stored on its systems after each request is
							processed, and are not used to train, fine-tune or improve any model.
						</p>
						<FactSource href={LEGAL_GUIDE}>Nebius Token Factory, Legal Quick Guide, 4.1</FactSource>
					</div>
					<p class="fact">
						Only the public criteria text of each lot is sent to the model. No firm profile, contact
						or personal data is sent.
					</p>
					{#if searched}
						<div class="fact">
							<p>
								The buyer search of this run used Tavily, which receives the buyer's name and fixed
								search words. Tavily's privacy policy says it is a US based entity, may use query
								data to improve its responses to future queries unless a contract says otherwise,
								and may share query data with third-party search index providers.
							</p>
							<FactSource href={TAVILY_PRIVACY}>Tavily Privacy Policy</FactSource>
						</div>
					{/if}
				{/if}
			</LeafGrid>
		{/snippet}
	</Leaf>

	<Leaf id="code" tab="Code" hue="grass" labelledby="code-title">
		{#snippet children(tab)}
			<LeafGrid legal={false}>
				{#snippet margin()}
					<Facts head="What code decides" headingId="code-title" />
					{@render tab()}
				{/snippet}
				<p class="reading">
					The model points at the clause that states each requirement, quotes it, and writes a plain
					English reading of it. Each reading on a tender page carries an AI reading label.
				</p>
				<p class="reading">
					Code checks every quote against the notice's own text and rejects any quote it cannot find
					there. Code reads every figure from the checked quote, compares it with the firm profile
					in your browser, and decides each criterion's state and each lot's verdict. The model
					decides no state and no verdict.
				</p>
			</LeafGrid>
		{/snippet}
	</Leaf>

	<Leaf id="limits" tab="Limits" hue="grass" labelledby="limits-title">
		{#snippet children(tab)}
			<LeafGrid legal={false}>
				{#snippet margin()}
					<Facts head="What a verdict does not cover" headingId="limits-title" />
					{@render tab()}
				{/snippet}
				{#each AI_LIMITS as limit (limit)}
					<p class="reading">{limit}</p>
				{/each}
			</LeafGrid>
		{/snippet}
	</Leaf>

	<Leaf id="run" tab="Run" hue="grass" labelledby="run-title">
		{#snippet children(tab)}
			<LeafGrid>
				{#snippet margin()}
					<Facts head="The recorded run" headingId="run-title" />
					{@render tab()}
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
			</LeafGrid>
		{/snippet}
	</Leaf>
</Binder>

<style>
	h1 {
		max-width: 20ch;
		font: 600 var(--step-4) / 1.1 var(--font-cond);
		letter-spacing: -0.015em;
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

	@media (max-width: 45em) {
		h1 {
			font-size: var(--step-3);
		}
	}
</style>
