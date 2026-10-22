<script lang="ts">
	import { resolve } from '$app/paths';

	let { path }: { path: string } = $props();

	function current(href: string): 'page' | 'true' | undefined {
		if (path === href) return 'page';
		if (path.startsWith(`${href}/`)) return 'true';
		return undefined;
	}
</script>

<nav aria-label="Main">
	<ul>
		<li>
			<a href={resolve('/tenders')} aria-current={current(resolve('/tenders'))}
				><span>Tenders</span></a
			>
		</li>
		<li>
			<a href={resolve('/profile')} aria-current={current(resolve('/profile'))}
				><span>Firm profile</span></a
			>
		</li>
		<li>
			<a href={resolve('/example')} aria-current={current(resolve('/example'))}
				><span>Example run</span></a
			>
		</li>
	</ul>
</nav>

<style>
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	/* The pill sits inside a 44px target, so the hit area stays large while the drawn shape stays
	   the 7px-cornered one the band uses everywhere. */
	a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--band-ink-2);
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}

	span {
		padding: 0.4375rem 0.6875rem;
		border-radius: 7px;
		transition: background-color var(--quick) ease-out;
	}

	a:hover {
		color: var(--band-ink);
	}

	a:hover span {
		background: var(--band-hover);
	}

	a[aria-current] {
		color: var(--band-ink);
	}

	a[aria-current] span {
		background: var(--band-hover);
	}

	/* The ring goes round the drawn pill, not the taller hit area around it. */
	a:focus-visible {
		outline: none;
	}

	a:focus-visible span {
		outline: 2px solid var(--band-ink);
		outline-offset: 2px;
	}

	@media (max-width: 45em) {
		ul {
			margin-inline: -0.6875rem;
		}
	}
</style>
