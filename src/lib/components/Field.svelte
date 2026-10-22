<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface ControlAttrs {
		describedby: string | undefined;
		invalid: boolean;
	}

	// A labelled text input with its hint, or any other control passed as `control`. An error
	// replaces the hint in the same element, so aria-describedby always points at what is shown.
	// A strong hint is a fact the reader must not miss that is not an error (an expired date).
	let {
		id,
		label,
		hint,
		hintStrong = false,
		error,
		value = $bindable(''),
		type = 'text',
		inputmode,
		maxlength,
		readonly = false,
		oninput,
		onfocus,
		onblur,
		control
	}: {
		id: string;
		label: string;
		hint?: string;
		hintStrong?: boolean;
		error?: string;
		value?: string;
		type?: 'text' | 'date';
		inputmode?: 'numeric' | 'text';
		maxlength?: number;
		readonly?: boolean;
		oninput?: (value: string, input: HTMLInputElement) => void;
		onfocus?: () => void;
		onblur?: () => void;
		control?: Snippet<[ControlAttrs]>;
	} = $props();

	const hintId = $derived(`${id}-hint`);
	const attrs = $derived<ControlAttrs>({
		describedby: hint !== undefined || error !== undefined ? hintId : undefined,
		invalid: error !== undefined
	});
</script>

<div class="field" class:error={error !== undefined}>
	<label for={id}>{label}</label>
	{#if control}
		{@render control(attrs)}
	{:else}
		<input
			{id}
			{type}
			{inputmode}
			{maxlength}
			{readonly}
			autocomplete="off"
			spellcheck="false"
			bind:value
			oninput={(event) => oninput?.(event.currentTarget.value, event.currentTarget)}
			{onfocus}
			{onblur}
			aria-invalid={attrs.invalid ? 'true' : undefined}
			aria-describedby={attrs.describedby}
		/>
	{/if}
	{#if error !== undefined}
		<p class="hint" id={hintId}>
			<Icon name="info" />
			<span>{error}</span>
		</p>
	{:else if hint !== undefined}
		<p class="hint" class:strong={hintStrong} id={hintId}>{hint}</p>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}

	/* A label can carry a certificate name of up to 80 characters with no space in it. */
	label {
		font-weight: 500;
		font-size: var(--step--1);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	/* Inputs and selects share one box; a control passed in from another component is reached here.
	   A value is a figure the firm will be judged on, so its digits line up. */
	.field :global(input),
	.field :global(select) {
		width: 100%;
		min-width: 0;
		min-height: 40px;
		padding: 0 0.75rem;
		font: 500 var(--step-0) / 1.2 var(--font);
		font-variant-numeric: tabular-nums;
		color: var(--ink);
		background: var(--bg);
		border: 1px solid var(--line-2);
		border-radius: var(--r);
	}

	.field :global(input:focus-visible),
	.field :global(select:focus-visible) {
		outline: 2px solid var(--focus);
		outline-offset: 0;
		border-color: var(--focus);
	}

	/* An error is carried by shape and weight: a dashed ink edge on a solid 5% ink tint. */
	.error :global(input),
	.error :global(select) {
		border: 2px dashed var(--ink);
		background: color-mix(in srgb, var(--ink) 5%, var(--bg));
	}

	.hint {
		margin: 0;
		font-size: var(--step--1);
		line-height: 1.35;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	.hint.strong {
		color: var(--ink);
		font-weight: 600;
	}

	.error .hint {
		display: flex;
		gap: 0.4rem;
		align-items: flex-start;
		color: var(--ink);
		font-weight: 600;
	}

	.hint :global(.icon) {
		margin-top: 0.05rem;
	}
</style>
