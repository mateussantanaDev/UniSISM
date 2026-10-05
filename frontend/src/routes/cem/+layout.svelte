<script lang="ts">
	import SidebarCem from '$lib/presentation/components/SidebarCem.svelte';
	import { page } from '$app/state';
	import { goto, afterNavigate } from '$app/navigation';
	import { dialogAccessibility } from '$lib/presentation/actions/dialogAccessibility';
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { MeResponse } from '$lib/api/types';
	import { rbac, setAuthContext } from '$lib/presentation/contexts/authContext';

	let { children } = $props();

	let me = $state<MeResponse | null>(null);
	let autenticando = $state(true);
	let erroAutenticacao = $state('');
	let menuAberto = $state(false);
	afterNavigate(() => (menuAberto = false));

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

	async function autenticar() {
		autenticando = true;
		erroAutenticacao = '';
		if (!api.tokens.get()) {
			goto('/login', { replaceState: true });
			return;
		}
		try {
			const sessao = await api.auth.me();
			const superUser = sessao.role === 'ADMIN' || sessao.role === 'DESENVOLVEDOR';
			const ehCeo =
				sessao.tipoUnidade === 'CEO' ||
				sessao.unidade?.toUpperCase().includes('CEO') ||
				sessao.unidade?.toUpperCase().includes('ODONTOL');

			if (!superUser && ehCeo) {
				goto(rbac.faceDestinoPadrao(sessao.role, sessao), { replaceState: true });
				return;
			}

			const allowedRoles = [
				'REGULADOR_SMS',
				'MEDICO',
				'MEDICO_ESPECIALISTA',
				'ATENDENTE_CENTRO',
				'COORDENADOR_UBS',
				'ATENDENTE_UBS',
				'ENFERMEIRO'
			];
			if (!allowedRoles.includes(sessao.role) && !superUser) {
				goto(rbac.faceDestinoPadrao(sessao.role, sessao), { replaceState: true });
				return;
			}
			me = sessao;

			const path = page.url.pathname as string;
			if (path === '/cem' || path === '/cem/') {
				goto(sessao.role === 'ENFERMEIRO' ? '/cem/enfermagem/triagem' : '/cem/recepcao/fila');
			}
		} catch (e) {
			if (e instanceof ApiError && e.status === 401) {
				if (e.code === 'TROCA_SENHA_OBRIGATORIA') goto('/login/trocar-senha', { replaceState: true });
				else { api.tokens.set(null); goto('/login', { replaceState: true }); }
			} else {
				erroAutenticacao = 'Não foi possível verificar a sessão. Confira a conexão e tente novamente.';
			}
		} finally {
			autenticando = false;
		}
	}
	onMount(() => { void autenticar(); });

	const pageTitles: Record<string, { label: string; crumb: string }> = {
		'/cem/enfermagem/triagem': {
			label: 'ENFERMAGEM CEM · TRIAGEM CLÍNICA & SINAIS VITAIS',
			crumb: 'CEM / ENFERMAGEM / TRIAGEM'
		},
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
		'/cem/whatsapp': {
			label: 'CRM WHATSAPP · ATENDIMENTO MULTI-ATENDENTES META API',
			crumb: 'CEM / WHATSAPP / CRM'
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

	let meta = $derived(
		pageTitles[page.url.pathname] ?? { label: 'CENTRO DE ESPECIALIDADES MÉDICAS', crumb: 'CEM' }
	);
</script>

<svelte:head>
	<title>{meta.label} · CEM · UniSISM</title>
</svelte:head>

<svelte:window onresize={() => { if (window.innerWidth >= 768) menuAberto = false; }} />

<div class="flex h-dvh w-full overflow-hidden bg-slate-100 font-mono text-slate-900">
	<div class="hidden md:block"><SidebarCem /></div>
	{#if menuAberto}
		<div class="fixed inset-0 z-50 bg-slate-900/60 md:hidden">
			<div id="menu-cem-mobile" class="relative h-dvh w-60 bg-white" use:dialogAccessibility={{ label: 'Menu do CEM', onClose: () => (menuAberto = false) }}>
				<button type="button" aria-label="Fechar menu" onclick={() => (menuAberto = false)} class="absolute top-3 right-2 z-10 bg-white px-2 py-1 text-lg">×</button>
				<SidebarCem />
			</div>
		</div>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<!-- Topbar do CEM -->
		<header
			class="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 font-mono text-xs md:px-6"
		>
			<div class="flex min-w-0 items-center gap-2 md:gap-3">
				<button type="button" aria-label="Abrir menu" aria-expanded={menuAberto} aria-controls="menu-cem-mobile" onclick={() => (menuAberto = true)} class="border border-slate-300 px-2 py-1 text-base md:hidden">☰</button>
				<span
					class="bg-indigo-900 px-2 py-0.5 font-mono text-[10px] font-bold text-white uppercase"
				>
					CEM
				</span>
				<span class="hidden font-mono text-[11px] font-bold tracking-wider text-slate-500 xl:inline">
					{meta.crumb}
				</span>
				<span class="hidden text-slate-300 xl:inline">|</span>
				<h1 class="min-w-0 font-mono text-[10px] font-extrabold text-slate-900 uppercase md:text-xs">
					{meta.label}
				</h1>
			</div>

			<div class="hidden items-center gap-4 font-mono text-[11px] text-slate-600 xl:flex">
				{#if me?.role === 'ADMIN' || me?.role === 'DESENVOLVEDOR'}
					<a href="/ceo/recepcao/fila" class="font-bold text-emerald-800 hover:underline">
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
		<main class="min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">
			{#if autenticando}
				<div class="flex h-full items-center justify-center font-mono text-xs text-slate-500">
					Autenticando sessão do Centro de Especialidades Médicas (CEM)...
				</div>
			{:else if erroAutenticacao}
				<div role="alert" class="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
					<p>{erroAutenticacao}</p>
					<button type="button" onclick={autenticar} class="mt-3 border border-amber-700 bg-white px-3 py-2 font-bold">Tentar novamente</button>
				</div>
			{:else}
				{@render children()}
			{/if}
		</main>
	</div>
</div>
