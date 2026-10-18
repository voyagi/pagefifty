<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<footer class="site-footer">
	<nav aria-label="About this site">
		<ul>
			<li><a href={resolve('/privacy')}>Privacy</a></li>
			<li><a href={resolve('/ai')}>How the AI is used</a></li>
		</ul>
	</nav>
</footer>

<style>
	/* The footer sits on the desk below the binder, in the desk bar's ink, so it reads as the desk's
	   own note and never as a leaf. */
	.site-footer {
		padding: 0 calc(var(--gutter) + var(--rail)) 2.5rem var(--gutter);
		background: var(--desk);
		color: var(--desk-ink);
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-weight: 500;
	}

	a:hover {
		color: var(--ink);
	}

	@media (max-width: 45em) {
		.site-footer {
			padding: 0 0.75rem 2rem;
		}
	}
</style>
