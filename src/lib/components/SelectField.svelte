<script lang="ts">
	import type { CodeName } from '$lib/profile/codes';
	import Field from './Field.svelte';

	// A native select in the field box: the browser's own picker, keyboard and screen reader handling.
	// The value flows one way, from what storage holds; a caller whose change was refused puts the
	// select back through the element it is handed, and a later stored value still reaches it.
	let {
		id,
		label,
		hint,
		placeholder,
		options,
		value = '',
		onchange
	}: {
		id: string;
		label: string;
		hint?: string;
		placeholder: string;
		options: readonly CodeName[];
		value?: string;
		onchange: (value: string, select: HTMLSelectElement) => void;
	} = $props();
</script>

<Field {id} {label} {hint}>
	{#snippet control(attrs)}
		<select
			{id}
			{value}
			onchange={(event) => onchange(event.currentTarget.value, event.currentTarget)}
			aria-describedby={attrs.describedby}
		>
			<option value="">{placeholder}</option>
			{#each options as option (option.code)}
				<option value={option.code}>{option.name}</option>
			{/each}
		</select>
	{/snippet}
</Field>
