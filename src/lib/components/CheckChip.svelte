<script lang="ts">
	let {
		name,
		value,
		label,
		code,
		checked = false
	}: { name: string; value: string; label: string; code?: string; checked?: boolean } = $props();
</script>

<label class="chip">
	<input type="checkbox" {name} {value} {checked} />
	<span>{label}</span>
	{#if code}<span class="mono">{code}</span>{/if}
</label>

<style>
	/* The native checkbox stays visible, so a browser without :has() still shows the state. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		padding: 0 0.875rem;
		border: 1px solid var(--ink-3);
		border-radius: 3px;
		font: 500 var(--step-0) / 1 var(--font-sans);
		color: var(--ink);
		background: var(--acetate);
		cursor: pointer;
	}

	input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--ink);
		cursor: pointer;
	}

	.chip:has(input:checked) {
		background: var(--ink);
		color: var(--acetate);
		border-color: var(--ink);
	}

	/* An ink box on an ink chip would vanish; the checked box takes the acetate instead. */
	.chip:has(input:checked) input {
		accent-color: var(--acetate);
	}

	.chip:focus-within {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	input:focus-visible {
		outline: none;
	}
</style>
