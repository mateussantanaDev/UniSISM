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
			const superUser = sessao.role === 'ADMIN' || sessao.role === 'DESENVOLVEDOR';
			const ehCem = sessao.tipoUnidade === 'CEM' || (sessao.unidade?.toUpperCase().includes('CEM') && !sessao.unidade?.toUpperCase().includes('CEO'));

			if (!superUser && ehCem) {
				goto(rbac.faceDestinoPadrao(sessao.role, sessao), { replaceState: true });
				return;
			}

			const allowedRoles = ['REGULADOR_SMS', 'MEDICO', 'MEDICO_ESPECIALISTA', 'ATENDENTE_CENTRO', 'COORDENADOR_UBS', 'ATENDENTE_UBS', 'ENFERMEIRO'];
			if (!allowedRoles.includes(sessao.role) && !superUser) {
				goto(rbac.faceDestinoPadrao(sessao.role, sessao), { replaceState: true });
				return;
			}
			me = sessao;

			const path = page.url.pathname as string;
			if (path === '/ceo' || path === '/ceo/') {
				goto(sessao.role === 'ENFERMEIRO' ? '/ceo/enfermagem/triagem' : '/ceo/recepcao/fila');
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
		'/ceo/enfermagem/triagem': {
			label: 'ENFERMAGEM CEO · TRIAGEM CLÍNICA & SINAIS VITAIS',
			crumb: 'CEO / ENFERMAGEM / TRIAGEM'
		},
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
		'/ceo/whatsapp': {
			label: 'CRM WHATSAPP · ATENDIMENTO MULTI-ATENDENTES META API',
			crumb: 'CEO / WHATSAPP / CRM'
		},
		'/ceo/recepcao/painel': {
			label: 'RECEPÇÃO CEO · PAINEL TV DE CHAMADAS',
			crumb: 'CEO / RECEPÇÃO / PAINEL'
		},
		'/ceo/pacientes': {
			label: 'BASE DE PACIENTES · HISTÓRICO CEO',
			crumb: 'CEO / PACIENTES'
		},
		'/ceo/medico/agenda': {
			label: 'ODONTOLOGIA CEO · CONSULTÓRIO SOAP & ODONTOGRAMA',
			crumb: 'CEO / ODONTO / CONSULTÓRIO'
		},
		'/ceo/medico/historico': {
			label: 'ODONTOLOGIA CEO · HISTÓRICO DE PROCEDIMENTOS',
			crumb: 'CEO / ODONTO / HISTÓRICO'
		},
		'/ceo/medico/desempenho': {
			label: 'ODONTOLOGIA CEO · INDICADORES & DESEMPENHO',
			crumb: 'CEO / ODONTO / DESEMPENHO'
		},
		'/ceo/gestao/dashboard': {
			label: 'COORDENAÇÃO CEO · TORRE DE CONTROLE EXECUTIVA',
			crumb: 'CEO / GESTÃO / DASHBOARD'
		},
		'/ceo/gestao/analytics': {
			label: 'COORDENAÇÃO CEO · ANALYTICS & SAÚDE BUCAL',
			crumb: 'CEO / GESTÃO / ANALYTICS'
		},
		'/ceo/gestao/usuarios': {
			label: 'COORDENAÇÃO CEO · EQUIPES DE SAÚDE BUCAL',
			crumb: 'CEO / GESTÃO / USUÁRIOS'
		},
		'/ceo/gestao/vagas': {
			label: 'COORDENAÇÃO CEO · MATRIZ DE COTAS & ESCALAS',
			crumb: 'CEO / GESTÃO / VAGAS'
		},
		'/ceo/gestao/salas': {
			label: 'COORDENAÇÃO CEO · CADEIRAS ODONTOLÓGICAS',
			crumb: 'CEO / GESTÃO / SALAS'
		},
		'/ceo/gestao/especialidades': {
			label: 'COORDENAÇÃO CEO · CATÁLOGO SIGTAP ODONTO',
			crumb: 'CEO / GESTÃO / ESPECIALIDADES'
		},
		'/ceo/gestao/producao': {
			label: 'COORDENAÇÃO CEO · PRODUÇÃO & BPA-I ODONTO',
			crumb: 'CEO / GESTÃO / PRODUÇÃO'
		},
		'/ceo/gestao/auditoria': {
			label: 'COORDENAÇÃO CEO · TRILHA DE AUDITORIA CFO',
			crumb: 'CEO / GESTÃO / AUDITORIA'
		}
	};

	let meta = $derived(pageTitles[page.url.pathname] ?? { label: 'CENTRO DE ESPECIALIDADES ODONTOLÓGICAS (CEO)', crumb: 'CEO' });
</script>

<svelte:head>
	<title>{meta.label} · CEO · UniSISM</title>
</svelte:head>

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
				{#if me?.role === 'ADMIN' || me?.role === 'DESENVOLVEDOR'}
					<a href="/cem/recepcao/fila" class="text-blue-900 font-bold hover:underline">
						🔄 Alternar para Centro Médico (CEM) →
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
					Autenticando sessão do Centro de Especialidades Médicas (CEO)...
				</div>
			{:else}
				{@render children()}
			{/if}
		</main>
	</div>
</div>
