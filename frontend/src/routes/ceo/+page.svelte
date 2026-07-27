<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/ceo/recepcao/fila', { replaceState: true });
	});
</script>

<div class="flex h-full items-center justify-center font-mono text-xs text-slate-500">
	Redirecionando para o Centro de Especialidades Médicas (CEO)...
</div>
