<script lang="ts">
	import SidebarCentro from '$lib/presentation/components/SidebarCentro.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { MeResponse } from '$lib/api/types';
	import { rbac, setAuthContext } from '$lib/presentation/contexts/authContext';
	import { IconArrowsExchange } from '@tabler/icons-svelte';

	let { children } = $props();

	let me = $state<MeResponse | null>(null);
	let autenticando = $state(true);

	async function logout() {
		try {
			await api.auth.logout();
		} finally {
			me = null;
			goto('/login', { replaceState: true });
		}
	}

	setAuthContext({
		get me() {
			return me;
		},
		get carregando() {
			return autenticando;
		},
		get podeConsolidarEncaminhamento() {
			return rbac.podeConsolidarEncaminhamento(me?.role);
		},
		get podeCriarUsuario() {
			return rbac.podeCriarUsuario(me?.role);
		},
		get podeCriarUbs() {
			return rbac.podeCriarUbs(me?.role);
		},
		get podeCriarPrefeitura() {
			return rbac.podeCriarPrefeitura(me?.role);
		},
		get ehAdminGlobalOuPrefeitura() {
			return me?.escopo === 'GLOBAL' || me?.escopo === 'PREFEITURA';
		},
		get ehAdminOuDev() {
			return rbac.podeAdministrarRecursos(me?.role);
		},
		logout
	});

	onMount(async () => {
		if (!api.tokens.get()) {
			goto('/login', { replaceState: true });
			return;
		}
		try {
			const sessao = await api.auth.me();
			const superUser = sessao.role === 'ADMIN' || sessao.role === 'DESENVOLVEDOR';
			const allowedRoles = ['REGULADOR_SMS', 'MEDICO', 'MEDICO_ESPECIALISTA', 'ATENDENTE_CENTRO', 'COORDENADOR_UBS', 'ATENDENTE_UBS'];
			if (!allowedRoles.includes(sessao.role) && !superUser) {
				goto(rbac.faceDestinoPadrao(sessao.role, sessao), { replaceState: true });
				return;
			}
			me = sessao;
			
			// Redirecionamento da raiz /centro para a recepção por padrão
			const path = page.url.pathname as string;
			if (path === '/centro' || path === '/centro/') {
				goto('/centro/recepcao/fila');
			}
		} catch (e) {
			api.tokens.set(null);
			goto('/login', { replaceState: true });
		} finally {
			autenticando = false;
		}
	});

	const pageTitles: Record<string, { label: string; crumb: string }> = {
		'/centro/recepcao/fila': {
			label: 'RECEPÇÃO · FILA DA REGULAÇÃO',
			crumb: 'CENTRO / RECEPÇÃO / FILA'
		},
		'/centro/recepcao/agenda': {
			label: 'RECEPÇÃO · AGENDA DO DIA',
			crumb: 'CENTRO / RECEPÇÃO / AGENDA'
		},
		'/centro/recepcao/balcao': {
			label: 'RECEPÇÃO · AGENDAMENTO BALCÃO',
			crumb: 'CENTRO / RECEPÇÃO / BALCÃO'
		},
		'/centro/medico/agenda': {
			label: 'MÉDICO · MINHA AGENDA',
			crumb: 'CENTRO / MÉDICO / AGENDA'
		},
		'/centro/gestao/vagas': {
			label: 'GESTÃO · CONTROLE DE VAGAS',
			crumb: 'CENTRO / GESTÃO / VAGAS'
		},
		'/centro/gestao/producao': {
			label: 'GESTÃO · PRODUÇÃO E RELATÓRIOS',
			crumb: 'CENTRO / GESTÃO / RELATÓRIOS'
		}
	};

	let pageInfo = $derived.by(() => {
		const p = page.url.pathname;
		return pageTitles[p] ?? { label: 'CENTRO DE ESPECIALIDADES', crumb: 'CENTRO' };
	});

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
</script>

{#if autenticando}
	<div class="flex h-screen items-center justify-center bg-slate-50">
		<div class="flex flex-col items-center gap-3">
			<div class="h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"></div>
			<div class="font-mono text-xs tracking-widest text-slate-600 uppercase">
				Verificando sessão...
			</div>
		</div>
	</div>
{:else if me}
	<div class="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
		<SidebarCentro />

		<div class="flex flex-1 flex-col overflow-hidden">
			<header
				class="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-white via-white to-slate-50 px-6 py-3.5"
			>
				<div class="leading-tight">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						{pageInfo.crumb}
					</div>
					<h1 class="font-mono text-base font-bold tracking-wide text-slate-900">
						{pageInfo.label}
					</h1>
				</div>
				<div class="flex items-center gap-4 font-mono text-xs">
					{#if me?.role === 'ADMIN' || me?.role === 'DESENVOLVEDOR'}
						<a href="/cem/recepcao/fila" class="text-blue-900 font-bold hover:underline flex items-center gap-1">
							<IconArrowsExchange size={14} />
							<span>Alternar para Centro Médico (CEM) →</span>
						</a>
						<span class="text-slate-300">|</span>
					{/if}
					<div class="hidden items-center gap-2 md:flex">
						<span class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-bold tracking-widest text-emerald-800 uppercase">
							API · OK
						</span>
						<span class="border border-slate-300 bg-white px-2 py-0.5 font-bold tracking-widest text-slate-700 uppercase">
							{me.role}
						</span>
					</div>
					<div class="text-slate-500 font-mono text-[11px] font-semibold">{relogio}</div>
				</div>
			</header>

			<main class="flex-1 overflow-y-auto px-6 py-5">
				{@render children()}
			</main>

			<footer class="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-2.5 font-mono text-[10px] text-slate-500">
				<div>UNISISM · CENTRO DE ESPECIALIDADES MUNICIPAL v1.0.0</div>
				<div>OPERADOR: {me.nome.toUpperCase()}</div>
			</footer>
		</div>
	</div>
{/if}

<style>
	header, footer, span {
		border-radius: 0 !important;
	}
</style>
