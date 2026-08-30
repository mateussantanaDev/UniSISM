<script lang="ts">
	import SidebarCem from '$lib/presentation/components/SidebarCem.svelte';
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
			const superUser = sessao.role === 'ADMIN' || sessao.role === 'DESENVOLVEDOR';
			const ehCeo = sessao.tipoUnidade === 'CEO' || (sessao.unidade?.toUpperCase().includes('CEO') || sessao.unidade?.toUpperCase().includes('ODONTOL'));

			if (!superUser && ehCeo) {
				goto(rbac.faceDestinoPadrao(sessao.role, sessao), { replaceState: true });
				return;
			}

			const allowedRoles = ['REGULADOR_SMS', 'MEDICO', 'MEDICO_ESPECIALISTA', 'ATENDENTE_CENTRO', 'COORDENADOR_UBS', 'ATENDENTE_UBS'];
			if (!allowedRoles.includes(sessao.role) && !superUser) {
				goto(rbac.faceDestinoPadrao(sessao.role, sessao), { replaceState: true });
				return;
			}
			me = sessao;

			const path = page.url.pathname as string;
			if (path === '/cem' || path === '/cem/') {
				goto('/cem/recepcao/fila');
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
		'/cem/recepcao/fila': {
			label: 'RECEPÇÃO CEM · FILA DA REGULAÇÃO',
			crumb: 'CEM / RECEPÇÃO / FILA'
		},
		'/cem/recepcao/agenda': {
			label: 'RECEPÇÃO CEM · AGENDA DO DIA',
			crumb: 'CEM / RECEPÇÃO / AGENDA'
		},
		'/cem/recepcao/balcao': {
			label: 'RECEPÇÃO CEM · AGENDAMENTO BALCÃO',
			crumb: 'CEM / RECEPÇÃO / BALCÃO'
		},
		'/cem/recepcao/painel': {
			label: 'RECEPÇÃO CEM · PAINEL TV DE CHAMADAS',
			crumb: 'CEM / RECEPÇÃO / PAINEL'
		},
		'/cem/pacientes': {
			label: 'BASE DE PACIENTES · HISTÓRICO CEM',
			crumb: 'CEM / PACIENTES'
		},
		'/cem/medico/agenda': {
			label: 'MÉDICO CEM · CONSULTÓRIO DIGITAL SOAP',
			crumb: 'CEM / MÉDICO / CONSULTÓRIO'
		},
		'/cem/medico/historico': {
			label: 'MÉDICO CEM · HISTÓRICO DE ATENDIMENTOS',
			crumb: 'CEM / MÉDICO / HISTÓRICO'
		},
		'/cem/medico/desempenho': {
			label: 'MÉDICO CEM · INDICADORES & DESEMPENHO',
			crumb: 'CEM / MÉDICO / DESEMPENHO'
		},
		'/cem/gestao/dashboard': {
			label: 'DIRETORIA CEM · TORRE DE CONTROLE EXECUTIVA',
			crumb: 'CEM / GESTÃO / DASHBOARD'
		},
		'/cem/gestao/analytics': {
			label: 'DIRETORIA CEM · ANALYTICS & INDICADORES',
			crumb: 'CEM / GESTÃO / ANALYTICS'
		},
		'/cem/gestao/usuarios': {
			label: 'DIRETORIA CEM · GESTÃO DE EQUIPES & USUÁRIOS',
			crumb: 'CEM / GESTÃO / USUÁRIOS'
		},
		'/cem/gestao/vagas': {
			label: 'DIRETORIA CEM · MATRIZ DE COTAS & ESCALAS',
			crumb: 'CEM / GESTÃO / VAGAS'
		},
		'/cem/gestao/salas': {
			label: 'DIRETORIA CEM · CONSULTÓRIOS & INFRAESTRUTURA',
			crumb: 'CEM / GESTÃO / SALAS'
		},
		'/cem/gestao/especialidades': {
			label: 'DIRETORIA CEM · CATÁLOGO SIGTAP MÉDICO',
			crumb: 'CEM / GESTÃO / ESPECIALIDADES'
		},
		'/cem/gestao/producao': {
			label: 'DIRETORIA CEM · PRODUÇÃO & FATURAMENTO BPA',
			crumb: 'CEM / GESTÃO / PRODUÇÃO'
		},
		'/cem/gestao/auditoria': {
			label: 'DIRETORIA CEM · TRILHA DE AUDITORIA CFM',
			crumb: 'CEM / GESTÃO / AUDITORIA'
		}
	};

	let meta = $derived(pageTitles[page.url.pathname] ?? { label: 'CENTRO DE ESPECIALIDADES MÉDICAS', crumb: 'CEM' });
</script>

<div class="flex h-screen w-screen overflow-hidden bg-slate-100 font-mono text-slate-900">
	<SidebarCem />

	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Topbar do CEM -->
		<header class="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 font-mono text-xs">
			<div class="flex items-center gap-3">
				<span class="bg-indigo-900 px-2 py-0.5 font-mono text-[10px] font-bold text-white uppercase">
					CEM
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
				{#if me?.role === 'ADMIN' || me?.role === 'DESENVOLVEDOR'}
					<a href="/ceo/recepcao/fila" class="text-emerald-800 font-bold hover:underline">
						🔄 Alternar para Centro Odontológico (CEO) →
					</a>
					<span>|</span>
				{/if}
				<span>{me?.prefeitura ?? 'Prefeitura Sede'}</span>
				<span>|</span>
				<span class="font-bold text-emerald-700">CONECTADO ON-LINE</span>
			</div>
		</header>

		<!-- Área de Conteúdo -->
		<main class="flex-1 overflow-y-auto p-6">
			{#if autenticando}
				<div class="flex h-full items-center justify-center font-mono text-xs text-slate-500">
					Autenticando sessão do Centro de Especialidades Médicas (CEM)...
				</div>
			{:else}
				{@render children()}
			{/if}
		</main>
	</div>
</div>
