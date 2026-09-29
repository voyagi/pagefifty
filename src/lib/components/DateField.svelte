<script lang="ts" module>
	type DateResult = { ok: true; value: string | undefined } | { ok: false };

	// A real calendar day written YYYY-MM-DD: the pattern alone would let 2027-02-31 through.
	function isCalendarDay(text: string): boolean {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
		const day = new Date(`${text}T00:00:00Z`);
		return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === text;
	}

	// A browser reports a half-typed date as an empty value with badInput set, which must not read
	// as a cleared date.
	function readDate(text: string, input: HTMLInputElement): DateResult {
		if (input.validity.badInput) return { ok: false };
		if (text === '') return { ok: true, value: undefined };
		return isCalendarDay(text) ? { ok: true, value: text } : { ok: false };
	}
</script>

<script lang="ts">
	import Field from './Field.svelte';

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
		onchange: (result: DateResult, text: string) => void;
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
	type="date"
	oninput={(text, input) => onchange(readDate(text, input), text)}
	{onfocus}
	{onblur}
/>
