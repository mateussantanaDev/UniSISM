<script lang="ts">
	import SidebarSMS from '$lib/presentation/components/SidebarSMS.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { MeResponse } from '$lib/api/types';
	import { rbac, setAuthContext } from '$lib/presentation/contexts/authContext';

	let { children } = $props();

	// ─────────── Estado da sessão ───────────
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
		// Face 1 — mantido para compatibilidade com componentes compartilhados
		get podeConsolidarEncaminhamento() {
			return rbac.podeConsolidarEncaminhamento(me?.role);
		},
		// Face 2 — helpers da Regulação
		get podeAprovarEncaminhamento() {
			return rbac.podeAprovarEncaminhamento(me?.role);
		},
		get podeRegistrarPendencia() {
			return rbac.podeRegistrarPendencia(me?.role);
		},
		get podeRejeitarEncaminhamento() {
			return rbac.podeRejeitarEncaminhamento(me?.role);
		},
		get podeVerFilaRegulacao() {
			return rbac.podeVerFilaRegulacao(me?.role);
		},
		get ehReguladorSimples() {
			return rbac.ehReguladorSimples(me?.role);
		},
		// Administração
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

	// ─────────── Auth guard (§8.3) ───────────
	onMount(async () => {
		// Guard 1: sem token → /login
		if (!api.tokens.get()) {
			goto('/login', { replaceState: true });
			return;
		}
		try {
			const sessao = await api.auth.me();
			// Guard 2: a role do usuário pode acessar a Face 2 (SMS)?
			// Quem não puder (ex.: ATENDENTE_UBS) é redirecionado
			// automaticamente pra Face correta (UBS), evitando vazamento de UI.
			if (!rbac.podeAcessarFace2SMS(sessao.role)) {
				goto(rbac.faceDestinoPadrao(sessao.role, sessao), { replaceState: true });
				return;
			}
			me = sessao;
		} catch (e) {
			if (e instanceof ApiError && e.status !== 401) {
				api.tokens.set(null);
				goto('/login', { replaceState: true });
			}
		} finally {
			autenticando = false;
		}
	});

	// ─────────── Breadcrumbs (§8.4) ───────────
	const pageTitles: Record<string, { label: string; crumb: string }> = {
		// Regulação
		'/sms/regulacao': {
			label: 'REGULAÇÃO DE ENCAMINHAMENTOS',
			crumb: 'SMS / REGULAÇÃO / FILTRO GLOBAL'
		},
		// Dashboard
		'/sms/dashboard': {
			label: 'DASHBOARD · VISÃO GERAL',
			crumb: 'SMS / DASHBOARD / VISÃO GERAL'
		},
		'/sms/dashboard/pendentes': {
			label: 'DASHBOARD · PENDÊNCIAS',
			crumb: 'SMS / DASHBOARD / PENDENTES'
		},
		'/sms/dashboard/aprovados': {
			label: 'DASHBOARD · APROVADOS',
			crumb: 'SMS / DASHBOARD / APROVADOS'
		},
		'/sms/dashboard/rejeitados': {
			label: 'DASHBOARD · REJEITADOS',
			crumb: 'SMS / DASHBOARD / REJEITADOS'
		},
		// Rede
		'/sms/rede': { label: 'REDE · UBSs', crumb: 'SMS / REDE / UBS' },
		'/sms/rede/ubs': { label: 'REDE · UBSs', crumb: 'SMS / REDE / UBS' },
		'/sms/rede/ubs/nova': { label: 'REDE · NOVA UBS', crumb: 'SMS / REDE / UBS / NOVA' },
		'/sms/rede/usuarios': { label: 'REDE · USUÁRIOS', crumb: 'SMS / REDE / USUÁRIOS' },
		'/sms/rede/usuarios/novo': {
			label: 'REDE · NOVO USUÁRIO',
			crumb: 'SMS / REDE / USUÁRIOS / NOVO'
		},
		// Solicitações Recebidas (explorador atendente)
		'/sms/solicitacoes': {
			label: 'SOLICITAÇÕES RECEBIDAS',
			crumb: 'SMS / SOLICITAÇÕES'
		},
		// Respostas do SUS (explorador atendente)
		'/sms/respostas': {
			label: 'RESPOSTAS DO SUS',
			crumb: 'SMS / RESPOSTAS'
		},
		// Enviados
		'/sms/enviados': { label: 'ENCAMINHAMENTOS ENVIADOS', crumb: 'SMS / ENVIADOS' },
		// Pacientes
		'/sms/pacientes': { label: 'PEC MUNICIPAL', crumb: 'SMS / PACIENTES' },
		// Analytics
		'/sms/analytics': { label: 'ANALYTICS · PRODUÇÃO DA REDE', crumb: 'SMS / ANALYTICS' },
		'/sms/analytics/especialidades': {
			label: 'ANALYTICS · ESPECIALIDADES',
			crumb: 'SMS / ANALYTICS / ESPECIALIDADES'
		},
		'/sms/analytics/sla': { label: 'ANALYTICS · SLA', crumb: 'SMS / ANALYTICS / SLA' },
		'/sms/analytics/geografico': {
			label: 'ANALYTICS · DISTRIBUIÇÃO GEOGRÁFICA',
			crumb: 'SMS / ANALYTICS / GEOGRÁFICO'
		},
		// Relatórios
		'/sms/relatorios': { label: 'RELATÓRIOS DA REDE', crumb: 'SMS / RELATÓRIOS' },
		// Auditoria
		'/sms/auditoria': { label: 'AUDITORIA · TRILHA DE AÇÕES', crumb: 'SMS / AUDITORIA' },
		// Configurações
		'/sms/configuracoes': {
			label: 'CONFIGURAÇÕES · PREFEITURAS',
			crumb: 'SMS / CONFIGURAÇÕES / PREFEITURAS'
		},
		'/sms/configuracoes/parametros': {
			label: 'CONFIGURAÇÕES · PARÂMETROS',
			crumb: 'SMS / CONFIGURAÇÕES / PARÂMETROS'
		},
		'/sms/configuracoes/integracoes': {
			label: 'CONFIGURAÇÕES · INTEGRAÇÕES',
			crumb: 'SMS / CONFIGURAÇÕES / INTEGRAÇÕES'
		},
		// Perfil
		'/sms/perfil': { label: 'PERFIL · VISÃO GERAL', crumb: 'SMS / PERFIL' },
		'/sms/perfil/conta': { label: 'PERFIL · CONTA', crumb: 'SMS / PERFIL / CONTA' },
		'/sms/perfil/seguranca': {
			label: 'PERFIL · SEGURANÇA',
			crumb: 'SMS / PERFIL / SEGURANÇA'
		},
		'/sms/perfil/producao': {
			label: 'PERFIL · PRODUÇÃO',
			crumb: 'SMS / PERFIL / PRODUÇÃO'
		},
		'/sms/perfil/relatorios': {
			label: 'PERFIL · RELATÓRIOS',
			crumb: 'SMS / PERFIL / RELATÓRIOS'
		}
	};

	const pacienteSub: Record<string, { label: string; crumb: string }> = {
		'': { label: 'PACIENTE · RESUMO', crumb: 'SMS / PACIENTES / RESUMO' },
		'/cadastro': { label: 'PACIENTE · CADASTRO', crumb: 'SMS / PACIENTES / CADASTRO' },
		'/quadro-clinico': {
			label: 'PACIENTE · QUADRO CLÍNICO',
			crumb: 'SMS / PACIENTES / QUADRO CLÍNICO'
		},
		'/atendimentos': { label: 'PACIENTE · ATENDIMENTOS', crumb: 'SMS / PACIENTES / ATENDIMENTOS' },
		'/encaminhamentos': {
			label: 'PACIENTE · ENCAMINHAMENTOS',
			crumb: 'SMS / PACIENTES / ENCAMINHAMENTOS'
		},
		'/viagens': { label: 'PACIENTE · VIAGENS TFD', crumb: 'SMS / PACIENTES / TFD' },
		'/exames': { label: 'PACIENTE · EXAMES', crumb: 'SMS / PACIENTES / EXAMES' },
		'/vacinas': { label: 'PACIENTE · VACINAÇÃO', crumb: 'SMS / PACIENTES / VACINAS' }
	};

	const redeUbsSub: Record<string, { label: string; crumb: string }> = {
		'': { label: 'REDE · DETALHE UBS', crumb: 'SMS / REDE / UBS / DETALHE' }
	};

	const redeUsuarioSub: Record<string, { label: string; crumb: string }> = {
		'': { label: 'REDE · DETALHE DO USUÁRIO', crumb: 'SMS / REDE / USUÁRIOS / DETALHE' }
	};

	const detalheSub: Record<string, { label: string; crumb: string }> = {
		'': { label: 'ANÁLISE · RESUMO', crumb: 'SMS / ANÁLISE / RESUMO' },
		'/paciente': {
			label: 'ANÁLISE · PACIENTE',
			crumb: 'SMS / ANÁLISE / PACIENTE'
		},
		'/clinico': {
			label: 'ANÁLISE · SOLICITAÇÃO CLÍNICA',
			crumb: 'SMS / ANÁLISE / CLÍNICO'
		},
		'/anexos': {
			label: 'ANÁLISE · ANEXOS',
			crumb: 'SMS / ANÁLISE / ANEXOS'
		},
		'/historico': {
			label: 'ANÁLISE · LINHA DO TEMPO',
			crumb: 'SMS / ANÁLISE / LINHA DO TEMPO'
		}
	};

	let pageInfo = $derived.by(() => {
		// Detalhe simplificado (3 abas) — rota nova /sms/encaminhamentos/:id
		if (/^\/sms\/encaminhamentos\/[^/]+$/.test(page.url.pathname)) {
			return {
				label: 'ENCAMINHAMENTO · DETALHE',
				crumb: 'SMS / ENCAMINHAMENTO / DETALHE'
			};
		}
		const encMatch = page.url.pathname.match(/^\/sms\/encaminhamento\/[^/]+(.*)$/);
		if (encMatch) {
			const sub = encMatch[1] ?? '';
			return detalheSub[sub] ?? detalheSub[''];
		}
		const pacMatch = page.url.pathname.match(/^\/sms\/pacientes\/[^/]+(.*)$/);
		if (pacMatch) {
			const sub = pacMatch[1] ?? '';
			return pacienteSub[sub] ?? pacienteSub[''];
		}
		const ubsMatch = page.url.pathname.match(/^\/sms\/rede\/ubs\/(?!nova$)[^/]+(.*)$/);
		if (ubsMatch) {
			return redeUbsSub[ubsMatch[1] ?? ''] ?? redeUbsSub[''];
		}
		const usrMatch = page.url.pathname.match(/^\/sms\/rede\/usuarios\/(?!novo$)[^/]+(.*)$/);
		if (usrMatch) {
			return redeUsuarioSub[usrMatch[1] ?? ''] ?? redeUsuarioSub[''];
		}
		// Enviados (árvore dinâmica): UBS / Ano / Mês / Dia
		const ingMatch = page.url.pathname.match(
			/^\/sms\/enviados(?:\/([^/]+)(?:\/(\d+)(?:\/(\d+)(?:\/(\d+))?)?)?)?$/
		);
		if (ingMatch) {
			const [, , ano, mes, dia] = ingMatch;
			if (dia)
				return {
					label: `ENVIADOS · ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`,
					crumb: `SMS / ENVIADOS / UBS / ${ano} / ${mes} / ${dia}`
				};
			if (mes)
				return {
					label: `ENVIADOS · ${ano}/${String(mes).padStart(2, '0')}`,
					crumb: `SMS / ENVIADOS / UBS / ${ano} / ${mes}`
				};
			if (ano) return { label: `ENVIADOS · ${ano}`, crumb: `SMS / ENVIADOS / UBS / ${ano}` };
			if (ingMatch[1]) return { label: 'ENVIADOS · UBS', crumb: 'SMS / ENVIADOS / UBS' };
			return { label: 'ENCAMINHAMENTOS ENVIADOS', crumb: 'SMS / ENVIADOS' };
		}
		return pageTitles[page.url.pathname] ?? { label: 'SMS', crumb: 'SMS' };
	});

	// ─────────── Relógio ───────────
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
	<title>{pageInfo.label} · SMS · UniSISM</title>
</svelte:head>

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
		<SidebarSMS />

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
				<div>UNISISM v0.1.0 · FACE 2 / SMS · BUILD 2026.04</div>
				<div class="flex items-center gap-3">
					<span>REGULADOR: {me.matricula}</span>
					{#if me.prefeitura}
						<span>PREFEITURA: {me.prefeitura}</span>
					{/if}
					<span>ESCOPO: {me.escopo}</span>
				</div>
			</footer>
		</div>
	</div>
{/if}
