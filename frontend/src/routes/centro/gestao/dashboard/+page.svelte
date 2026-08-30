<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { DashboardGestaoCentroResponse } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';

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
			const res = await api.centroGestao.obterDashboard();
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
	<title>ERP Diretoria - Painel Geral Executivo | UniSISM Centro</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="TORRE DE CONTROLE EXECUTIVA — CENTRO DE ESPECIALIDADES"
		subtitle="Visão geral estratégica em tempo real da produtividade, capacidade instalada, cotas por UBS e fluxo assistencial."
	/>

	{#if erro}
		<div class="border border-amber-600 bg-amber-50 p-4 text-amber-900 font-semibold flex items-center justify-between">
			<span>⚠ {erro}</span>
			<button onclick={carregarDashboard} class="border border-amber-800 bg-amber-800 text-white px-3 py-1 text-xs uppercase font-bold">
				Tentar Novamente
			</button>
		</div>
	{/if}

	{#if carregando}
		<div class="border border-slate-200 bg-white p-8 text-center text-slate-500 font-mono">
			Carregando indicadores executivos do Centro de Especialidades...
		</div>
	{:else}
		<!-- 1. KPIs Executivos do Dia -->
		<section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
			<div class="border border-slate-200 bg-white p-4 flex flex-col justify-between">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">AGENDADOS HOJE</div>
				<div class="mt-2 text-3xl font-extrabold text-blue-900 font-sans">{totalAgendadosHoje}</div>
				<div class="mt-2 text-[10px] text-slate-500 font-mono">Capacidade diária ocupada</div>
			</div>

			<div class="border border-slate-200 bg-white p-4 flex flex-col justify-between">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">NA SALA DE ESPERA</div>
				<div class="mt-2 text-3xl font-extrabold text-amber-700 font-sans">{aguardandoHoje}</div>
				<div class="mt-2 text-[10px] text-amber-800 font-mono font-bold">Aguardando atendimento</div>
			</div>

			<div class="border border-slate-200 bg-white p-4 flex flex-col justify-between">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">EM CONSULTA AGORA</div>
				<div class="mt-2 text-3xl font-extrabold text-indigo-700 font-sans">{emAtendimentoHoje}</div>
				<div class="mt-2 text-[10px] text-indigo-900 font-mono font-bold">Em consultório médico</div>
			</div>

			<div class="border border-slate-200 bg-white p-4 flex flex-col justify-between">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">CONCLUÍDOS HOJE</div>
				<div class="mt-2 text-3xl font-extrabold text-emerald-700 font-sans">{concluidosHoje}</div>
				<div class="mt-2 text-[10px] text-emerald-800 font-mono">Atendimentos finalizados</div>
			</div>

			<div class="border border-slate-200 bg-white p-4 flex flex-col justify-between">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">ABSENTEÍSMO HOJE</div>
				<div class="mt-2 text-3xl font-extrabold text-rose-700 font-sans">{faltasHoje}</div>
				<div class="mt-2 text-[10px] text-rose-800 font-mono font-bold">Pacientes faltosos</div>
			</div>
		</section>

		<!-- 2. Performance Consolidada Mensal & Distribuição por Especialidade -->
		<section class="grid grid-cols-1 gap-4 lg:grid-cols-12">
			<!-- Resumo Mensal da Diretoria -->
			<div class="border border-slate-200 bg-white p-5 lg:col-span-6 flex flex-col justify-between">
				<div>
					<div class="flex items-center justify-between border-b border-slate-200 pb-3">
						<span class="font-bold text-slate-900 text-sm uppercase tracking-wider">CONSOLIDADO MENSAL DA UNIDADE</span>
						<span class="bg-blue-900 text-white px-2 py-0.5 text-[10px] font-bold">PERÍODO: {dashboardData?.mesAtual?.periodo ?? 'MÊS VIGENTE'}</span>
					</div>

					<div class="grid grid-cols-2 gap-4 mt-4 text-xs">
						<div class="bg-slate-50 p-3 border border-slate-200">
							<div class="text-slate-500 text-[10px] uppercase font-bold">Total de Consultas Agendadas</div>
							<div class="text-xl font-bold text-slate-900 font-sans mt-1">{totalMes}</div>
						</div>
						<div class="bg-slate-50 p-3 border border-slate-200">
							<div class="text-slate-500 text-[10px] uppercase font-bold">Atendimentos Efetivados</div>
							<div class="text-xl font-bold text-emerald-800 font-sans mt-1">{concluidosMes}</div>
						</div>
						<div class="bg-slate-50 p-3 border border-slate-200">
							<div class="text-slate-500 text-[10px] uppercase font-bold">Total de Absenteísmo (Faltas)</div>
							<div class="text-xl font-bold text-rose-800 font-sans mt-1">{faltasMes}</div>
						</div>
						<div class="bg-slate-50 p-3 border border-slate-200">
							<div class="text-slate-500 text-[10px] uppercase font-bold">Taxa de Absenteísmo Global</div>
							<div class="text-xl font-bold text-amber-800 font-sans mt-1">{absenteismoMes}%</div>
						</div>
					</div>
				</div>

				<div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
					<span>Escalas Médicas Ativas: <strong class="text-blue-900 font-bold">{dashboardData?.totalEscalasAtivas ?? 0} Grades</strong></span>
					<a href="/centro/gestao/producao" class="text-blue-900 font-bold hover:underline">Ver Relatórios BPA/SUS →</a>
				</div>
			</div>

			<!-- Distribuição de Consultas por Especialidade -->
			<div class="border border-slate-200 bg-white p-5 lg:col-span-6">
				<div class="flex items-center justify-between border-b border-slate-200 pb-3">
					<span class="font-bold text-slate-900 text-sm uppercase tracking-wider">DEMANDA POR ESPECIALIDADE</span>
					<span class="text-slate-500 text-[10px]">SERVIÇOS OFERTADOS</span>
				</div>

				<div class="mt-4 flex flex-col gap-3">
					{#if dashboardData?.distribuicaoPorEspecialidade && Object.keys(dashboardData.distribuicaoPorEspecialidade).length > 0}
						{#each Object.entries(dashboardData.distribuicaoPorEspecialidade) as [esp, qtd]}
							{@const pct = totalMes > 0 ? Math.round((qtd / totalMes) * 100) : 0}
							<div>
								<div class="flex justify-between text-xs font-semibold text-slate-800 mb-1">
									<span>{esp}</span>
									<span>{qtd} consultas ({pct}%)</span>
								</div>
								<div class="h-2.5 w-full bg-slate-100 border border-slate-200">
									<div class="h-full bg-blue-900" style="width: {Math.min(100, pct)}%"></div>
								</div>
							</div>
						{/each}
					{:else}
						<div class="p-6 text-center text-slate-500 border border-dashed border-slate-200">
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
					<h3 class="font-bold text-slate-900 text-sm uppercase tracking-wider">DISTRIBUIÇÃO E CONSUMO DE COTAS POR UBS</h3>
					<p class="text-[11px] text-slate-500">Monitoramento da cota alocada por Unidade Básica de Saúde no mês corrente.</p>
				</div>
				<a href="/centro/gestao/vagas" class="border border-blue-900 bg-blue-900 text-white px-3 py-1.5 text-xs font-bold uppercase hover:bg-blue-950">
					Gerenciar Matriz de Cotas →
				</a>
			</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
				{#if dashboardData?.distribuicaoPorUbs && Object.keys(dashboardData.distribuicaoPorUbs).length > 0}
					{#each Object.entries(dashboardData.distribuicaoPorUbs) as [ubsNome, qtd]}
						<div class="border border-slate-200 bg-slate-50 p-4 flex flex-col justify-between">
							<div class="text-[10px] font-bold text-slate-500 uppercase truncate">{ubsNome}</div>
							<div class="mt-2 text-2xl font-bold text-slate-900 font-sans">{qtd}</div>
							<div class="mt-2 text-[10px] text-slate-600 font-mono">Agendamentos direcionados no mês</div>
						</div>
					{/each}
				{:else}
					<div class="col-span-full p-6 text-center text-slate-500 border border-dashed border-slate-200">
						Nenhuma cota por UBS registrada no banco de dados do servidor.
					</div>
				{/if}
			</div>
		</section>

		<!-- 4. Ações Rápidas de Comando do Diretor -->
		<section class="border border-slate-200 bg-slate-900 text-white p-5 font-mono">
			<div class="text-xs font-bold tracking-widest text-slate-400 uppercase">COMANDOS RÁPIDOS DA DIRETORIA</div>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-3">
				<a href="/centro/gestao/usuarios" class="border border-slate-700 bg-slate-800 p-3 hover:bg-slate-700 flex flex-col gap-1">
					<span class="font-bold text-xs text-white">👥 Gestão de Equipes & Usuários</span>
					<span class="text-[10px] text-slate-400">Cadastrar, editar credenciais e perfis de médicos e atendentes.</span>
				</a>
				<a href="/centro/gestao/vagas" class="border border-slate-700 bg-slate-800 p-3 hover:bg-slate-700 flex flex-col gap-1">
					<span class="font-bold text-xs text-white">📅 Matriz de Vagas & Escalas</span>
					<span class="text-[10px] text-slate-400">Redefinir cotas de UBSs e escalas de médicos por turno.</span>
				</a>
				<a href="/centro/gestao/salas" class="border border-slate-700 bg-slate-800 p-3 hover:bg-slate-700 flex flex-col gap-1">
					<span class="font-bold text-xs text-white">🏥 Consultórios & Infraestrutura</span>
					<span class="text-[10px] text-slate-400">Gerenciar salas físicas do Centro de Especialidades.</span>
				</a>
				<a href="/centro/gestao/producao" class="border border-slate-700 bg-slate-800 p-3 hover:bg-slate-700 flex flex-col gap-1">
					<span class="font-bold text-xs text-white">📑 Relatórios Oficiais & Auditoria</span>
					<span class="text-[10px] text-slate-400">Exportar BPA/SUS e consultar logs imutáveis do CFM.</span>
				</a>
			</div>
		</section>
	{/if}
</div>
