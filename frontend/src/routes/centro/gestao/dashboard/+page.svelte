<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import type { DashboardGestaoCentroResponse } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import {
		IconAlertTriangle,
		IconUsers,
		IconCalendar,
		IconBuildingHospital,
		IconFileText
	} from '@tabler/icons-svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(
		ehCeo
			? 'Centro de Especialidades Odontológicas (CEO)'
			: 'Centro de Especialidades Médicas (CEM)'
	);
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');

	// State
	let carregando = $state(true);
	let erro = $state('');
	let dashboardData = $state<DashboardGestaoCentroResponse | null>(null);

	// Calculated or derived fallback metrics for real API
	let totalAgendadosHoje = $derived(dashboardData?.hoje?.totalAgendados ?? 0);
	let aguardandoHoje = $derived(dashboardData?.hoje?.aguardandoAtendimento ?? 0);
	let emAtendimentoHoje = $derived(dashboardData?.hoje?.emAtendimento ?? 0);
	let concluidosHoje = $derived(dashboardData?.hoje?.concluidos ?? 0);
	let faltasHoje = $derived(dashboardData?.hoje?.faltas ?? 0);

	let totalMes = $derived(dashboardData?.mesAtual?.totalAgendados ?? 0);
	let concluidosMes = $derived(dashboardData?.mesAtual?.totalConcluidos ?? 0);
	let faltasMes = $derived(dashboardData?.mesAtual?.totalFaltas ?? 0);
	let absenteismoMes = $derived(dashboardData?.mesAtual?.taxaAbsenteismoPorcento ?? 0);

	async function carregarDashboard() {
		carregando = true;
		erro = '';
		try {
			const res = await api.centroGestao.obterDashboard({ centro: centroAtivo });
			dashboardData = res;
		} catch (e: any) {
			console.error(e);
			erro = `Falha ao carregar dashboard da diretoria: ${e?.message || 'Erro de conexão'}`;
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarDashboard();
	});

	function formatarMoeda(val: number) {
		return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}
</script>

