<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => goto('/sms/rede/ubs', { replaceState: true }));
</script>

<div
	class="border border-slate-200 bg-white p-8 text-center font-mono text-xs tracking-widest text-slate-500 uppercase"
>
	Redirecionando...
</div>
