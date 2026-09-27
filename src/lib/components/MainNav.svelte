<script lang="ts">
	import { resolve } from '$app/paths';

	let { path }: { path: string } = $props();

	function current(href: string): 'page' | 'true' | undefined {
		if (path === href) return 'page';
		if (path.startsWith(`${href}/`)) return 'true';
		return undefined;
	}
</script>

<!-- Example run joins once /example exists (plan 01-15): no link to a page that is not there. -->
<nav aria-label="Main">
	<ul>
		<li><a href={resolve('/tenders')} aria-current={current(resolve('/tenders'))}>Tenders</a></li>
		<li>
			<a href={resolve('/profile')} aria-current={current(resolve('/profile'))}>Firm profile</a>
		</li>
	</ul>
</nav>

<style>
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1.5rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}

	a:hover {
		color: var(--ink);
		text-decoration: underline;
	}

	a[aria-current] {
		color: var(--ink);
		text-decoration: underline;
		text-decoration-thickness: 2px;
	}

	@media (max-width: 720px) {
		ul {
			gap: 0 1.125rem;
		}
	}
</style>