<svelte:head>
	<title>ERP Diretoria - Painel Geral Executivo · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="TORRE DE CONTROLE EXECUTIVA — {nomeOrgao.toUpperCase()}"
		subtitle="Visão geral estratégica em tempo real da produtividade, capacidade instalada, cotas por UBS e fluxo assistencial."
	/>

	{#if erro}
		<div
			class="flex items-center justify-between border border-amber-600 bg-amber-50 p-4 font-semibold text-amber-900"
		>
			<span class="flex items-center gap-1.5">
				<IconAlertTriangle size={15} class="shrink-0 text-amber-700" />
				<span>{erro}</span>
			</span>
			<button
				onclick={carregarDashboard}
				class="border border-amber-800 bg-amber-800 px-3 py-1 text-xs font-bold text-white uppercase"
			>
				Tentar Novamente
			</button>
		</div>
	{/if}

	{#if carregando}
		<div class="border border-slate-200 bg-white p-8 text-center font-mono text-slate-500">
			Carregando indicadores executivos do Centro de Especialidades...
		</div>
	{:else}
		<!-- 1. KPIs Executivos do Dia -->
		<section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
			<div class="flex flex-col justify-between border border-slate-200 bg-white p-4">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
					AGENDADOS HOJE
				</div>
				<div class="mt-2 font-sans text-3xl font-extrabold text-blue-900">{totalAgendadosHoje}</div>
				<div class="mt-2 font-mono text-[10px] text-slate-500">Capacidade diária ocupada</div>
			</div>

			<div class="flex flex-col justify-between border border-slate-200 bg-white p-4">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
					NA SALA DE ESPERA
				</div>
				<div class="mt-2 font-sans text-3xl font-extrabold text-amber-700">{aguardandoHoje}</div>
				<div class="mt-2 font-mono text-[10px] font-bold text-amber-800">
					Aguardando atendimento
				</div>
			</div>

			<div class="flex flex-col justify-between border border-slate-200 bg-white p-4">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
					EM CONSULTA AGORA
				</div>
				<div class="mt-2 font-sans text-3xl font-extrabold text-indigo-700">
					{emAtendimentoHoje}
				</div>
				<div class="mt-2 font-mono text-[10px] font-bold text-indigo-900">
					Em consultório médico
				</div>
			</div>

			<div class="flex flex-col justify-between border border-slate-200 bg-white p-4">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
					CONCLUÍDOS HOJE
				</div>
				<div class="mt-2 font-sans text-3xl font-extrabold text-emerald-700">{concluidosHoje}</div>
				<div class="mt-2 font-mono text-[10px] text-emerald-800">Atendimentos finalizados</div>
			</div>

			<div class="flex flex-col justify-between border border-slate-200 bg-white p-4">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
					ABSENTEÍSMO HOJE
				</div>
				<div class="mt-2 font-sans text-3xl font-extrabold text-rose-700">{faltasHoje}</div>
				<div class="mt-2 font-mono text-[10px] font-bold text-rose-800">Pacientes faltosos</div>
			</div>
		</section>

		<!-- 2. Performance Consolidada Mensal & Distribuição por Especialidade -->
		<section class="grid grid-cols-1 gap-4 lg:grid-cols-12">
			<!-- Resumo Mensal da Diretoria -->
			<div class="flex flex-col justify-between border border-slate-200 bg-white p-5 lg:col-span-6">
				<div>
					<div class="flex items-center justify-between border-b border-slate-200 pb-3">
						<span class="text-sm font-bold tracking-wider text-slate-900 uppercase"
							>CONSOLIDADO MENSAL DA UNIDADE</span
						>
						<span class="bg-blue-900 px-2 py-0.5 text-[10px] font-bold text-white"
							>PERÍODO: {dashboardData?.mesAtual?.periodo ?? 'MÊS VIGENTE'}</span
						>
					</div>

					<div class="mt-4 grid grid-cols-2 gap-4 text-xs">
						<div class="border border-slate-200 bg-slate-50 p-3">
							<div class="text-[10px] font-bold text-slate-500 uppercase">
								Total de Consultas Agendadas
							</div>
							<div class="mt-1 font-sans text-xl font-bold text-slate-900">{totalMes}</div>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-3">
							<div class="text-[10px] font-bold text-slate-500 uppercase">
								Atendimentos Efetivados
							</div>
							<div class="mt-1 font-sans text-xl font-bold text-emerald-800">{concluidosMes}</div>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-3">
							<div class="text-[10px] font-bold text-slate-500 uppercase">
								Total de Absenteísmo (Faltas)
							</div>
							<div class="mt-1 font-sans text-xl font-bold text-rose-800">{faltasMes}</div>
						</div>
						<div class="border border-slate-200 bg-slate-50 p-3">
							<div class="text-[10px] font-bold text-slate-500 uppercase">
								Taxa de Absenteísmo Global
							</div>
							<div class="mt-1 font-sans text-xl font-bold text-amber-800">{absenteismoMes}%</div>
						</div>
					</div>
				</div>

				<div
					class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-600"
				>
					<span
						>Escalas Médicas Ativas: <strong class="font-bold text-blue-900"
							>{dashboardData?.totalEscalasAtivas ?? 0} Grades</strong
						></span
					>
					<a href="/centro/gestao/producao" class="font-bold text-blue-900 hover:underline"
						>Ver Relatórios BPA/SUS →</a
					>
				</div>
			</div>

			<!-- Distribuição de Consultas por Especialidade -->
			<div class="border border-slate-200 bg-white p-5 lg:col-span-6">
				<div class="flex items-center justify-between border-b border-slate-200 pb-3">
					<span class="text-sm font-bold tracking-wider text-slate-900 uppercase"
						>DEMANDA POR ESPECIALIDADE</span
					>
					<span class="text-[10px] text-slate-500">SERVIÇOS OFERTADOS</span>
				</div>

				<div class="mt-4 flex flex-col gap-3">
					{#if dashboardData?.distribuicaoPorEspecialidade && Object.keys(dashboardData.distribuicaoPorEspecialidade).length > 0}
						{#each Object.entries(dashboardData.distribuicaoPorEspecialidade) as [esp, qtd]}
							{@const pct = totalMes > 0 ? Math.round((qtd / totalMes) * 100) : 0}
							<div>
								<div class="mb-1 flex justify-between text-xs font-semibold text-slate-800">
									<span>{esp}</span>
									<span>{qtd} consultas ({pct}%)</span>
								</div>
								<div class="h-2.5 w-full border border-slate-200 bg-slate-100">
									<div class="h-full bg-blue-900" style="width: {Math.min(100, pct)}%"></div>
								</div>
							</div>
						{/each}
					{:else}
						<div class="border border-dashed border-slate-200 p-6 text-center text-slate-500">
							Nenhuma distribuição por especialidade registrada no servidor.
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- 3. Distribuição de Cotas por UBS de Origem -->
		<section class="border border-slate-200 bg-white p-5">
			<div class="flex items-center justify-between border-b border-slate-200 pb-3">
				<div>
					<h3 class="text-sm font-bold tracking-wider text-slate-900 uppercase">
						DISTRIBUIÇÃO E CONSUMO DE COTAS POR UBS
					</h3>
					<p class="text-[11px] text-slate-500">
						Monitoramento da cota alocada por Unidade Básica de Saúde no mês corrente.
					</p>
				</div>
				<a
					href="/centro/gestao/vagas"
					class="border border-blue-900 bg-blue-900 px-3 py-1.5 text-xs font-bold text-white uppercase hover:bg-blue-950"
				>
					Gerenciar Matriz de Cotas →
				</a>
			</div>

			<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#if dashboardData?.distribuicaoPorUbs && Object.keys(dashboardData.distribuicaoPorUbs).length > 0}
					{#each Object.entries(dashboardData.distribuicaoPorUbs) as [ubsNome, qtd]}
						<div class="flex flex-col justify-between border border-slate-200 bg-slate-50 p-4">
							<div class="truncate text-[10px] font-bold text-slate-500 uppercase">{ubsNome}</div>
							<div class="mt-2 font-sans text-2xl font-bold text-slate-900">{qtd}</div>
							<div class="mt-2 font-mono text-[10px] text-slate-600">
								Agendamentos direcionados no mês
							</div>
						</div>
					{/each}
				{:else}
					<div
						class="col-span-full border border-dashed border-slate-200 p-6 text-center text-slate-500"
					>
						Nenhuma cota por UBS registrada no banco de dados do servidor.
					</div>
				{/if}
			</div>
		</section>

		<!-- 4. Ações Rápidas de Comando do Diretor -->
		<section class="border border-slate-200 bg-slate-900 p-5 font-mono text-white">
			<div class="text-xs font-bold tracking-widest text-slate-400 uppercase">
				COMANDOS RÁPIDOS DA DIRETORIA
			</div>
			<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<a
					href="/centro/gestao/usuarios"
					class="flex flex-col gap-1 border border-slate-700 bg-slate-800 p-3 hover:bg-slate-700"
				>
					<span class="flex items-center gap-1.5 text-xs font-bold text-white">
						<IconUsers size={14} />
						<span>Gestão de Equipes & Usuários</span>
					</span>
					<span class="text-[10px] text-slate-400"
						>Cadastrar, editar credenciais e perfis de médicos e atendentes.</span
					>
				</a>
				<a
					href="/centro/gestao/vagas"
					class="flex flex-col gap-1 border border-slate-700 bg-slate-800 p-3 hover:bg-slate-700"
				>
					<span class="flex items-center gap-1.5 text-xs font-bold text-white">
						<IconCalendar size={14} />
						<span>Matriz de Vagas & Escalas</span>
					</span>
					<span class="text-[10px] text-slate-400"
						>Redefinir cotas de UBSs e escalas de médicos por turno.</span
					>
				</a>
				<a
					href="/centro/gestao/salas"
					class="flex flex-col gap-1 border border-slate-700 bg-slate-800 p-3 hover:bg-slate-700"
				>
					<span class="flex items-center gap-1.5 text-xs font-bold text-white">
						<IconBuildingHospital size={14} />
						<span>Consultórios & Infraestrutura</span>
					</span>
					<span class="text-[10px] text-slate-400"
						>Gerenciar salas físicas do Centro de Especialidades.</span
					>
				</a>
				<a
					href="/centro/gestao/producao"
					class="flex flex-col gap-1 border border-slate-700 bg-slate-800 p-3 hover:bg-slate-700"
				>
					<span class="flex items-center gap-1.5 text-xs font-bold text-white">
						<IconFileText size={14} />
						<span>Relatórios Oficiais & Auditoria</span>
					</span>
					<span class="text-[10px] text-slate-400"
						>Exportar BPA/SUS e consultar logs imutáveis do CFM.</span
					>
				</a>
			</div>
		</section>
	{/if}
</div>
