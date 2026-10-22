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
	/* The native checkbox stays visible, so a browser without :has() still shows the state. Checked
	   is told by the box and a doubled ink edge, never by a fill colour alone. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 36px;
		padding: 0 0.75rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r);
		font: 500 0.875rem / 1.2 var(--font);
		color: var(--ink);
		background: var(--bg);
		cursor: pointer;
	}

	.chip:hover {
		border-color: var(--ink-2);
	}

	input {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: var(--brand);
		cursor: pointer;
	}

	.chip:has(input:checked) {
		border-color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--ink);
	}

	.chip:focus-within {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	input:focus-visible {
		outline: none;
	}
</style>
