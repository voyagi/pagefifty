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
	/* A long added name wraps inside the chip rather than stretching the row. */
	.chip {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		min-height: 44px;
		padding: 0.625rem 0.875rem;
		border: 1px solid var(--ink-3);
		border-radius: 3px;
		font: 500 var(--step-0) / 1.25 var(--font-sans);
		text-align: left;
		overflow-wrap: anywhere;
		color: var(--ink);
		background: var(--acetate);
		cursor: pointer;
		transition: transform var(--hinge) steps(2, end);
	}

	.chip[aria-pressed='true'] {
		background: var(--ink);
		color: var(--acetate);
		border-color: var(--ink);
	}

	.chip.dashed {
		border: 2px dashed var(--ink);
	}

	.chip[aria-pressed='true'].dashed {
		border-color: var(--acetate);
		outline: 1px solid var(--ink);
	}

	.chip:hover {
		transform: translateY(-1px);
	}

	.chip:active {
		transform: translateY(1px);
	}

	.chip:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
</style>
