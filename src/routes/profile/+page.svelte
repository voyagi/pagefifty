<script lang="ts">
	import { onMount } from 'svelte';
	import Binder from '$lib/components/Binder.svelte';
	import ProfileForm from '$lib/components/ProfileForm.svelte';
	import { getProfileStore } from '$lib/profile/store.svelte';

	// Storage is read only here, after mount, so the server never renders or receives a profile.
	let shared = $state<ReturnType<typeof getProfileStore> | null>(null);

	onMount(() => {
		shared = getProfileStore();
		shared.store.load();
	});
</script>

<svelte:head>
	<title>Firm profile - Pagefifty</title>
</svelte:head>

<Binder board="ultramarine">
	<ProfileForm store={shared?.store ?? null} keptInMemory={shared?.keptInMemory ?? false} />
</Binder>
