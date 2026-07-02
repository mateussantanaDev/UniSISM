<script lang="ts">
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api } from '$lib/api';
	import type { Encaminhamento, MetricasDashboard } from '$lib/api/types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let aguardando = $state<Encaminhamento[]>([]);
	let pendencias = $state<Encaminhamento[]>([]);
	let metricas = $state<MetricasDashboard | null>(null);
	let carregando = $state(true);

	onMount(async () => {
		try {
			const [aguardandoList, pendenciasList, metricsData] = await Promise.all([
				api.encaminhamentos.list({ status: 'AGUARDANDO_REGULACAO' }),
				api.encaminhamentos.list({ status: 'PENDENCIA_DOCUMENTO' }),
				api.dashboard.metrics()
			]);
			aguardando = aguardandoList;
			pendencias = pendenciasList;
			metricas = metricsData;
		} finally {
			carregando = false;
		}
	});

	function formatarTempo(iso: string): string {
		const agora = new Date().getTime();
		const criado = new Date(iso).getTime();
		const horas = Math.floor((agora - criado) / (1000 * 60 * 60));
		if (horas < 1) return 'há instantes';
		if (horas < 24) return `há ${horas}h`;
		return `há ${Math.floor(horas / 24)}d`;
	}

	function formatarTempoMedio(segundos: number): string {
		const horas = Math.floor(segundos / 3600);
		const minutos = Math.floor((segundos % 3600) / 60);
		if (horas > 0) {
			return `${horas}h ${minutos}m`;
		}
		return `${minutos}m`;
	}
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Aguardando Regulação"
			value={aguardando.length}
			sublabel="Fila na Secretaria"
			accent="warning"
		/>
		<MetricCard
			label="Pendências de Documento"
			value={pendencias.length}
			sublabel="Requerem ação"
			accent="critical"
		/>
		<MetricCard
			label="Tempo Médio Fila"
			value={metricas ? formatarTempoMedio(metricas.tempoMedioConsolidacaoSegundos) : '—'}
			sublabel="Desde o envio"
		/>
		<MetricCard
			label="SLA Regulação"
			value={metricas ? `${metricas.slaRegulacaoPorcento}%` : '—'}
			sublabel="Dentro do prazo"
			accent="success"
		/>
	</section>

	<!-- Pendências de documento (prioridade máxima) -->
	<div class="border-2 border-red-700 bg-white">
		<PanelHeader
			title="Pendências de Documento · AÇÃO NECESSÁRIA"
			subtitle="Regulação solicitou correção ou envio adicional"
			index="01"
		>
			<span
				class="border border-red-700 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-red-800"
			>
				{pendencias.length} PENDENTE{pendencias.length === 1 ? '' : 'S'}
			</span>
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
						<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
						<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
						<th class="border-r border-slate-200 px-3 py-2">Tempo Pendente</th>
						<th class="border-r border-slate-200 px-3 py-2">Prioridade</th>
						<th class="px-3 py-2">Ação</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(3) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="6" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if pendencias.length === 0}
						<tr>
							<td colspan="6" class="px-3 py-8 text-center font-sans text-sm text-slate-500">
								Nenhuma pendência no momento.
							</td>
						</tr>
					{:else}
						{#each pendencias as e (e.id)}
							<tr class="border-b border-slate-100 hover:bg-red-50/40">
								<td
									class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900 underline decoration-blue-900/30 underline-offset-2"
								>
									{e.protocolo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900">
									{e.paciente.nome}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
									{e.solicitacao.especialidadeSolicitada}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-red-700">
									{formatarTempo(e.criadoEm)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<StatusBadge prioridade={e.solicitacao.prioridade} />
								</td>
								<td class="px-3 py-2">
									<PrimaryButton
										label="Resolver"
										variant="danger"
										onclick={() => goto(`/ubs/encaminhamento/${e.id}`)}
									/>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Aguardando regulação -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Aguardando Regulação"
			subtitle="Encaminhamentos em fila na Secretaria"
			index="02"
		>
			<span
				class="border border-amber-600 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-amber-800"
			>
				{aguardando.length} EM FILA
			</span>
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
						<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
						<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
						<th class="border-r border-slate-200 px-3 py-2">Enviado</th>
						<th class="border-r border-slate-200 px-3 py-2">Prioridade</th>
						<th class="px-3 py-2">Ação</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(4) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="6" class="px-3 py-3">
									<div class="h-3 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if aguardando.length === 0}
						<tr>
							<td colspan="6" class="px-3 py-8 text-center font-sans text-sm text-slate-500">
								Fila vazia.
							</td>
						</tr>
					{:else}
						{#each aguardando as e (e.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50">
								<td
									class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900 underline decoration-blue-900/30 underline-offset-2"
								>
									{e.protocolo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900">
									{e.paciente.nome}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
									{e.solicitacao.especialidadeSolicitada}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{formatarTempo(e.criadoEm)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<StatusBadge prioridade={e.solicitacao.prioridade} />
								</td>
								<td class="px-3 py-2">
									<PrimaryButton
										label="Abrir"
										variant="secondary"
										onclick={() => goto(`/ubs/encaminhamento/${e.id}`)}
									/>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
