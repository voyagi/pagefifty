<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import PageMain from '$lib/components/PageMain.svelte';
	import Panel from '$lib/components/Panel.svelte';

	const notFound = $derived(page.status === 404);
	// Every 4xx but the 404 answered above is the request's fault, never the server's: the built
	// Worker answers a lone % or a malformed escape with 400 and a browser form posted to a page with
	// no form actions with 405, so a reload would only repeat it.
	const refused = $derived(page.status >= 400 && page.status < 500);
	// The notice number reaches this page from the address too, so it is masked like the path. An
	// unknown-notice error that names no notice, or only blanks (/tenders/%20 arrives as a space), has
	// nothing to name, so it reads as an unknown path.
	const notice = $derived(
		notFound && page.error?.kind === 'unknown-notice' && page.error.notice?.trim()
			? masked(page.error.notice)
			: undefined
	);
	// Widened to string for the same reason: an error page is reached from any path at all.
	const path = $derived<string>(page.url.pathname);
	const onExample = $derived(path === '/example' || path.startsWith('/example/'));
	// / and /tenders read the same index, so on either one the list is no way out of the failure.
	const readsIndex = $derived(path === '/' || path === '/tenders');
	// The loader that refused the notice names the days of the snapshot its route reads, so /tenders
	// and /example each name their own capture.
	const snapshot = $derived(
		page.error?.capturedOn ? `the ${page.error.capturedOn} snapshot` : 'the snapshot'
	);
	const publication = $derived(
		page.error?.firstPublished
			? `published before ${page.error.firstPublished} or after the capture`
			: 'published after the capture'
	);
	const heading = $derived.by(() => {
		if (notice !== undefined) return 'No tender with this notice number';
		if (notFound) return 'No page at this address';
		if (refused) return 'This request could not be answered';
		return 'This page could not be built';
	});

	const REPLACEMENT_MARK = String.fromCodePoint(0xfffd);

	// A control or direction character shows as the replacement mark, so echoed text cannot reorder
	// or hide the words around it.
	function masked(text: string): string {
		return text.replace(/[\p{Cc}\p{Cf}]/gu, REPLACEMENT_MARK);
	}

	// The address arrives percent-encoded, but the visitor typed letters, so the letters come back.
	// Decoded as the router reads it: an escape for a slash, a question mark, a hash or a percent sign
	// stays one, since decoded it would name another address. A malformed escape stays as sent.
	function readable(pathname: string): string {
		let decoded = pathname;
		try {
			decoded = pathname.split('%25').map(decodeURI).join('%25');
		} catch (error) {
			if (!(error instanceof URIError)) throw error;
		}
		return masked(decoded);
	}
</script>

<svelte:head>
	<title
		>{notFound
			? 'Page not found - Pagefifty'
			: refused
				? 'Request not answered - Pagefifty'
				: 'This page could not be built - Pagefifty'}</title
	>
</svelte:head>

<PageMain>
	<Panel id="error" labelledby="error-title">
		<!-- The status code follows the heading as a small tag, so the heading still opens the page. -->
		<div class="head">
			<h1 id="error-title">{heading}</h1>
			<p class="status-tag mono">{page.status}</p>
		</div>
		{#if notice !== undefined}
			<p class="lede">
				Notice <span class="mono echo">{notice}</span> is not in {snapshot}. It may be outside the
				IT, Netherlands, Belgium and Germany scope, {publication}, not a call for tenders TED listed
				as active that day, an earlier version or a copy of a notice TED published again, or
				cancelled by its buyer.
			</p>
			<div class="actions">
				{#if onExample}
					<Button href="/example">Back to the example run</Button>
					<Button variant="secondary" href="/tenders">Browse open tenders</Button>
				{:else}
					<Button href="/tenders">Browse open tenders</Button>
				{/if}
			</div>
		{:else if notFound}
			<p class="lede">Check the address for a typo, or go back to the open tenders.</p>
			<p class="mono echo path">{readable(path)}</p>
			<div class="actions">
				<Button href="/tenders">Browse open tenders</Button>
			</div>
		{:else if refused}
			<p class="lede">
				The address, or the way it was sent, is not one this site can answer, so reloading will not
				help. Check the address for a typo, or go back to the open tenders.
			</p>
			<p class="mono echo path">{readable(path)}</p>
			<div class="actions">
				<Button href="/tenders">Browse open tenders</Button>
			</div>
		{:else}
			<p class="lede">
				The server hit an error while building this page. Reload in a minute.
				{#if !readsIndex}If it keeps happening, the list of open tenders may still work.{/if}
			</p>
			<div class="actions">
				<Button href="/tenders">Browse open tenders</Button>
			</div>
		{/if}
	</Panel>
</PageMain>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.875rem;
	}

	h1 {
		max-width: 24ch;
		font-weight: 750;
		font-size: var(--step-3);
		line-height: 1.15;
		letter-spacing: -0.03em;
		text-wrap: balance;
	}

	.status-tag {
		display: inline-flex;
		align-items: center;
		height: 24px;
		padding: 0 0.5625rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r-sm);
		color: var(--ink-2);
		font-size: 0.78125rem;
	}

	.lede {
		max-width: 52ch;
		margin-top: 1rem;
		font-size: var(--step-1);
		line-height: 1.45;
		text-wrap: pretty;
	}

	/* Whatever a stranger typed comes back as text, and a path with no break in it still wraps. */
	.echo {
		overflow-wrap: anywhere;
		color: var(--ink);
	}

	.path {
		margin-top: 1rem;
		max-width: 70ch;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}
</style>
