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
		IconActivity
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
			minute: '2-digit',
			second: '2-digit'
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
		{ href: '/paciente', label: 'Início', crumb: 'INÍCIO', icon: IconHome, exact: true },
		{ href: '/paciente/encaminhamentos', label: 'Consultas', crumb: 'CONSULTAS & ENCAMINHAMENTOS', icon: IconCalendarEvent },
		{ href: '/paciente/tfd', label: 'TFD', crumb: 'TRANSPORTE TFD', icon: IconBus },
		{ href: '/paciente/dossie', label: 'Dossiê Clínico', crumb: 'DOSSIÊ CLÍNICO', icon: IconNotes },
		{ href: '/paciente/perfil', label: 'Meu Perfil', crumb: 'PERFIL DO CIDADÃO', icon: IconUser }
	];

	function isAtivo(itemHref: string, exact = false) {
		const currentPath = page.url.pathname;
		if (exact) return currentPath === itemHref;
		return currentPath.startsWith(itemHref);
	}

	let crumbAtual = $derived.by(() => {
		const item = navItems.find((n) => isAtivo(n.href, n.exact));
		if (page.url.pathname === '/paciente/notificacoes') return 'NOTIFICAÇÕES';
		if (page.url.pathname === '/paciente/trocar-senha') return 'SEGURANÇA · TROCAR SENHA';
		if (page.url.pathname === '/paciente/esqueci-senha') return 'RECUPERAÇÃO DE ACESSO';
		return item ? item.crumb : 'PORTAL DO CIDADÃO';
	});
</script>

<svelte:head>
	<title>Portal do Cidadão · UniSISM Águas Belas</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
	<!-- Top Bar Municipal -->
	<header
		class="sticky top-0 z-40 border-b border-slate-200 bg-gradient-to-r from-white via-white to-slate-50 px-4 py-3 sm:px-6 shadow-sm"
	>
		<div class="mx-auto flex max-w-[1600px] items-center justify-between">
			<!-- Logo / Crumb -->
			<div class="flex items-center gap-3">
				<a href="/paciente" class="flex items-center gap-2.5 transition-opacity hover:opacity-90">
					<div
						class="flex h-8 w-8 items-center justify-center bg-blue-900 font-mono text-xs font-bold text-white"
					>
						SUS
					</div>
					<div class="leading-tight">
						<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
							ÁGUAS BELAS · PORTAL DO CIDADÃO
						</div>
						<div class="font-mono text-sm font-bold tracking-wide text-slate-900 uppercase">
							UniSISM · {crumbAtual}
						</div>
					</div>
				</a>
			</div>

			<!-- Desktop Nav Tabs -->
			<nav class="hidden md:flex items-center gap-1 border-x border-slate-200 px-3">
				{#each navItems as item}
					{@const ativo = isAtivo(item.href, item.exact)}
					<a
						href={item.href}
						class="flex items-center gap-1.5 border px-3 py-1.5 font-mono text-xs font-bold tracking-wider uppercase transition-all {ativo
							? 'border-blue-900 bg-blue-900 text-white'
							: 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900'}"
					>
						<item.icon size={15} />
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>

			<!-- Right Status & User Badges -->
			<div class="flex items-center gap-3">
				<div class="hidden items-center gap-2 lg:flex">
					<span
						class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800"
					>
						SUS · ATIVO
					</span>
					{#if me}
						<span
							class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700"
						>
							CPF {me.cpfFormatado || me.cpf}
						</span>
					{/if}
				</div>

				<div class="hidden text-right font-mono text-[11px] leading-tight text-slate-700 sm:block">
					<div class="font-bold">{relogio}</div>
					<div class="text-[10px] tracking-wider text-slate-500">UTC−03 · BRASÍLIA</div>
				</div>

				<!-- Notificações -->
				<a
					href="/paciente/notificacoes"
					class="relative flex h-8 w-8 items-center justify-center border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
					title="Notificações"
				>
					<IconBell size={16} />
					{#if contagemNotificacoes > 0}
						<span
							class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center bg-red-700 font-mono text-[9px] font-bold text-white"
						>
							{contagemNotificacoes > 9 ? '9+' : contagemNotificacoes}
						</span>
					{/if}
				</a>

				<!-- Perfil / Logout -->
				{#if me}
					<button
						onclick={logout}
						class="flex h-8 w-8 items-center justify-center border border-slate-300 bg-white text-slate-700 transition-colors hover:border-red-700 hover:bg-red-50 hover:text-red-800"
						title="Encerrar sessão"
					>
						<IconLogout size={16} />
					</button>
				{/if}
			</div>
		</div>
	</header>

	<!-- Main Content Container with bottom padding on mobile for nav bar -->
	<main class="flex-1 pb-24 md:pb-8">
		{#if carregando}
			<div class="flex h-64 items-center justify-center">
				<div class="flex flex-col items-center gap-3">
					<div class="h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"></div>
					<span class="font-mono text-xs font-bold tracking-widest text-slate-600 uppercase">
						Carregando dados do cidadão...
					</span>
				</div>
			</div>
		{:else}
			{@render children()}
		{/if}
	</main>

	<!-- Desktop Municipal Footer -->
	<footer
		class="hidden md:flex items-center justify-between border-t border-slate-200 bg-gradient-to-r from-white to-slate-50 px-6 py-2 font-mono text-[10px] tracking-wider text-slate-500"
	>
		<div>UNISISM v0.1.0 · PORTAL DO CIDADÃO · ÁGUAS BELAS - PE</div>
		<div class="flex items-center gap-3">
			{#if me}
				<span>CIDADÃO: {me.nome}</span>
				<span>CPF: {me.cpfFormatado}</span>
				{#if me.cns}
					<span>CNS: {me.cns}</span>
				{/if}
			{/if}
		</div>
	</footer>

	<!-- Mobile Bottom Navigation Bar (B2G Brutalist) -->
	<nav
		class="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-300 bg-white md:hidden shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
	>
		<div class="grid grid-cols-5">
			{#each navItems as item}
				{@const ativo = isAtivo(item.href, item.exact)}
				<a
					href={item.href}
					class="flex flex-col items-center justify-center py-2 transition-all border-r border-slate-100 last:border-r-0 {ativo
						? 'border-t-2 border-t-blue-900 -mt-[2px] bg-slate-50 text-blue-950 font-bold'
						: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}"
				>
					<div class="relative">
						<item.icon size={19} stroke={ativo ? 2.4 : 1.8} />
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
