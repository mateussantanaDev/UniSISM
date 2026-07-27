<script lang="ts">
	import SidebarCeo from '$lib/presentation/components/SidebarCeo.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { MeResponse } from '$lib/api/types';
	import { rbac, setAuthContext } from '$lib/presentation/contexts/authContext';

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
			if (sessao.role !== 'REGULADOR_SMS' && sessao.role !== 'MEDICO' && sessao.role !== 'COORDENADOR_UBS' && sessao.role !== 'ADMIN' && sessao.role !== 'DESENVOLVEDOR') {
				goto(rbac.faceDestinoPadrao(sessao.role), { replaceState: true });
				return;
			}
			me = sessao;

			const path = page.url.pathname as string;
			if (path === '/ceo' || path === '/ceo/') {
				goto('/ceo/recepcao/fila');
			}
		} catch (e) {
			if (e instanceof ApiError && e.status !== 401) {
				api.tokens.set(null);
				goto('/login', { replaceState: true });
			}
		} finally {
			autenticando = false;
		}
	});

	const pageTitles: Record<string, { label: string; crumb: string }> = {
		'/ceo/recepcao/fila': {
			label: 'RECEPÇÃO CEO · FILA DA REGULAÇÃO',
			crumb: 'CEO / RECEPÇÃO / FILA'
		},
		'/ceo/recepcao/agenda': {
			label: 'RECEPÇÃO CEO · AGENDA DO DIA',
			crumb: 'CEO / RECEPÇÃO / AGENDA'
		},
		'/ceo/recepcao/balcao': {
			label: 'RECEPÇÃO CEO · AGENDAMENTO BALCÃO',
			crumb: 'CEO / RECEPÇÃO / BALCÃO'
		},
		'/ceo/medico/agenda': {
			label: 'MÉDICO CEO · CONSULTÓRIO DIGITAL SOAP',
			crumb: 'CEO / MÉDICO / CONSULTÓRIO'
		},
		'/ceo/medico/historico': {
			label: 'MÉDICO CEO · HISTÓRICO DE ATENDIMENTOS',
			crumb: 'CEO / MÉDICO / HISTÓRICO'
		},
		'/ceo/medico/desempenho': {
			label: 'MÉDICO CEO · INDICADORES & DESEMPENHO',
			crumb: 'CEO / MÉDICO / DESEMPENHO'
		},
		'/ceo/gestao/dashboard': {
			label: 'DIRETORIA CEO · TORRE DE CONTROLE EXECUTIVA',
			crumb: 'CEO / GESTÃO / DASHBOARD'
		},
		'/ceo/gestao/usuarios': {
			label: 'DIRETORIA CEO · GESTÃO DE EQUIPES & USUÁRIOS',
			crumb: 'CEO / GESTÃO / USUÁRIOS'
		},
		'/ceo/gestao/vagas': {
			label: 'DIRETORIA CEO · MATRIZ DE COTAS & ESCALAS',
			crumb: 'CEO / GESTÃO / VAGAS'
		},
		'/ceo/gestao/salas': {
			label: 'DIRETORIA CEO · CONSULTÓRIOS & INFRAESTRUTURA',
			crumb: 'CEO / GESTÃO / SALAS'
		},
		'/ceo/gestao/especialidades': {
			label: 'DIRETORIA CEO · CATÁLOGO & SIGTAP',
			crumb: 'CEO / GESTÃO / ESPECIALIDADES'
		},
		'/ceo/gestao/producao': {
			label: 'DIRETORIA CEO · PRODUÇÃO & AUDITORIA',
			crumb: 'CEO / GESTÃO / PRODUÇÃO'
		}
	};

	let meta = $derived(pageTitles[page.url.pathname] ?? { label: 'CENTRO DE ESPECIALIDADES ODONTOLÓGICAS (CEO)', crumb: 'CEO' });
</script>

<div class="flex h-screen w-screen overflow-hidden bg-slate-100 font-mono text-slate-900">
	<SidebarCeo />

	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Topbar do CEO -->
		<header class="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 font-mono text-xs">
			<div class="flex items-center gap-3">
				<span class="bg-emerald-800 px-2 py-0.5 font-mono text-[10px] font-bold text-white uppercase">
					CEO
				</span>
				<span class="font-mono text-[11px] font-bold tracking-wider text-slate-500">
					{meta.crumb}
				</span>
				<span class="text-slate-300">|</span>
				<h1 class="font-mono text-xs font-extrabold text-slate-900 uppercase">
					{meta.label}
				</h1>
			</div>

			<div class="flex items-center gap-4 text-[11px] text-slate-600 font-mono">
				<a href="/cem/recepcao/fila" class="text-blue-900 font-bold hover:underline">
					🔄 Alternar para Centro Médico (CEM) →
				</a>
				<span>|</span>
				<span>{me?.prefeitura ?? 'Prefeitura Sede'}</span>
				<span>|</span>
				<span class="font-bold text-emerald-700">CONECTADO ON-LINE</span>
			</div>
		</header>

		<!-- Área de Conteúdo -->
		<main class="flex-1 overflow-y-auto p-6">
			{#if autenticando}
				<div class="flex h-full items-center justify-center font-mono text-xs text-slate-500">
					Autenticando sessão do Centro de Especialidades Médicas (CEO)...
				</div>
			{:else}
				{@render children()}
			{/if}
		</main>
	</div>
</div>
