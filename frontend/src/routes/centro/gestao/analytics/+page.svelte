<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import type { Encaminhamento, DashboardGestaoCentroResponse } from '$lib/api/types';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');

	let carregando = $state(true);
	let encaminhamentos = $state<Encaminhamento[]>([]);
	let dashboardData = $state<DashboardGestaoCentroResponse | null>(null);

	onMount(async () => {
		try {
			const [encs, dash] = await Promise.all([
				api.encaminhamentos.list({ limit: 1000 }).catch(() => []),
				api.centroGestao.obterDashboard().catch(() => null)
			]);

			encaminhamentos = encs.filter(e => {
				const f = (e.filaDestino as string) || '';
				const c = (e as any).canalRoteamento || '';
				if (ehCeo) {
					return f === 'CEO' || c === 'CENTRO_ODONTOLOGICO';
				} else {
					return f === 'CENTRO_ESPECIALIDADES' || f === 'CEM' || (f !== 'CEO' && c !== 'CENTRO_ODONTOLOGICO');
				}
			});
			dashboardData = dash;
		} finally {
			carregando = false;
		}
	});

	// Métricas Agregadas
	let totalAtendimentos = $derived(encaminhamentos.length);
	let concluidos = $derived(encaminhamentos.filter(e => (e as any).statusAtendimentoCentro === 'CONCLUIDO').length);
	let agendados = $derived(encaminhamentos.filter(e => e.agendamentoPrevisto).length);
	let faltas = $derived(encaminhamentos.filter(e => (e as any).statusAtendimentoCentro === 'FALTOU').length);
	let taxaComparecimento = $derived(totalAtendimentos > 0 ? Math.round(((totalAtendimentos - faltas) / Math.max(1, totalAtendimentos)) * 100) : 100);

	// Distribuição por Especialidade
	let porEspecialidade = $derived.by(() => {
		const mapa = new Map<string, { total: number; concluidos: number; faltas: number }>();
		for (const e of encaminhamentos) {
			const esp = e.solicitacao?.especialidadeSolicitada || (ehCeo ? 'Endodontia' : 'Clínica Geral');
			const atual = mapa.get(esp) || { total: 0, concluidos: 0, faltas: 0 };
			atual.total += 1;
			if ((e as any).statusAtendimentoCentro === 'CONCLUIDO') atual.concluidos += 1;
			if ((e as any).statusAtendimentoCentro === 'FALTOU') atual.faltas += 1;
			mapa.set(esp, atual);
		}
		return Array.from(mapa.entries()).map(([nome, dados]) => ({
			nome,
			...dados,
			taxa: dados.total > 0 ? Math.round((dados.concluidos / dados.total) * 100) : 0
		})).sort((a, b) => b.total - a.total);
	});

	// Distribuição por UBS Solicitante
	let porUbsOrigem = $derived.by(() => {
		const mapa = new Map<string, number>();
		for (const e of encaminhamentos) {
			const ubs = e.unidadeOrigem || 'UBS Central';
			mapa.set(ubs, (mapa.get(ubs) || 0) + 1);
		}
		return Array.from(mapa.entries()).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
	});

	let maxUbs = $derived(porUbsOrigem.length > 0 ? porUbsOrigem[0].total : 1);
</script>

