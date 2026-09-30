<script lang="ts">
	import { page } from '$app/state';
	import Binder from '$lib/components/Binder.svelte';
	import Button from '$lib/components/Button.svelte';
	import Leaf from '$lib/components/Leaf.svelte';

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

<Binder board="slate">
	<Leaf id="error" tab={String(page.status)} tabMono hue="slate" labelledby="error-title" open>
		{#snippet children(tab)}
			{#if notice !== undefined}
				<h1 id="error-title">No tender with this notice number</h1>
				{@render tab()}
				<!-- Both days are the snapshot's; error.dom.test.ts fails when the built index disagrees. -->
				<p class="lede">
					Notice <span class="mono echo">{notice}</span> is not in the 15 Sep 2026 snapshot. It may be
					outside the IT, Netherlands, Belgium and Germany scope, published before 1 Sep 2026 or after
					the capture, or not a call for tenders TED listed as active that day.
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
				<h1 id="error-title">No page at this address</h1>
				{@render tab()}
				<p class="lede">Check the address for a typo, or go back to the open tenders.</p>
				<p class="mono echo path">{readable(path)}</p>
				<div class="actions">
					<Button href="/tenders">Browse open tenders</Button>
				</div>
			{:else if refused}
				<h1 id="error-title">This request could not be answered</h1>
				{@render tab()}
				<p class="lede">
					The address, or the way it was sent, is not one this site can answer, so reloading will
					not help. Check the address for a typo, or go back to the open tenders.
				</p>
				<p class="mono echo path">{readable(path)}</p>
				<div class="actions">
					<Button href="/tenders">Browse open tenders</Button>
				</div>
			{:else}
				<h1 id="error-title">This page could not be built</h1>
				{@render tab()}
				<p class="lede">
					The server hit an error while building this page. Reload in a minute.
					{#if !readsIndex}If it keeps happening, the list of open tenders may still work.{/if}
				</p>
				<div class="actions">
					<Button href="/tenders">Browse open tenders</Button>
				</div>
			{/if}
		{/snippet}
	</Leaf>
</Binder>

<style>
	h1 {
		max-width: 24ch;
		font: 600 var(--step-4) / 1.1 var(--font-cond);
		letter-spacing: -0.015em;
		text-wrap: balance;
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

	@media (max-width: 720px) {
		h1 {
			font-size: var(--step-3);
		}
	}
</style>
