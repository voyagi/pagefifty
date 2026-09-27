<a class="skip" href="#main">Skip to content</a>

<style>
	/* Out of sight until a keyboard reaches it, then a primary button at the desk bar's top left. */
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
		padding: 0 1.125rem;
		clip: auto;
		overflow: visible;
		background: var(--ink);
		color: var(--acetate);
		border: 1px solid var(--ink);
		border-radius: 3px;
		font: 600 var(--step-0) / 1 var(--font-sans);
		text-decoration: none;
	}
</style>
