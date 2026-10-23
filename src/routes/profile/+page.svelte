<script lang="ts">
	import { onMount } from 'svelte';
	import DemoNote from '$lib/components/DemoNote.svelte';
	import DemoProfile from '$lib/components/DemoProfile.svelte';
	import PageMain from '$lib/components/PageMain.svelte';
	import ProfileForm from '$lib/components/ProfileForm.svelte';
	import { getProfileStore } from '$lib/profile/store.svelte';

	// Storage is read only here, after mount, so the server never renders or receives a profile.
	// Until then the form's panels show their loading lines, in either mode. The shared store reads
	// storage when it is created and follows other tabs after that, so the page reads it as it is.
	let shared = $state<ReturnType<typeof getProfileStore> | null>(null);

	onMount(() => {
		shared = getProfileStore();
	});

	const demo = $derived(shared?.store.activeFirm === 'demo');
</script>

<svelte:head>
	<title>Firm profile - Pagefifty</title>
</svelte:head>

<PageMain>
	{#if shared && demo}
		<DemoProfile onback={() => shared?.store.backToOwn()} />
	{:else}
		<ProfileForm store={shared?.store ?? null} keptInMemory={shared?.keptInMemory ?? false} />
	{/if}
	{#if demo}
		<DemoNote />
	{/if}
</PageMain>
