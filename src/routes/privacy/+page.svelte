<script module lang="ts">
	// What this browser keeps, and what never leaves it, in the words the page states.
	export const PROFILE_STAYS: readonly [string, string, string] = [
		'The firm profile you enter is kept in this browser only, in its local storage, and is never sent to a server.',
		'Your theme choice, and whether the demo firm is shown, are kept in this browser the same way.',
		'No firm profile, contact or personal data is sent to the model or the search provider.'
	];

	// The one address the page gives for questions and requests about personal data.
	export const CONTACT_ADDRESS = 'pagefifty@taranity.com';
</script>

<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import ExternalIcon from '$lib/components/ExternalIcon.svelte';
	import FactSource from '$lib/components/FactSource.svelte';
	import Facts from '$lib/components/Facts.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import PageMain from '$lib/components/PageMain.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import PanelGrid from '$lib/components/PanelGrid.svelte';
	import ProviderFacts from '$lib/components/ProviderFacts.svelte';

	let { data } = $props();

	const searched = $derived(data.providers.includes('Tavily'));
</script>

<PageHead
	title="Privacy - Pagefifty"
	description="What Pagefifty processes, where and by which provider, what stays in your browser, and how to remove the stored firm profile."
/>

<PageMain>
	<Panel id="processing" labelledby="privacy-title">
		<PanelGrid legal={false}>
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
			<p class="opening">
				What Pagefifty processes, where, and by which provider. This page states facts, not a legal
				assessment.
			</p>
			<div class="fact">
				<p>Cloudflare hosts the site and serves its pages from its network.</p>
				<FactSource href="https://developers.cloudflare.com/workers/static-assets/"
					>Cloudflare Workers, Static Assets</FactSource
				>
			</div>
			<div class="fact">
				<p>
					As data processor under its privacy policy, Cloudflare receives the technical data of each
					request, such as your IP address.
				</p>
				<FactSource href="https://www.cloudflare.com/privacypolicy/"
					>Cloudflare Privacy Policy</FactSource
				>
			</div>
			<p class="fact">
				The site sets no cookie and runs no analytics, and your browser loads its scripts, fonts and
				images from this site only.
			</p>
			{#if data.run}
				<p class="fact">
					At capture time only, on the maintainer's machine and never during your visit, the public
					criteria text of each read lot is sent to {data.run.provider}.
				</p>
				<ProviderFacts {searched} />
			{:else}
				<p class="fact">No model read is recorded yet, so no text has gone to a model provider.</p>
			{/if}
		</PanelGrid>
	</Panel>

	<Panel id="browser" labelledby="browser-title">
		<PanelGrid legal={false}>
			{#snippet margin()}
				<Facts head="What stays in your browser" headingId="browser-title" />
			{/snippet}
			{#each PROFILE_STAYS as sentence (sentence)}
				<p class="statement">{sentence}</p>
			{/each}
		</PanelGrid>
	</Panel>

	<Panel id="remove" labelledby="remove-title">
		<PanelGrid legal={false}>
			{#snippet margin()}
				<Facts head="Removing the stored profile" headingId="remove-title" />
			{/snippet}
			<p class="statement">
				On the firm profile page, Remove the stored profile deletes it from this browser after you
				confirm.
			</p>
			<p class="statement">
				Your browser's own setting for clearing site data removes it too, with everything else this
				site stored in the browser.
			</p>
			<p class="statement">
				A profile file you exported and keep elsewhere is your own copy, and nothing here removes
				it.
			</p>
			<div class="to-profile">
				<Button variant="secondary" href="/profile">Open the firm profile</Button>
			</div>
		</PanelGrid>
	</Panel>

	<Panel id="controller" labelledby="controller-title">
		<PanelGrid legal={false}>
			{#snippet margin()}
				<Facts head="Who is responsible" headingId="controller-title" />
			{/snippet}
			<p class="statement">
				The maintainer of Pagefifty is the controller of the personal data this site processes, and
				answers by email.
			</p>
			<p class="contact">
				<a href="mailto:{CONTACT_ADDRESS}">{CONTACT_ADDRESS}</a>
			</p>
			<p class="statement">
				The legal basis for the technical data of each request is legitimate interest, under GDPR
				Article 6(1)(f), and the interest is answering your request for a page.
			</p>
			<p class="statement">
				The maintainer keeps no log of these requests, because the site's request logging at
				Cloudflare is switched off.
			</p>
			<p class="statement">
				A message you send to that address is processed on the same basis, to answer it, and is kept
				no longer than answering it needs.
			</p>
		</PanelGrid>
	</Panel>

	<Panel id="contact" labelledby="contact-title">
		<PanelGrid>
			{#snippet margin()}
				<Facts head="Your rights" headingId="contact-title" />
			{/snippet}
			<p class="statement">
				At that address you can ask to see, correct or erase personal data about you, to limit how
				it is processed, or to object to its processing. Questions about this page go there too.
			</p>
			<p class="statement">
				You can also complain to a data protection authority: the Dutch one, the <span lang="nl"
					>Autoriteit Persoonsgegevens</span
				>, or the one in the EU country where you live or work.
			</p>
			<p class="contact">
				<a
					href="https://www.autoriteitpersoonsgegevens.nl/en/submitting-a-tip-off-or-a-complaint-to-the-ap"
					rel="external noreferrer"
					>Complain to the <span lang="nl">Autoriteit Persoonsgegevens</span><ExternalIcon /></a
				>
			</p>
		</PanelGrid>
	</Panel>
</PageMain>

<style>
	.statement + .statement {
		margin-top: 1rem;
	}

	.statement,
	.opening {
		max-width: 62ch;
		line-height: 1.5;
		font-size: var(--step-1);
		text-wrap: pretty;
	}

	h1 {
		max-width: 20ch;
		text-wrap: balance;
		font-weight: 750;
		font-size: var(--step-3);
		line-height: 1.15;
		letter-spacing: -0.03em;
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
</style>
