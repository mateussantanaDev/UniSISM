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
		IconLogout,
		IconHeartRateMonitor,
		IconShieldCheck
	} from '@tabler/icons-svelte';

	let { children } = $props();

	let me = $state<PacienteMeResponse | null>(null);
	let carregando = $state(true);
	let contagemNotificacoes = $state(0);

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

			// Busca contador de notificações
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
		{ href: '/paciente/dossie', label: 'Meu Histórico', icon: IconNotes },
		{ href: '/paciente/perfil', label: 'Meu Perfil', icon: IconUser }
	];

	function isAtivo(itemHref: string, exact = false) {
		const currentPath = page.url.pathname;
		if (exact) return currentPath === itemHref;
		return currentPath.startsWith(itemHref);
	}
</script>

<svelte:head>
	<title>Portal do Paciente · UniSISM Águas Belas</title>
	<meta name="theme-color" content="#064e3b" />
</svelte:head>

<div class="flex min-h-screen flex-col bg-slate-100 font-sans text-slate-800">
	<!-- Top Bar Mobile & Desktop -->
	<header class="sticky top-0 z-40 border-b border-emerald-950/20 bg-emerald-900 text-white shadow-md">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
			<!-- Logo / Município -->
			<a href="/paciente" class="flex items-center gap-2.5 transition-opacity hover:opacity-90">
				<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-inner">
					<IconHeartRateMonitor size={22} stroke={2.2} />
				</div>
				<div>
					<div class="flex items-center gap-1.5 leading-none">
						<span class="font-mono text-sm font-black tracking-tight text-white">UniSISM</span>
						<span class="rounded bg-emerald-500/30 px-1 py-0.2 text-[9px] font-bold text-emerald-200 uppercase tracking-widest">
							Cidadão
						</span>
					</div>
					<div class="text-[10px] text-emerald-200/80 font-medium">Águas Belas · PE</div>
				</div>
			</a>

			<!-- Desktop Nav Links -->
			<nav class="hidden md:flex items-center gap-1">
				{#each navItems as item}
					{@const ativo = isAtivo(item.href, item.exact)}
					<a
						href={item.href}
						class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all {ativo
							? 'bg-emerald-800 text-white shadow-sm'
							: 'text-emerald-100/90 hover:bg-emerald-800/50 hover:text-white'}"
					>
						<item.icon size={16} />
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>

			<!-- Right Actions -->
			<div class="flex items-center gap-2">
				<!-- Notificações -->
				<a
					href="/paciente/notificacoes"
					class="relative flex h-9 w-9 items-center justify-center rounded-full bg-emerald-800/80 text-emerald-100 transition-colors hover:bg-emerald-700 hover:text-white"
					title="Notificações"
				>
					<IconBell size={18} />
					{#if contagemNotificacoes > 0}
						<span
							class="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow"
						>
							{contagemNotificacoes > 9 ? '9+' : contagemNotificacoes}
						</span>
					{/if}
				</a>

				<!-- Perfil / Logout -->
				<div class="flex items-center gap-2 pl-1 border-l border-emerald-800">
					<a
						href="/paciente/perfil"
						class="hidden sm:flex flex-col text-right leading-tight hover:opacity-90 transition-opacity"
					>
						<span class="text-xs font-bold text-white max-w-[140px] truncate">
							{me?.nome || 'Carregando...'}
						</span>
						<span class="font-mono text-[10px] text-emerald-200">
							CPF {me?.cpfFormatado || '••••••'}
						</span>
					</a>
					<button
						onclick={logout}
						class="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-800/80 text-emerald-200 hover:bg-rose-900/80 hover:text-rose-200 transition-colors"
						title="Sair da conta"
					>
						<IconLogout size={16} />
					</button>
				</div>
			</div>
		</div>
	</header>

	<!-- Main Content Container with bottom padding on mobile for nav bar -->
	<main class="flex-1 pb-24 md:pb-12">
		{#if carregando}
			<div class="flex h-64 items-center justify-center">
				<div class="flex flex-col items-center gap-3">
					<div class="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"></div>
					<span class="font-mono text-xs font-semibold text-slate-500 uppercase tracking-widest">
						Carregando seus dados de saúde...
					</span>
				</div>
			</div>
		{:else}
			{@render children()}
		{/if}
	</main>

	<!-- Mobile Bottom Navigation Bar (App Experience) -->
	<nav
		class="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
	>
		<div class="grid grid-cols-5 py-1 px-1">
			{#each navItems as item}
				{@const ativo = isAtivo(item.href, item.exact)}
				<a
					href={item.href}
					class="flex flex-col items-center justify-center py-1.5 transition-all {ativo
						? 'text-emerald-700 font-bold'
						: 'text-slate-500 hover:text-slate-800 font-medium'}"
				>
					<div class="relative">
						<item.icon size={21} stroke={ativo ? 2.5 : 1.8} class={ativo ? 'scale-110 transition-transform' : ''} />
						{#if item.href === '/paciente/notificacoes' && contagemNotificacoes > 0}
							<span class="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white"></span>
						{/if}
					</div>
					<span class="mt-1 text-[10px] tracking-tight">{item.label}</span>
				</a>
			{/each}
		</div>
	</nav>
</div>
