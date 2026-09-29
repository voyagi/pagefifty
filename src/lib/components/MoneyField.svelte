<script lang="ts">
	import { parseWholeEuros, type FieldResult } from '$lib/profile/fields';
	import Field from './Field.svelte';

	// Whole euros only: the parse refuses a dot or a comma rather than guess which one groups
	// thousands (CONTEXT D-17).
	let {
		id,
		label,
		hint,
		error,
		value = $bindable(''),
		onchange,
		onfocus,
		onblur
	}: {
		id: string;
		label: string;
		hint?: string;
		error?: string;
		value?: string;
		onchange: (result: FieldResult, text: string) => void;
		onfocus?: () => void;
		onblur?: () => void;
	} = $props();
</script>

<Field
	{id}
	{label}
	{hint}
	{error}
	bind:value
	inputmode="numeric"
	oninput={(text) => onchange(parseWholeEuros(text), text)}
	{onfocus}
	{onblur}
/>
