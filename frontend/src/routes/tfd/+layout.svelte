<script lang="ts">
	import SidebarTFD from '$lib/presentation/components/SidebarTFD.svelte';
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
		// Face 1 — exposto para compatibilidade (componentes compartilhados podem ler)
		get podeConsolidarEncaminhamento() {
			return rbac.podeConsolidarEncaminhamento(me?.role);
		},
		// Administração transversal
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
		// Face 4 · TFD
		get podeGerenciarTFD() {
			return rbac.podeGerenciarTFD(me?.role);
		},
		get ehReguladorTfdSimples() {
			return rbac.ehReguladorTfdSimples(me?.role);
		},
		get podeCadastrarUsuarioTFD() {
			return rbac.podeCadastrarUsuarioTFD(me?.role);
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
			// Guard 2: a role pode acessar a Face 4 (TFD)?
			// Quem não puder é redirecionado pra Face padrão da role.
			if (!rbac.podeAcessarFace4TFD(sessao.role)) {
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

	// ─── Breadcrumbs ───
	const pageTitles: Record<string, { label: string; crumb: string }> = {
		'/tfd/dashboard': {
			label: 'DASHBOARD · VISÃO GERAL',
			crumb: 'TFD / DASHBOARD / VISÃO GERAL'
		},
		'/tfd/dashboard/solicitacoes': {
			label: 'DASHBOARD · SOLICITAÇÕES PENDENTES',
			crumb: 'TFD / DASHBOARD / SOLICITAÇÕES'
		},
		'/tfd/dashboard/viagens-ativas': {
			label: 'DASHBOARD · VIAGENS ATIVAS',
			crumb: 'TFD / DASHBOARD / VIAGENS ATIVAS'
		},
		'/tfd/solicitacoes': {
			label: 'SOLICITAÇÕES DE VIAGEM',
			crumb: 'TFD / SOLICITAÇÕES'
		},
		'/tfd/solicitacoes/nova': {
			label: 'NOVA SOLICITAÇÃO · CADASTRO DE PASSAGEIRO',
			crumb: 'TFD / SOLICITAÇÕES / NOVA'
		},
		'/tfd/viagens': {
			label: 'VIAGENS DA FROTA',
			crumb: 'TFD / VIAGENS'
		},
		'/tfd/viagens/nova': {
			label: 'NOVA VIAGEM',
			crumb: 'TFD / VIAGENS / NOVA'
		},
		'/tfd/frota': {
			label: 'FROTA DE VEÍCULOS',
			crumb: 'TFD / FROTA'
		},
		'/tfd/frota/novo': {
			label: 'NOVO VEÍCULO',
			crumb: 'TFD / FROTA / NOVO'
		},
		'/tfd/motoristas': {
			label: 'MOTORISTAS',
			crumb: 'TFD / MOTORISTAS'
		},
		'/tfd/motoristas/novo': {
			label: 'NOVO MOTORISTA',
			crumb: 'TFD / MOTORISTAS / NOVO'
		},
		'/tfd/usuarios': {
			label: 'EQUIPE TFD',
			crumb: 'TFD / USUÁRIOS'
		},
		'/tfd/usuarios/novo': {
			label: 'NOVO USUÁRIO TFD',
			crumb: 'TFD / USUÁRIOS / NOVO'
		},
		'/tfd/abastecimento': {
			label: 'ABASTECIMENTO DA FROTA',
			crumb: 'TFD / ABASTECIMENTO'
		},
		'/tfd/saldo': {
			label: 'SALDO ORÇAMENTÁRIO DA FROTA',
			crumb: 'TFD / SALDO'
		},
		'/tfd/saldo-ajuda-custo': {
			label: 'SALDO DE AJUDA DE CUSTO',
			crumb: 'TFD / SALDO / AJUDA DE CUSTO'
		},
		'/tfd/ajuda-custo': {
			label: 'AJUDAS DE CUSTO',
			crumb: 'TFD / AJUDA DE CUSTO'
		},
		'/tfd/relatorios': {
			label: 'RELATÓRIOS LOGÍSTICOS',
			crumb: 'TFD / RELATÓRIOS'
		},
		'/tfd/relatorios/especialidades': {
			label: 'RELATÓRIO POR ESPECIALIDADE',
			crumb: 'TFD / RELATÓRIOS / ESPECIALIDADES'
		},
		'/tfd/auditoria': {
			label: 'AUDITORIA · PRESTAÇÃO DE CONTAS TJ',
			crumb: 'TFD / AUDITORIA'
		},
		'/tfd/perfil': {
			label: 'PERFIL DO OPERADOR',
			crumb: 'TFD / PERFIL'
		}
	};

	let pageInfo = $derived.by(() => {
		const p = page.url.pathname;
		if (pageTitles[p]) return pageTitles[p];
		// Detalhes dinâmicos
		if (/^\/tfd\/solicitacoes\/[^/]+$/.test(p))
			return { label: 'DETALHE DA SOLICITAÇÃO', crumb: 'TFD / SOLICITAÇÕES / DETALHE' };
		if (/^\/tfd\/viagens\/[^/]+$/.test(p))
			return { label: 'DETALHE DA VIAGEM', crumb: 'TFD / VIAGENS / DETALHE' };
		if (/^\/tfd\/frota\/[^/]+$/.test(p))
			return { label: 'DETALHE DO VEÍCULO', crumb: 'TFD / FROTA / DETALHE' };
		if (/^\/tfd\/motoristas\/[^/]+$/.test(p))
			return { label: 'DETALHE DO MOTORISTA', crumb: 'TFD / MOTORISTAS / DETALHE' };
		return { label: 'GESTÃO TFD', crumb: 'TFD' };
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
	<title>{pageInfo.label} · TFD · UniSISM</title>
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
		<SidebarTFD />

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
				<div>UNISISM v0.1.0 · FACE 4 / TFD · BUILD 2026.04</div>
				<div class="flex items-center gap-3">
					<span>OPERADOR: {me.matricula}</span>
					{#if me.unidade}
						<span>UNIDADE: {me.unidade}</span>
					{/if}
					<span>ESCOPO: {me.escopo}</span>
				</div>
			</footer>
		</div>
	</div>
{/if}
