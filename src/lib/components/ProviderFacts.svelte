<script lang="ts">
	import FactSource from './FactSource.svelte';

	// The provider facts both trust pages state, each beside the provider page it was read on, so the
	// two pages cannot word the same fact two ways. Tavily's is shown only for a run that searched.
	let { searched }: { searched: boolean } = $props();

	const LEGAL_GUIDE = 'https://docs.tokenfactory.nebius.com/legal/legal-quick-guide';
</script>

<div class="fact">
	<p>
		The region is the one the provider's model list names for this model. For a public model
		endpoint, Nebius says the processing location is decided dynamically and is not tied to any
		single data center.
	</p>
	<FactSource href={LEGAL_GUIDE}>Nebius Token Factory, Legal Quick Guide, 5.1</FactSource>
</div>
<div class="fact">
	<p>
		Zero Data Retention is switched on for the account that runs the read. With it, Nebius says,
		inputs and outputs are not stored on its systems after each request is processed, and are not
		used to train, fine-tune or improve any model.
	</p>
	<FactSource href={LEGAL_GUIDE}>Nebius Token Factory, Legal Quick Guide, 4.1</FactSource>
</div>
{#if searched}
	<div class="fact">
		<p>
			Only when the buyer search runs, the buyer's name and fixed search words are sent to Tavily.
			Tavily's privacy policy says it is a US based entity, may use query data to improve its
			responses to future queries unless a contract says otherwise, and may share query data with
			third-party search index providers.
		</p>
		<FactSource href="https://tavily.com/privacy">Tavily Privacy Policy</FactSource>
	</div>
	<div class="fact">
		<p>
			Since 20 October 2026, the setting "Allow use of query data" is switched off for the Tavily
			account that runs the search. With it off, Tavily says, query data is not stored or used for
			improvements. A search made before that day is not covered: the buyer search recorded on 15
			October 2026 was made while the setting was still on.
		</p>
		<FactSource
			href="https://help.tavily.com/articles/4205958832-understanding-the-allow-use-of-query-data-setting"
			>Tavily Help Center, the Allow use of query data setting</FactSource
		>
	</div>
{/if}

<style>
	.fact {
		max-width: 70ch;
		margin-top: 1.25rem;
	}
</style>
