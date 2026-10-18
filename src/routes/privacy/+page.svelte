<script module lang="ts">
	// What this browser keeps, and what never leaves it, in the words the page states.
	export const PROFILE_STAYS: readonly [string, string, string] = [
		'The firm profile you enter is kept in this browser only, in its local storage, and is never sent to a server.',
		'Your theme choice, and whether the demo firm is shown, are kept in this browser the same way.',
		'No firm profile, contact or personal data is sent to the model or the search provider.'
	];
</script>

<script lang="ts">
	import Binder from '$lib/components/Binder.svelte';
	import Button from '$lib/components/Button.svelte';
	import ExternalIcon from '$lib/components/ExternalIcon.svelte';
	import FactSource from '$lib/components/FactSource.svelte';
	import Facts from '$lib/components/Facts.svelte';
	import Leaf from '$lib/components/Leaf.svelte';
	import LeafGrid from '$lib/components/LeafGrid.svelte';
	import ProviderFacts from '$lib/components/ProviderFacts.svelte';

	let { data } = $props();

	const searched = $derived(data.providers.includes('Tavily'));
</script>

<svelte:head>
	<title>Privacy - Pagefifty</title>
	<meta
		name="description"
		content="What Pagefifty processes, where and by which provider, what stays in your browser, and how to remove the stored firm profile."
	/>
</svelte:head>

<Binder board="violet">
	<Leaf id="processing" tab="Data" hue="violet" labelledby="privacy-title" open>
		{#snippet children(tab)}
			<LeafGrid legal={false}>
				{#snippet margin()}
					<Facts head="Who processes what">
						{#snippet rows()}
							<dt>Hosting</dt>
							<dd>Cloudflare</dd>
							{#if data.run}
								<dt>Model provider</dt>
								<dd data-fact="provider">{data.run.provider}</dd>
								<dt>Model region</dt>
								<dd class="mono" data-fact="region">{data.run.region}</dd>
							{/if}
							{#if searched}
								<dt>Web search</dt>
								<dd>Tavily</dd>
							{/if}
							<dt>Firm profile</dt>
							<dd>This browser only</dd>
						{/snippet}
					</Facts>
				{/snippet}
				<h1 id="privacy-title">Privacy</h1>
				{@render tab()}
				<p class="opening">
					What Pagefifty processes, where, and by which provider. This page states facts, not a
					legal assessment.
				</p>
				<div class="fact">
					<p>Cloudflare hosts the site and serves its pages from its network.</p>
					<FactSource href="https://developers.cloudflare.com/workers/static-assets/"
						>Cloudflare Workers, Static Assets</FactSource
					>
				</div>
				<div class="fact">
					<p>
						As data processor under its privacy policy, Cloudflare receives the technical data of
						each request, such as your IP address.
					</p>
					<FactSource href="https://www.cloudflare.com/privacypolicy/"
						>Cloudflare Privacy Policy</FactSource
					>
				</div>
				<p class="fact">
					The site sets no cookie and runs no analytics, and your browser loads its scripts, fonts
					and images from this site only.
				</p>
				{#if data.run}
					<p class="fact">
						At capture time only, on the maintainer's machine and never during your visit, the
						public criteria text of each read lot is sent to {data.run.provider}.
					</p>
					<ProviderFacts {searched} />
				{:else}
					<p class="fact">
						No model read is recorded yet, so no text has gone to a model provider.
					</p>
				{/if}
			</LeafGrid>
		{/snippet}
	</Leaf>

	<Leaf id="browser" tab="Profile" hue="violet" labelledby="browser-title">
		{#snippet children(tab)}
			<LeafGrid legal={false}>
				{#snippet margin()}
					<Facts head="What stays in your browser" headingId="browser-title" />
					{@render tab()}
				{/snippet}
				{#each PROFILE_STAYS as sentence (sentence)}
					<p class="statement">{sentence}</p>
				{/each}
			</LeafGrid>
		{/snippet}
	</Leaf>

	<Leaf id="remove" tab="Remove" hue="violet" labelledby="remove-title">
		{#snippet children(tab)}
			<LeafGrid legal={false}>
				{#snippet margin()}
					<Facts head="Removing the stored profile" headingId="remove-title" />
					{@render tab()}
				{/snippet}
				<p class="statement">
					On the firm profile page, Remove the stored profile deletes it from this browser after you
					confirm.
				</p>
				<p class="statement">
					Your browser's own setting for clearing site data removes it too, with everything else
					this site stored in the browser.
				</p>
				<p class="statement">
					A profile file you exported and keep elsewhere is your own copy, and nothing here removes
					it.
				</p>
				<div class="to-profile">
					<Button variant="secondary" href="/profile">Open the firm profile</Button>
				</div>
			</LeafGrid>
		{/snippet}
	</Leaf>

	<Leaf id="contact" tab="Contact" hue="violet" labelledby="contact-title">
		{#snippet children(tab)}
			<LeafGrid>
				{#snippet margin()}
					<Facts head="Questions" headingId="contact-title" />
					{@render tab()}
				{/snippet}
				<p class="statement">
					Questions about this page go to the issue page of the Pagefifty repository.
				</p>
				<p class="contact">
					<a href="https://github.com/voyagi/pagefifty/issues" rel="external noreferrer"
						>Open the issue page of the Pagefifty repository<ExternalIcon /></a
					>
				</p>
			</LeafGrid>
		{/snippet}
	</Leaf>
</Binder>

<style>
	.statement + .statement {
		margin-top: 1rem;
	}

	.statement,
	.opening {
		max-width: 52ch;
		line-height: 1.45;
		font-size: var(--step-1);
		text-wrap: pretty;
	}

	h1 {
		max-width: 20ch;
		text-wrap: balance;
		letter-spacing: -0.015em;
		font: 600 var(--step-4) / 1.1 var(--font-cond);
	}

	.opening {
		margin-top: 1rem;
	}

	.fact {
		margin-top: 1.25rem;
		max-width: 70ch;
	}

	.contact {
		margin-top: 0.75rem;
	}

	.contact a {
		display: inline-block;
		padding-block: 0.625rem;
		overflow-wrap: anywhere;
	}

	.to-profile {
		margin-top: 1.5rem;
	}

	@media (max-width: 45em) {
		h1 {
			font-size: var(--step-3);
		}
	}
</style>
