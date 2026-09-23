<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Os relatórios pessoais do operador são acessados no mesmo módulo
	// central da Secretaria (`/sms/relatorios`). Redireciona pra evitar
	// duplicar UI; os relatórios filtráveis por usuário logado aparecem lá.
	onMount(() => goto('/sms/relatorios', { replaceState: true }));
</script>

<div
	class="border border-slate-200 bg-white p-8 text-center font-mono text-xs tracking-widest text-slate-500 uppercase"
>
	Redirecionando para relatórios da Secretaria...
</div>
