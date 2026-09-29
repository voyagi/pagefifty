<script lang="ts">
	import type { CodeName } from '$lib/profile/codes';
	import Field from './Field.svelte';

	// A native select in the field box: the browser's own picker, keyboard and screen reader handling.
	let {
		id,
		label,
		hint,
		placeholder,
		options,
		value = $bindable(''),
		onchange
	}: {
		id: string;
		label: string;
		hint?: string;
		placeholder: string;
		options: readonly CodeName[];
		value?: string;
		onchange: (value: string) => void;
	} = $props();
</script>

<Field {id} {label} {hint}>
	{#snippet control(attrs)}
		<select
			{id}
			bind:value
			onchange={(event) => onchange(event.currentTarget.value)}
			aria-describedby={attrs.describedby}
		>
			<option value="">{placeholder}</option>
			{#each options as option (option.code)}
				<option value={option.code}>{option.name}</option>
			{/each}
		</select>
	{/snippet}
</Field>
