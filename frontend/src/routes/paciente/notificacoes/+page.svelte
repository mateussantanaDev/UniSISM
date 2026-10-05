<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import type { NotificacaoPacienteDTO } from '$lib/api/types';

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
			notificacoes = notificacoes.map(n => ({ ...n, lidaEm: n.lidaEm || now }));
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
			return d.toLocaleDateString('pt-BR', {
				day: '2-digit',
				month: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return dataStr;
		}
	}

	let notificacoesFiltradas = $derived(
		notificacoes.filter(n => {
			if (filtro === 'nao-lidas') return !n.lidaEm;
			return true;
		})
	);

	let unreadCount = $derived(notificacoes.filter(n => !n.lidaEm).length);
</script>

<svelte:head>
	<title>Notificações | UniSISM Cidadão</title>
</svelte:head>

<div class="space-y-6">
	<!-- Top Bar -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Notificações</h1>
			<p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
				{#if unreadCount > 0}
					Você tem <strong class="text-emerald-600 dark:text-emerald-400">{unreadCount}</strong> {unreadCount === 1 ? 'mensagem não lida' : 'mensagens não lidas'}
				{:else}
					Nenhuma mensagem não lida
				{/if}
			</p>
		</div>

		{#if unreadCount > 0}
			<button
				type="button"
				onclick={marcarTodasLidas}
				disabled={marcandoTodas}
				class="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 py-1.5 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 transition disabled:opacity-50"
			>
				{marcandoTodas ? 'Marcando...' : 'Marcar todas como lidas'}
			</button>
		{/if}
	</div>

	<!-- Filter Tabs -->
	<div class="flex gap-2">
		<button
			type="button"
			onclick={() => (filtro = 'todas')}
			class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition {filtro === 'todas' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'}"
		>
			Todas ({notificacoes.length})
		</button>
		<button
			type="button"
			onclick={() => (filtro = 'nao-lidas')}
			class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition {filtro === 'nao-lidas' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'}"
		>
			Não Lidas ({unreadCount})
		</button>
	</div>

	<!-- Content -->
	{#if loading}
		<div class="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
			<div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
			<p class="mt-4 text-slate-500 dark:text-slate-400 font-medium">Buscando notificações...</p>
		</div>
	{:else if error}
		<div class="p-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-3xl text-rose-700 dark:text-rose-300">
			<p class="font-bold">Não foi possível carregar as notificações</p>
			<p class="text-sm mt-1">{error}</p>
			<button onclick={carregarNotificacoes} class="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 transition">
				Tentar Novamente
			</button>
		</div>
	{:else if notificacoesFiltradas.length === 0}
		<div class="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-8 shadow-sm">
			<div class="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
				<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
			</div>
			<h3 class="text-lg font-bold text-slate-900 dark:text-white">Caixa de entrada limpa</h3>
			<p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
				{filtro === 'nao-lidas' ? 'Você já leu todas as suas notificações recentes!' : 'Você não possui notificações no momento.'}
			</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each notificacoesFiltradas as notif}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					onclick={() => marcarLida(notif)}
					class="p-5 rounded-2xl border transition shadow-sm cursor-pointer {notif.lidaEm ? 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700' : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'}"
				>
					<div class="flex items-start gap-4">
						<div class="w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center {notif.lidaEm ? 'bg-slate-100 dark:bg-slate-800 text-slate-500' : 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'}">
							{#if (notif.tipo as string).includes('TFD')}
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
							{:else}
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
							{/if}
						</div>

						<div class="flex-1 min-w-0">
							<div class="flex items-center justify-between gap-2">
								<h3 class="font-bold text-sm sm:text-base {notif.lidaEm ? 'text-slate-900 dark:text-white' : 'text-emerald-950 dark:text-emerald-100'}">
									{notif.titulo}
								</h3>
								{#if !notif.lidaEm}
									<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
								{/if}
							</div>

							<p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
								{notif.corpo}
							</p>

							<div class="mt-2.5 flex items-center justify-between text-xs text-slate-400">
								<span>{formatarTempo(notif.criadaEm)}</span>
								{#if notif.encaminhamentoId}
									<span class="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 hover:underline">
										Ver encaminhamento #{notif.protocolo || ''}
										<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
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
