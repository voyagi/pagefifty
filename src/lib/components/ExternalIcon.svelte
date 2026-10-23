<script lang="ts">
	import Icon from './Icon.svelte';
</script>

<!-- The out-of-site mark sized to the running text of the link it ends, rather than the icon's
	 fixed 16px, so it follows a link set at any size. -->
<span class="external"><Icon name="out" /></span>

<style>
	.external :global(.icon) {
		width: 0.9em;
		height: 0.9em;
		margin-left: 0.25rem;
		vertical-align: -0.1em;
	}
</style>
