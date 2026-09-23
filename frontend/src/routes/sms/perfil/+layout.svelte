<script lang="ts">
	import SubNav from '$lib/presentation/components/SubNav.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api } from '$lib/api';
	import type { AtendentePerfil } from '$lib/api/types';
	import { setPerfilContext } from '$lib/presentation/contexts/perfilContext';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';

	let { children } = $props();

	const auth = useAuth();

	let perfil = $state<AtendentePerfil | null>(null);
	let carregando = $state(true);

	setPerfilContext({
		get perfil() {
			return perfil;
		},
		get carregando() {
			return carregando;
		}
	});

	onMount(async () => {
		try {
			perfil = await api.perfil.get();
		} finally {
			carregando = false;
		}
	});

	let tabs = $derived([
		{ label: 'Visão Geral', href: '/sms/perfil', shortcut: '1' },
		{ label: 'Conta', href: '/sms/perfil/conta', shortcut: '2' },
		{ label: 'Segurança', href: '/sms/perfil/seguranca', shortcut: '3' },
		{ label: 'Produção', href: '/sms/perfil/producao', shortcut: '4' },
		{ label: 'Relatórios', href: '/sms/perfil/relatorios', shortcut: '5' }
	]);
</script>

<div class="flex flex-col gap-4">
	<!-- Cabeçalho -->
	<div
		class="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white px-4 py-3"
	>
		<div class="flex items-center gap-3">
			<div
				class="flex h-12 w-12 shrink-0 items-center justify-center border border-slate-300 bg-blue-900 font-mono text-base font-bold text-white"
			>
				{perfil?.iniciais ?? auth.me?.iniciais ?? '··'}
			</div>
			<div class="leading-tight">
				<div class="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
					PERFIL DO OPERADOR
				</div>
				<div class="text-sm font-bold text-slate-900">
					{perfil?.nome ?? auth.me?.nome ?? 'Carregando...'}
				</div>
				<div class="font-mono text-[11px] text-slate-600">
					{perfil?.cargo ?? auth.me?.cargo ?? ''} · Matrícula {perfil?.matricula ??
						auth.me?.matricula ??
						''}
				</div>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<span
				class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800 uppercase"
			>
				SESSÃO ATIVA
			</span>
			<PrimaryButton label="Encerrar Sessão" variant="danger" onclick={auth.logout} />
		</div>
	</div>

	<SubNav {tabs} />

	{#if carregando}
		<div class="border border-slate-200 bg-white p-10 text-center">
			<div
				class="mx-auto mb-3 h-6 w-6 animate-spin border-[3px] border-blue-900 border-t-transparent"
			></div>
			<div class="font-mono text-[11px] tracking-widest text-slate-600 uppercase">
				Carregando perfil...
			</div>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>
