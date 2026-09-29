<script lang="ts">
	import { onMount } from 'svelte';
	import Binder from '$lib/components/Binder.svelte';
	import DemoNote from '$lib/components/DemoNote.svelte';
	import DemoProfile from '$lib/components/DemoProfile.svelte';
	import ProfileForm from '$lib/components/ProfileForm.svelte';
	import { getProfileStore } from '$lib/profile/store.svelte';

	// Storage is read only here, after mount, so the server never renders or receives a profile.
	// Until then the form's leaves show their loading lines, in either mode.
	let shared = $state<ReturnType<typeof getProfileStore> | null>(null);

	onMount(() => {
		shared = getProfileStore();
		shared.store.load();
	});

	const demo = $derived(shared?.store.activeFirm === 'demo');
</script>

<svelte:head>
	<title>Firm profile - Pagefifty</title>
</svelte:head>

<Binder board="ultramarine">
	{#if shared && demo}
		<DemoProfile onback={() => shared?.store.backToOwn()} />
	{:else}
		<ProfileForm store={shared?.store ?? null} keptInMemory={shared?.keptInMemory ?? false} />
	{/if}
</Binder>
{#if demo}
	<DemoNote />
{/if}
