<p class="unread-strip">
	<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
		<rect x="3" y="3" width="14" height="14" rx="1" />
		<path d="M3 8h14M3 13h14" />
	</svg>
	<span
		>Shown as published in the notice. Nothing on this page has been compared with your firm
		profile.</span
	>
</p>

<style>
	/* Dashed on the leaf-back fill: the one meaning of a dashed edge here is "not read or not
	   settled". */
	.unread-strip {
		display: flex;
		gap: 0.625rem;
		align-items: flex-start;
		max-width: 62ch;
		margin-top: 1rem;
		padding: 0.625rem 0.875rem;
		background: var(--leaf-back);
		color: var(--leaf-back-ink);
		border: 1px dashed var(--leaf-back-ink);
		border-radius: 2px;
		font-size: var(--step--1);
		font-weight: 500;
	}

	svg {
		flex: none;
		width: 1.125rem;
		height: 1.125rem;
	}
</style>
