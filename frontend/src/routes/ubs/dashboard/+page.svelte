<script lang="ts">
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api } from '$lib/api';
	import type { Encaminhamento, MetricasDashboard } from '$lib/api/types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();

	let metricas = $state<MetricasDashboard | null>(null);
	let recentes = $state<Encaminhamento[]>([]);
	let carregando = $state(true);

	onMount(async () => {
		try {
			const [m, r] = await Promise.all([
				api.dashboard.metrics(),
				api.encaminhamentos.list({ limit: 6 })
			]);
			metricas = m;
			recentes = r;
		} finally {
			carregando = false;
		}
	});

	function formatarHora(iso: string): string {
		return new Date(iso).toLocaleTimeString('pt-BR', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatarTempoMedio(segundos: number): string {
		const min = Math.floor(segundos / 60);
		const s = segundos % 60;
		return `${min}m ${s.toString().padStart(2, '0')}s`;
	}
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
		<MetricCard
			label="Encaminhamentos Hoje"
			value={metricas?.encaminhamentosHoje ?? '—'}
			sublabel="Ingestões consolidadas em 24h"
			trend="+12%"
			trendDirection="up"
		/>
		<MetricCard
			label="Aguardando Regulação"
			value={metricas?.aguardandoRegulacao ?? '—'}
			sublabel="Fila na Secretaria"
			accent="warning"
		/>
		<MetricCard
			label="Pendências de Documento"
			value={metricas?.pendenciasDocumento ?? '—'}
			sublabel="Requerem ação do atendente"
			accent="critical"
			trend="−3"
			trendDirection="down"
		/>
		<MetricCard
			label="Aprovados Hoje"
			value={metricas?.aprovadosHoje ?? '—'}
			sublabel="Retornados pela regulação"
			accent="success"
		/>
		<MetricCard
			label="Tempo Médio / Encaminhamento"
			value={metricas ? formatarTempoMedio(metricas.tempoMedioConsolidacaoSegundos) : '—'}
			sublabel="PDF → Consolidação"
		/>
		<MetricCard
			label="Volume Semanal"
			value={metricas?.encaminhamentosSemana ?? '—'}
			sublabel="Últimos 7 dias"
			trend="+8%"
			trendDirection="up"
		/>
	</section>

	<section class="grid grid-cols-12 gap-4">
		<div class="col-span-12 border border-slate-200 bg-white xl:col-span-9">
			<PanelHeader title="Últimos Encaminhamentos" subtitle="6 ingestões mais recentes" index="01">
				<PrimaryButton
					label="Ver Histórico Completo"
					variant="secondary"
					onclick={() => goto('/ubs/historico')}
				/>
			</PanelHeader>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							<th class="border-r border-slate-200 px-3 py-2">Hora</th>
							<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
							<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
							<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-2">CID-10</th>
							<th class="border-r border-slate-200 px-3 py-2">Prioridade</th>
							<th class="px-3 py-2">Status</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#if carregando}
							{#each Array(6) as _, i (i)}
								<tr class="border-b border-slate-100">
									<td colspan="7" class="px-3 py-3">
										<div class="h-3 w-full animate-pulse bg-slate-100"></div>
									</td>
								</tr>
							{/each}
						{:else}
							{#each recentes as e (e.id)}
								<tr
									class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
									onclick={() => goto(`/ubs/encaminhamento/${e.id}`)}
								>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
										{formatarHora(e.criadoEm)}
									</td>
									<td
										class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900 underline decoration-blue-900/30 underline-offset-2"
									>
										{e.protocolo}
									</td>
									<td
										class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900"
									>
										{e.paciente.nome}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
										{e.solicitacao.especialidadeSolicitada}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{e.solicitacao.cid10}
									</td>
									<td class="border-r border-slate-100 px-3 py-2">
										<StatusBadge prioridade={e.solicitacao.prioridade} />
									</td>
									<td class="px-3 py-2">
										<StatusBadge status={e.status} />
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<aside class="col-span-12 flex flex-col gap-4 xl:col-span-3">
			<div class="border border-slate-200 bg-white">
				<PanelHeader title="Ações Rápidas" index="02" />
				<div class="flex flex-col gap-2 p-4">
					{#if auth.podeConsolidarEncaminhamento}
						<PrimaryButton
							label="Novo Encaminhamento"
							shortcut="N"
							fullWidth
							onclick={() => goto('/ubs/novo-encaminhamento')}
						/>
					{/if}
					<PrimaryButton
						label="Ver Fila de Regulação"
						variant="secondary"
						fullWidth
						onclick={() => goto('/ubs/dashboard/fila')}
					/>
					<PrimaryButton
						label="Minha Produção"
						variant="secondary"
						fullWidth
						onclick={() => goto('/ubs/dashboard/producao')}
					/>
				</div>
			</div>

			<div class="border border-slate-200 bg-white">
				<PanelHeader title="Atalhos" index="03" />
				<ul class="divide-y divide-slate-100 text-[11px]">
					<li class="flex items-center justify-between px-4 py-2">
						<span class="text-slate-700">Novo Encaminhamento</span>
						<kbd
							class="border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
						>
							N
						</kbd>
					</li>
					<li class="flex items-center justify-between px-4 py-2">
						<span class="text-slate-700">Dashboard</span>
						<kbd
							class="border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
						>
							D
						</kbd>
					</li>
					<li class="flex items-center justify-between px-4 py-2">
						<span class="text-slate-700">Histórico</span>
						<kbd
							class="border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
						>
							H
						</kbd>
					</li>
				</ul>
			</div>
		</aside>
	</section>
</div>