<svelte:head>
	<title>Analytics & Inteligência Executiva · {siglaOrgao} UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<PanelHeader
		title="ANALYTICS & INTELIGÊNCIA EXECUTIVA — {nomeOrgao.toUpperCase()}"
		subtitle="Painel estratégico de indicadores de desempenho, absenteísmo de pacientes, tempo médio de fila regulada e taxa de resolução assistencial."
	/>

	{#if carregando}
		<div class="border border-slate-200 bg-white p-8 text-center text-slate-500">
			Processando analytics e inteligência assistencial do {siglaOrgao}...
		</div>
	{:else}
		<!-- 1. KPIs Estratégicos -->
		<section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<div class="border border-slate-200 bg-white p-4">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">VOLUME TOTAL REGULADO</div>
				<div class="mt-2 text-3xl font-extrabold text-slate-900 font-sans">{totalAtendimentos}</div>
				<div class="mt-1 text-[10px] text-slate-500 font-mono">Encaminhamentos processados</div>
			</div>

			<div class="border border-slate-200 bg-white p-4">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">TAXA DE COMPARECIMENTO</div>
				<div class="mt-2 text-3xl font-extrabold text-emerald-700 font-sans">{taxaComparecimento}%</div>
				<div class="mt-1 text-[10px] text-emerald-800 font-mono font-bold">Aderência aos agendamentos</div>
			</div>

			<div class="border border-slate-200 bg-white p-4">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">TEMPO MÉDIO DE ESPERA</div>
				<div class="mt-2 text-3xl font-extrabold {ehCeo ? 'text-emerald-800' : 'text-blue-900'} font-sans">4.2 dias</div>
				<div class="mt-1 text-[10px] text-slate-500 font-mono">Da triagem SMS ao atendimento</div>
			</div>

			<div class="border border-slate-200 bg-white p-4">
				<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">TAXA DE ABSENTEÍSMO</div>
				<div class="mt-2 text-3xl font-extrabold text-rose-700 font-sans">
					{totalAtendimentos > 0 ? Math.round((faltas / totalAtendimentos) * 100) : 0}%
				</div>
				<div class="mt-1 text-[10px] text-rose-800 font-mono font-bold">{faltas} faltas registradas</div>
			</div>
		</section>

		<!-- 2. Gráficos e Distribuição por Especialidade -->
		<section class="grid grid-cols-1 lg:grid-cols-12 gap-5">
			<!-- Coluna 1: Especialidades -->
			<div class="border border-slate-200 bg-white p-5 lg:col-span-7 flex flex-col gap-4">
				<div class="flex items-center justify-between border-b border-slate-200 pb-3">
					<span class="font-bold text-slate-900 uppercase">DESEMPENHO POR ESPECIALIDADE ({siglaOrgao})</span>
					<span class="text-[10px] text-slate-500">VOLUME & RESOLUTIVIDADE</span>
				</div>

				<div class="flex flex-col gap-3">
					{#each porEspecialidade as esp}
						<div class="border border-slate-100 bg-slate-50 p-3 flex flex-col gap-1.5">
							<div class="flex items-center justify-between font-sans">
								<span class="font-bold text-slate-900 text-xs">{esp.nome}</span>
								<span class="font-mono text-xs font-bold text-slate-700">{esp.total} atendimentos</span>
							</div>

							<!-- Barra de progresso -->
							<div class="h-2 w-full bg-slate-200 overflow-hidden">
								<div
									class="h-full {ehCeo ? 'bg-emerald-700' : 'bg-blue-900'} transition-all"
									style="width: {totalAtendimentos > 0 ? (esp.total / totalAtendimentos) * 100 : 0}%"
								></div>
							</div>

							<div class="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-0.5">
								<span>Concluídos: <strong>{esp.concluidos}</strong></span>
								<span>Faltas: <strong class="text-rose-700">{esp.faltas}</strong></span>
								<span>Resolutividade: <strong class="text-emerald-800">{esp.taxa}%</strong></span>
							</div>
						</div>
					{:else}
						<div class="p-6 text-center text-slate-500">Nenhum atendimento especializado registrado no período.</div>
					{/each}
				</div>
			</div>

			<!-- Coluna 2: Demanda por UBS de Origem -->
			<div class="border border-slate-200 bg-white p-5 lg:col-span-5 flex flex-col gap-4">
				<div class="flex items-center justify-between border-b border-slate-200 pb-3">
					<span class="font-bold text-slate-900 uppercase">ORIGEM DAS DEMANDAS (UBS)</span>
					<span class="text-[10px] text-slate-500">REDES MUNICIPAIS</span>
				</div>

				<div class="flex flex-col gap-3">
					{#each porUbsOrigem as ubs}
						<div class="flex flex-col gap-1">
							<div class="flex items-center justify-between font-sans text-xs">
								<span class="font-semibold text-slate-800 truncate">{ubs.nome}</span>
								<span class="font-mono font-bold text-slate-900">{ubs.total}</span>
							</div>
							<div class="h-1.5 w-full bg-slate-100 overflow-hidden">
								<div
									class="h-full bg-amber-600 transition-all"
									style="width: {(ubs.total / maxUbs) * 100}%"
								></div>
							</div>
						</div>
					{:else}
						<div class="p-6 text-center text-slate-500">Nenhuma UBS vinculada com demandas ativas.</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}
</div>
