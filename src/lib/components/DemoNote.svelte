<script lang="ts">
	import { DEMO_FIRM_NAME } from '$lib/profile/demo-firm';
</script>

<p class="demo-note">{DEMO_FIRM_NAME} is a demo firm. Every figure on this page is invented.</p>

<style>
	/* The footnote lies on the desk under the binder, clear of the tab rail on the right. */
	.demo-note {
		margin: 0 calc(var(--gutter) + var(--rail)) 2rem var(--gutter);
		max-width: 80ch;
		font-size: var(--step--1);
		color: var(--desk-ink);
	}

	@media (max-width: 720px) {
		.demo-note {
			margin: 0 0.75rem 2rem;
		}
	}
</style>
