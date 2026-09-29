<script lang="ts">
	let { text }: { text: string } = $props();
</script>

<p class="status" role="status">{text}</p>

<style>
	.status {
		margin: 0.75rem 0 0;
		font-size: var(--step--1);
		line-height: 1.35;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
</style>
