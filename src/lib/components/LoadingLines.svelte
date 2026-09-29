<script lang="ts">
	// The leaf is set in place before its words arrive: three lines, no spinner.
	let { label }: { label?: string } = $props();
</script>

<div class="loading" aria-busy="true">
	{#if label}<p class="visually-hidden">{label}</p>{/if}
	<span class="set-line w-80"></span>
	<span class="set-line w-60"></span>
	<span class="set-line w-40"></span>
</div>

<style>
	.loading {
		grid-column: 1 / -1;
	}

	.set-line {
		display: block;
		height: 0.875rem;
		border-radius: 2px;
		background: color-mix(in srgb, var(--ink) 12%, var(--acetate));
		margin-top: 0.75rem;
	}

	.w-80 {
		width: 80%;
	}

	.w-60 {
		width: 60%;
	}

	.w-40 {
		width: 40%;
	}
</style>
