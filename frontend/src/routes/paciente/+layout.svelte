<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { PacienteMeResponse } from '$lib/api/types';
	import { setPacienteAuthContext } from '$lib/presentation/contexts/pacienteAuthContext';
	import {
		IconHome,
		IconCalendarEvent,
		IconBus,
		IconNotes,
		IconBell,
		IconUser,
		IconLogout
	} from '@tabler/icons-svelte';

	let { children } = $props();

	let me = $state<PacienteMeResponse | null>(null);
	let carregando = $state(true);
	let contagemNotificacoes = $state(0);

	let now = $state(new Date());
	$effect(() => {
		const interval = setInterval(() => (now = new Date()), 1000);
		return () => clearInterval(interval);
	});

	let relogio = $derived(
		now.toLocaleString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		})
	);

	async function logout() {
		try {
			await api.pacienteApp.logout();
		} catch (err) {
			console.info('[UniSISM Paciente] Logout local efetuado.', err);
		} finally {
			me = null;
			goto('/login?aba=paciente', { replaceState: true });
		}
	}

	async function carregarDados() {
		carregando = true;
		try {
			if (!api.pacienteApp.hasToken()) {
				goto('/login?aba=paciente', { replaceState: true });
				return;
			}
			const dados = await api.pacienteApp.me();
			me = dados;

			try {
				const cont = await api.pacienteApp.contadorNotificacoes();
				contagemNotificacoes = cont.naoLidas || 0;
			} catch {
				contagemNotificacoes = 0;
			}
		} catch (err: any) {
			console.error('[UniSISM Paciente] Falha na sessão do paciente:', err);
			await logout();
		} finally {
			carregando = false;
		}
	}

	setPacienteAuthContext({
		get me() {
			return me;
		},
		get carregando() {
			return carregando;
		},
		logout,
		refresh: carregarDados
	});

	onMount(() => {
		carregarDados();
	});

	const navItems = [
		{ href: '/paciente', label: 'Início', icon: IconHome, exact: true },
		{ href: '/paciente/encaminhamentos', label: 'Consultas', icon: IconCalendarEvent },
		{ href: '/paciente/tfd', label: 'TFD', icon: IconBus },
		{ href: '/paciente/dossie', label: 'Prontuário', icon: IconNotes },
		{ href: '/paciente/perfil', label: 'Perfil', icon: IconUser }
	];

	function isAtivo(itemHref: string, exact = false) {
		const currentPath = page.url.pathname;
		if (exact) return currentPath === itemHref;
		return currentPath.startsWith(itemHref);
	}
</script>

<svelte:head>
	<title>UniSISM · Portal do Cidadão</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-slate-100/70 font-sans text-slate-900">
	<!-- Top Bar Mobile & Desktop (App Native Header) -->
	<header
		class="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm"
	>
		<div class="mx-auto flex max-w-2xl items-center justify-between">
			<!-- Logo / Município -->
			<a href="/paciente" class="flex items-center gap-2 transition-opacity hover:opacity-90">
				<div class="leading-none">
					<div class="flex items-center gap-1.5">
						<span class="font-mono text-base font-black tracking-tight text-slate-900">UniSISM</span>
						<span class="border border-blue-900 bg-blue-50 px-1.5 py-0.2 font-mono text-[9px] font-bold text-blue-900 uppercase">
							Cidadão
						</span>
					</div>
					<div class="text-[10px] text-slate-500 font-mono mt-0.5">Águas Belas · PE</div>
				</div>
			</a>

			<!-- Desktop Nav Tabs -->
			<nav class="hidden md:flex items-center gap-1">
				{#each navItems as item}
					{@const ativo = isAtivo(item.href, item.exact)}
					<a
						href={item.href}
						class="flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-xs font-bold uppercase transition-all {ativo
							? 'border-blue-900 bg-blue-900 text-white'
							: 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'}"
					>
						<item.icon size={15} />
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>

			<!-- Right Status & Notifications -->
			<div class="flex items-center gap-2">
				<!-- Notificações -->
				<a
					href="/paciente/notificacoes"
					class="relative flex h-8 w-8 items-center justify-center border border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
					title="Notificações"
				>
					<IconBell size={17} />
					{#if contagemNotificacoes > 0}
						<span
							class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center bg-red-700 font-mono text-[9px] font-bold text-white"
						>
							{contagemNotificacoes > 9 ? '9+' : contagemNotificacoes}
						</span>
					{/if}
				</a>

				<!-- Perfil Rápido -->
				<a
					href="/paciente/perfil"
					class="flex h-8 w-8 items-center justify-center border border-slate-200 bg-blue-900 font-mono text-xs font-bold text-white transition-opacity hover:opacity-90"
					title="Meu Perfil"
				>
					{me?.nome ? me.nome.charAt(0).toUpperCase() : 'P'}
				</a>
			</div>
		</div>
	</header>

	<!-- Main App Content: max-w-2xl for native smartphone / tablet app width -->
	<main class="flex-1 pb-20 md:pb-10">
		<div class="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6">
			{#if carregando}
				<div class="flex h-64 items-center justify-center">
					<div class="flex flex-col items-center gap-2">
						<div class="h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"></div>
						<span class="font-mono text-xs font-bold tracking-wider text-slate-500 uppercase">
							Carregando...
						</span>
					</div>
				</div>
			{:else}
				{@render children()}
			{/if}
		</div>
	</main>

	<!-- Mobile Bottom Navigation Bar (App Experience) -->
	<nav
		class="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-300 bg-white md:hidden shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
	>
		<div class="mx-auto grid max-w-2xl grid-cols-5">
			{#each navItems as item}
				{@const ativo = isAtivo(item.href, item.exact)}
				<a
					href={item.href}
					class="flex flex-col items-center justify-center py-2 transition-all border-r border-slate-100 last:border-r-0 {ativo
						? 'border-t-2 border-t-blue-900 -mt-[2px] bg-slate-50 text-blue-950 font-bold'
						: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}"
				>
					<div class="relative">
						<item.icon size={20} stroke={ativo ? 2.4 : 1.8} />
						{#if item.href === '/paciente/notificacoes' && contagemNotificacoes > 0}
							<span
								class="absolute -top-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center bg-red-700 font-mono text-[8px] font-bold text-white"
							>
								{contagemNotificacoes}
							</span>
						{/if}
					</div>
					<span class="mt-1 font-mono text-[9px] tracking-wider uppercase">{item.label}</span>
				</a>
			{/each}
		</div>
	</nav>
</div>
