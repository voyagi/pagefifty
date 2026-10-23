<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<!-- The legal line sits here so every page carries it, including the ones that say it again in
	 their own words. -->
<footer class="site-footer">
	<div class="inner">
		<p class="legal">Not legal advice.</p>
		<nav aria-label="About this site">
			<ul>
				<li><a href={resolve('/privacy')}>Privacy</a></li>
				<li><a href={resolve('/ai')}>How the AI is used</a></li>
			</ul>
		</nav>
	</div>
</footer>

<style>
	.site-footer {
		border-top: 1px solid var(--line);
		color: var(--ink-2);
		font-size: var(--step--1);
	}

	/* The same measure as the page above it, so the footer's edge lines up with the content. */
	.inner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0 1.5rem;
		max-width: 1280px;
		margin: 0 auto;
		padding: 0.5rem var(--gutter) 1.5rem;
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
</style>
