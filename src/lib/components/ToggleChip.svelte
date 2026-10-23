<script lang="ts">
	// A pressed chip is held; a dashed one is held but not settled (an expired certificate).
	let {
		label,
		pressed,
		dashed = false,
		expanded,
		controls,
		onclick
	}: {
		label: string;
		pressed?: boolean;
		dashed?: boolean;
		expanded?: boolean;
		controls?: string;
		onclick: () => void;
	} = $props();
</script>

<button
	class="chip"
	class:dashed
	type="button"
	aria-pressed={pressed === undefined ? undefined : pressed ? 'true' : 'false'}
	aria-expanded={expanded === undefined ? undefined : expanded ? 'true' : 'false'}
	aria-controls={controls}
	{onclick}>{label}</button
>

<style>
	/* A long added name wraps inside the chip rather than stretching the row. Pressed is told by a
	   doubled ink edge, as a checked chip is; text stays ink on the page colour. */
	.chip {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		min-height: 36px;
		padding: 0.4375rem 0.75rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r);
		font: 500 0.875rem / 1.25 var(--font);
		text-align: left;
		overflow-wrap: anywhere;
		color: var(--ink);
		background: var(--bg);
		cursor: pointer;
		transition:
			border-color var(--quick) ease-out,
			box-shadow var(--quick) ease-out;
	}

	.chip:hover {
		border-color: var(--ink-2);
	}

	.chip[aria-pressed='true'] {
		border-color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--ink);
	}

	/* Dashed means held but not settled (an expired certificate), pressed or not. */
	.chip.dashed {
		border-style: dashed;
		border-color: var(--ink-2);
	}

	.chip[aria-pressed='true'].dashed {
		border-color: var(--ink);
	}
</style>
