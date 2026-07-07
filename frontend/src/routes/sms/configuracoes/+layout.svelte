<script lang="ts">
	import SubNav from '$lib/presentation/components/SubNav.svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	let { children } = $props();
	const auth = useAuth();

	const tabs = $derived([
		...(auth.me?.role === 'DESENVOLVEDOR'
			? [{ label: 'Prefeituras', href: '/sms/configuracoes', shortcut: '1' }]
			: []),
		{ label: 'Parâmetros', href: '/sms/configuracoes/parametros', shortcut: '2' },
		...(auth.me?.role === 'DESENVOLVEDOR' || auth.me?.role === 'ADMIN'
			? [{ label: 'Integrações', href: '/sms/configuracoes/integracoes', shortcut: '3' }]
			: [])
	]);
</script>

<div class="flex flex-col gap-4">
	<SubNav {tabs} />
	{@render children()}
</div>
