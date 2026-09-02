<script lang="ts">
	import Sidebar from '$lib/presentation/components/Sidebar.svelte';
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
		// Guard 1: sem token → /login
		if (!api.tokens.get()) {
			goto('/login', { replaceState: true });
			return;
		}
		try {
			const sessao = await api.auth.me();
			// Guard 2: a role do usuário pode acessar a Face 1 (UBS)?
			// Quem não puder é redirecionado pra Face correta.
			if (!rbac.podeAcessarFace1UBS(sessao.role)) {
				goto(rbac.faceDestinoPadrao(sessao.role), { replaceState: true });
				return;
			}
			me = sessao;
		} catch (e) {
			// 401 já é tratado pelo onUnauthorized do client.
			if (e instanceof ApiError && e.status !== 401) {
				api.tokens.set(null);
				goto('/login', { replaceState: true });
			}
		} finally {
			autenticando = false;
		}
	});

	const pageTitles: Record<string, { label: string; crumb: string }> = {
		'/ubs/dashboard': { label: 'VISÃO GERAL', crumb: 'UBS / DASHBOARD / VISÃO GERAL' },
		'/ubs/recepcao/fila': {
			label: 'RECEPÇÃO · FILA DIÁRIA & ACOLHIMENTO',
			crumb: 'UBS / RECEPÇÃO / FILA'
		},
		'/ubs/medico/agenda': {
			label: 'CONSULTÓRIO · AGENDA & ATENDIMENTO CLÍNICO',
			crumb: 'UBS / CONSULTÓRIO / AGENDA'
		},
		'/ubs/recepcao/painel': {
			label: 'SALA DE ESPERA · PAINEL TV DE CHAMADAS',
			crumb: 'UBS / PAINEL TV / CHAMADA'
		},
		'/ubs/dashboard/producao': {
			label: 'DASHBOARD · MINHA PRODUÇÃO',
			crumb: 'UBS / DASHBOARD / PRODUÇÃO'
		},
		'/ubs/dashboard/fila': {
			label: 'DASHBOARD · FILA DE REGULAÇÃO',
			crumb: 'UBS / DASHBOARD / FILA'
		},
		'/ubs/novo-encaminhamento': {
			label: 'NOVO ENCAMINHAMENTO · 1. UPLOAD',
			crumb: 'UBS / INGESTÃO / UPLOAD'
		},
		'/ubs/novo-encaminhamento/revisao': {
			label: 'NOVO ENCAMINHAMENTO · 2. REVISÃO',
			crumb: 'UBS / INGESTÃO / REVISÃO'
		},
		'/ubs/novo-encaminhamento/confirmacao': {
			label: 'NOVO ENCAMINHAMENTO · 3. CONFIRMAÇÃO',
			crumb: 'UBS / INGESTÃO / CONFIRMAÇÃO'
		},
		'/ubs/historico': { label: 'HISTÓRICO · TODOS', crumb: 'UBS / HISTÓRICO / TODOS' },
		'/ubs/historico/aguardando': {
			label: 'HISTÓRICO · AGUARDANDO REGULAÇÃO',
			crumb: 'UBS / HISTÓRICO / AGUARDANDO'
		},
		'/ubs/historico/pendencias': {
			label: 'HISTÓRICO · PENDÊNCIAS',
			crumb: 'UBS / HISTÓRICO / PENDÊNCIAS'
		},
		'/ubs/historico/aprovados': {
			label: 'HISTÓRICO · APROVADOS',
			crumb: 'UBS / HISTÓRICO / APROVADOS'
		},
		'/ubs/historico/rejeitados': {
			label: 'HISTÓRICO · REJEITADOS',
			crumb: 'UBS / HISTÓRICO / REJEITADOS'
		},
		'/ubs/pacientes': {
			label: 'PACIENTES DO POSTO',
			crumb: 'UBS / PACIENTES'
		},
		'/ubs/respostas-sms': {
			label: 'RESPOSTAS OFICIAIS DO SUS',
			crumb: 'UBS / RESPOSTAS SMS'
		},
		'/ubs/perfil': { label: 'PERFIL · VISÃO GERAL', crumb: 'UBS / PERFIL / VISÃO GERAL' },
		'/ubs/perfil/conta': { label: 'PERFIL · CONTA', crumb: 'UBS / PERFIL / CONTA' },
		'/ubs/perfil/seguranca': {
			label: 'PERFIL · SEGURANÇA',
			crumb: 'UBS / PERFIL / SEGURANÇA'
		},
		'/ubs/perfil/producao': { label: 'PERFIL · PRODUÇÃO', crumb: 'UBS / PERFIL / PRODUÇÃO' },
		'/ubs/perfil/relatorios': { label: 'PERFIL · RELATÓRIOS', crumb: 'UBS / PERFIL / RELATÓRIOS' }
	};

	const pacienteSub: Record<string, { label: string; crumb: string }> = {
		'': { label: 'PACIENTE · RESUMO', crumb: 'UBS / PACIENTES / RESUMO' },
		'/cadastro': {
			label: 'PACIENTE · CADASTRO',
			crumb: 'UBS / PACIENTES / CADASTRO'
		},
		'/quadro-clinico': {
			label: 'PACIENTE · QUADRO CLÍNICO',
			crumb: 'UBS / PACIENTES / QUADRO CLÍNICO'
		},
		'/atendimentos': {
			label: 'PACIENTE · ATENDIMENTOS',
			crumb: 'UBS / PACIENTES / ATENDIMENTOS'
		},
		'/encaminhamentos': {
			label: 'PACIENTE · ENCAMINHAMENTOS',
			crumb: 'UBS / PACIENTES / ENCAMINHAMENTOS'
		},
		'/viagens': {
			label: 'PACIENTE · VIAGENS TFD',
			crumb: 'UBS / PACIENTES / TFD'
		},
		'/exames': {
			label: 'PACIENTE · EXAMES',
			crumb: 'UBS / PACIENTES / EXAMES'
		},
		'/vacinas': {
			label: 'PACIENTE · VACINAÇÃO',
			crumb: 'UBS / PACIENTES / VACINAS'
		}
	};

	const detalheSub: Record<string, { label: string; crumb: string }> = {
		'': { label: 'RESUMO DO ENCAMINHAMENTO', crumb: 'UBS / HISTÓRICO / DETALHE' },
		'/paciente': {
			label: 'DETALHE · IDENTIFICAÇÃO DO PACIENTE',
			crumb: 'UBS / HISTÓRICO / DETALHE / PACIENTE'
		},
		'/clinico': {
			label: 'DETALHE · SOLICITAÇÃO CLÍNICA',
			crumb: 'UBS / HISTÓRICO / DETALHE / CLÍNICO'
		},
		'/anexos': {
			label: 'DETALHE · ANEXOS',
			crumb: 'UBS / HISTÓRICO / DETALHE / ANEXOS'
		},
		'/historico': {
			label: 'DETALHE · LINHA DO TEMPO',
			crumb: 'UBS / HISTÓRICO / DETALHE / LINHA DO TEMPO'
		}
	};

	let pageInfo = $derived.by(() => {
		const encMatch = page.url.pathname.match(/^\/ubs\/encaminhamento\/[^/]+(.*)$/);
		if (encMatch) {
			const sub = encMatch[1] ?? '';
			return detalheSub[sub] ?? detalheSub[''];
		}
		const pacMatch = page.url.pathname.match(/^\/ubs\/pacientes\/[^/]+(.*)$/);
		if (pacMatch) {
			const sub = pacMatch[1] ?? '';
			return pacienteSub[sub] ?? pacienteSub[''];
		}
		// Detalhe de uma resposta SMS específica
		if (/^\/ubs\/respostas-sms\/[^/]+$/.test(page.url.pathname)) {
			return {
				label: 'RESPOSTA SMS · DETALHE',
				crumb: 'UBS / RESPOSTAS SMS / DETALHE'
			};
		}
		return pageTitles[page.url.pathname] ?? { label: 'UBS', crumb: 'UBS' };
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

<svelte:head>
	<title>{pageInfo.label} · UBS · UniSISM</title>
</svelte:head>

{#if autenticando}
	<div class="flex h-screen items-center justify-center bg-slate-50">
		<div class="flex flex-col items-center gap-3">
			<div
				class="h-8 w-8 animate-spin border-[3px] border-blue-900 border-t-transparent"
			></div>
			<div class="font-mono text-xs tracking-widest text-slate-600 uppercase">
				Verificando sessão...
			</div>
		</div>
	</div>
{:else if me}
	<div class="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
		<Sidebar />

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
				<div class="flex items-center gap-4">
					<div class="hidden items-center gap-2 md:flex">
						<span
							class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-emerald-800"
						>
							API · OK
						</span>
						<span
							class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700"
						>
							{me.role}
						</span>
					</div>
					<div class="text-right font-mono text-[11px] leading-tight text-slate-700">
						<div class="font-bold">{relogio}</div>
						<div class="text-[10px] tracking-wider text-slate-500">UTC−03 · BRASÍLIA</div>
					</div>
				</div>
			</header>

			<main class="flex-1 overflow-y-auto">
				<div class="mx-auto w-full max-w-[1600px] px-6 py-5">
					{@render children()}
				</div>
			</main>

			<footer
				class="flex items-center justify-between border-t border-slate-200 bg-gradient-to-r from-white to-slate-50 px-6 py-2 font-mono text-[10px] tracking-wider text-slate-500"
			>
				<div>UNISISM v0.1.0 · FACE 1 / UBS · BUILD 2026.04</div>
				<div class="flex items-center gap-3">
					<span>ATENDENTE: {me.matricula}</span>
					{#if me.unidade}
						<span>UNIDADE: {me.unidade}</span>
					{/if}
					<span>ESCOPO: {me.escopo}</span>
				</div>
			</footer>
		</div>
	</div>
{/if}
