<script lang="ts">
	import Icon from './Icon.svelte';
</script>

<!-- The record head carries this only when no lot of the notice shows a verdict; beside a verdict
	 its second sentence would be false. -->
<p class="unread-strip">
	<Icon name="unread" />
	<span
		>Shown as published in the notice. Nothing on this page has been compared with your firm
		profile.</span
	>
</p>

<style>
	/* A dashed note: the one meaning of a dashed edge here is "not read or not settled". */
	.unread-strip {
		display: flex;
		gap: 0.625rem;
		align-items: flex-start;
		max-width: 62ch;
		margin-top: 1rem;
		padding: 0.625rem 0.875rem;
		border: 1px dashed var(--line-2);
		border-radius: var(--r);
		background: var(--bg);
		color: var(--ink-2);
		font-size: var(--step--1);
		font-weight: 500;
	}

	.unread-strip :global(svg.icon) {
		margin-top: 0.125rem;
	}
</style>
