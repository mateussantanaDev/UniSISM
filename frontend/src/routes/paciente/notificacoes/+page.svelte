<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import type { NotificacaoPacienteDTO } from '$lib/api/types';
	import { IconBell, IconBus, IconCalendarEvent, IconCheck, IconRefresh } from '@tabler/icons-svelte';

	let notificacoes = $state<NotificacaoPacienteDTO[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let filtro = $state<'todas' | 'nao-lidas'>('todas');
	let marcandoTodas = $state(false);

	onMount(async () => {
		await carregarNotificacoes();
	});

	async function carregarNotificacoes() {
		loading = true;
		error = null;
		try {
			const res = await api.pacienteApp.notificacoes();
			notificacoes = res || [];
		} catch (e: any) {
			error = e.message || 'Falha ao carregar as notificações.';
		} finally {
			loading = false;
		}
	}

	async function marcarLida(item: NotificacaoPacienteDTO) {
		if (!item.lidaEm) {
			try {
				await api.pacienteApp.marcarLida(item.id);
				item.lidaEm = new Date().toISOString();
			} catch (e) {
				console.error('Falha ao marcar notificação como lida', e);
			}
		}

		if (item.encaminhamentoId) {
			goto('/paciente/encaminhamentos');
		} else if ((item.tipo as string).includes('TFD')) {
			goto('/paciente/tfd');
		}
	}

	async function marcarTodasLidas() {
		if (marcandoTodas) return;
		marcandoTodas = true;
		try {
			await api.pacienteApp.marcarTodasLidas();
			const now = new Date().toISOString();
			notificacoes = notificacoes.map((n) => ({ ...n, lidaEm: n.lidaEm || now }));
		} catch (e: any) {
			alert('Não foi possível marcar todas como lidas: ' + (e.message || 'Erro desconhecido'));
		} finally {
			marcandoTodas = false;
		}
	}

	function formatarTempo(dataStr: string): string {
		try {
			const d = new Date(dataStr);
			if (isNaN(d.getTime())) return dataStr;
			return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
		} catch {
			return dataStr;
		}
	}

	let notificacoesFiltradas = $derived(
		notificacoes.filter((n) => {
			if (filtro === 'nao-lidas') return !n.lidaEm;
			return true;
		})
	);

	let unreadCount = $derived(notificacoes.filter((n) => !n.lidaEm).length);
</script>

<svelte:head>
	<title>Notificações · UniSISM Águas Belas</title>
</svelte:head>

<div class="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 space-y-6">
	<!-- Top Bar -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
		<div>
			<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				CENTRAL DE MENSAGENS E AVISOS
			</div>
			<h1 class="font-mono text-lg font-bold tracking-wide text-slate-900 sm:text-xl uppercase flex items-center gap-2">
				<IconBell size={20} class="text-blue-900" />
				<span>Notificações do Cidadão</span>
			</h1>
			<p class="text-xs text-slate-600 mt-0.5">
				Avisos da Regulação Municipal, agendamentos de consultas e confirmações de viagens TFD.
			</p>
		</div>

		<div class="flex items-center gap-2">
			{#if unreadCount > 0}
				<button
					type="button"
					onclick={marcarTodasLidas}
					disabled={marcandoTodas}
					class="border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase hover:bg-slate-50 disabled:opacity-50 transition-colors"
				>
					{marcandoTodas ? 'Processando...' : 'Marcar todas como lidas'}
				</button>
			{/if}
			<button
				onclick={carregarNotificacoes}
				disabled={loading}
				class="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase hover:bg-slate-50 disabled:opacity-50 transition-colors"
			>
				<IconRefresh size={14} class={loading ? 'animate-spin' : ''} />
			</button>
		</div>
	</div>

	<!-- Filter Tabs B2G -->
	<div class="flex border border-slate-200 bg-slate-100 p-1 gap-1">
		<button
			type="button"
			onclick={() => (filtro = 'todas')}
			class="px-4 py-1.5 font-mono text-xs font-bold tracking-wider uppercase transition-colors {filtro === 'todas'
				? 'bg-blue-900 text-white'
				: 'text-slate-700 hover:bg-white'}"
		>
			TODAS ({notificacoes.length})
		</button>
		<button
			type="button"
			onclick={() => (filtro = 'nao-lidas')}
			class="px-4 py-1.5 font-mono text-xs font-bold tracking-wider uppercase transition-colors {filtro === 'nao-lidas'
				? 'bg-blue-900 text-white'
				: 'text-slate-700 hover:bg-white'}"
		>
			NÃO LIDAS ({unreadCount})
		</button>
	</div>

	<!-- Content -->
	{#if loading}
		<div class="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 shadow-sm">
			<div class="w-8 h-8 border-[3px] border-blue-900 border-t-transparent animate-spin"></div>
			<p class="mt-3 font-mono text-xs font-bold tracking-widest text-slate-500 uppercase">
				Carregando notificações...
			</p>
		</div>
	{:else if error}
		<div class="p-4 bg-red-50 border border-red-700 font-mono text-xs text-red-800">
			<p class="font-bold">NÃO FOI POSSÍVEL CARREGAR AS NOTIFICAÇÕES</p>
			<p class="mt-1">{error}</p>
			<button
				onclick={carregarNotificacoes}
				class="mt-3 px-3 py-1.5 border border-red-800 bg-red-800 text-white font-mono text-xs font-bold uppercase hover:bg-red-900"
			>
				Tentar Novamente
			</button>
		</div>
	{:else if notificacoesFiltradas.length === 0}
		<div class="border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
			<div class="font-mono text-xs font-bold text-slate-700 uppercase">
				Caixa de avisos em dia
			</div>
			<p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
				{filtro === 'nao-lidas' ? 'Você já conferiu todas as suas notificações recentes.' : 'Nenhuma notificação registrada na sua conta.'}
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-2">
			{#each notificacoesFiltradas as notif}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					onclick={() => marcarLida(notif)}
					class="p-4 border transition-all cursor-pointer {notif.lidaEm
						? 'bg-white border-slate-200 hover:border-slate-400'
						: 'bg-blue-50/60 border-blue-300 hover:border-blue-500'}"
				>
					<div class="flex items-start gap-3">
						<div
							class="h-8 w-8 shrink-0 flex items-center justify-center font-mono text-xs font-bold {notif.lidaEm
								? 'bg-slate-100 text-slate-600'
								: 'bg-blue-900 text-white'}"
						>
							{#if (notif.tipo as string).includes('TFD')}
								<IconBus size={16} />
							{:else}
								<IconCalendarEvent size={16} />
							{/if}
						</div>

						<div class="flex-1 min-w-0">
							<div class="flex items-center justify-between gap-2">
								<h3
									class="font-mono text-xs sm:text-sm font-bold uppercase {notif.lidaEm
										? 'text-slate-900'
										: 'text-blue-950 font-black'}"
								>
									{notif.titulo}
								</h3>
								{#if !notif.lidaEm}
									<span class="border border-blue-700 bg-blue-100 text-blue-900 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase">
										NOVA
									</span>
								{/if}
							</div>

							<p class="text-xs text-slate-700 mt-1 leading-relaxed">
								{notif.corpo}
							</p>

							<div class="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-500">
								<span>{formatarTempo(notif.criadaEm)}</span>
								{#if notif.encaminhamentoId}
									<span class="text-blue-900 font-bold uppercase hover:underline">
										VER ENCAMINHAMENTO #{notif.protocolo || ''} →
									</span>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
