<script lang="ts" module>
	export const SITE_DESCRIPTION =
		"Pagefifty checks whether your firm meets a tender's published selection criteria, and quotes each clause from the tender's own text with its source.";
</script>

<script lang="ts">
	let { title, description = SITE_DESCRIPTION }: { title: string; description?: string } = $props();
</script>

<!-- Every page's title and description, given again as Open Graph tags so a link pasted into a chat
	 or a post shows the page's own words. A page with no description of its own uses the site's. -->
<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Pagefifty" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
</svelte:head>
