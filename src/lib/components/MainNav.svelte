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
		<li><a href={resolve('/tenders')} aria-current={current(resolve('/tenders'))}>Tenders</a></li>
		<li>
			<a href={resolve('/profile')} aria-current={current(resolve('/profile'))}>Firm profile</a>
		</li>
		<li>
			<a href={resolve('/example')} aria-current={current(resolve('/example'))}>Example run</a>
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

	@media (max-width: 45em) {
		ul {
			gap: 0 1.125rem;
		}
	}
</style>
