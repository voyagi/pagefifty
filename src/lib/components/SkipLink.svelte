<a class="skip" href="#main">Skip to content</a>

<style>
	/* Out of sight until a keyboard reaches it, then a primary button at the bar's top left, over
	   the wordmark. */
	.skip {
		position: absolute;
		top: 0.5rem;
		left: var(--gutter);
		z-index: 1;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.skip:focus {
		display: inline-flex;
		align-items: center;
		width: auto;
		height: auto;
		min-height: 44px;
		padding: 0 1.25rem;
		clip: auto;
		overflow: visible;
		background: var(--brand);
		color: var(--brand-ink);
		border: 1px solid var(--brand);
		border-radius: var(--r-pill);
		font: 600 var(--step-0) / 1 var(--font);
		text-decoration: none;
	}
</style>
