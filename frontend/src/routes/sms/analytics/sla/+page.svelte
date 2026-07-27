<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { api } from '$lib/api';
	import type { Encaminhamento, PrioridadeClinica } from '$lib/api/types';
	import { onMount } from 'svelte';

	/**
	 * SLA da Regulação — tempo entre criação e decisão final.
	 * Calculado no cliente (atualizadoEm − criadoEm para encaminhamentos finalizados).
	 */

	let encs = $state<Encaminhamento[]>([]);
	let carregando = $state(true);

	onMount(async () => {
		try {
			encs = await api.encaminhamentos.list({ limit: 100 });
		} finally {
			carregando = false;
		}
	});

	function horasEntre(a: string, b: string): number {
		return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 36e5);
	}

	/** SLA por prioridade (horas, metas recomendadas). */
	const slaMetas: Record<PrioridadeClinica, number> = {
		EMERGENCIA: 2,
		URGENTE: 12,
		PRIORITARIA: 72,
		ELETIVA: 240
	};

	let decididos = $derived(
		encs.filter((e) => e.status === 'APROVADO' || e.status === 'REJEITADO')
	);

	let tempos = $derived(
		decididos.map((e) => ({
			horas: horasEntre(e.criadoEm, e.atualizadoEm),
			prioridade: e.solicitacao.prioridade,
			status: e.status
		}))
	);

	let tempoMedio = $derived.by(() => {
		if (tempos.length === 0) return 0;
		return tempos.reduce((a, t) => a + t.horas, 0) / tempos.length;
	});

	let tempoP95 = $derived.by(() => {
		if (tempos.length === 0) return 0;
		const sorted = [...tempos].map((t) => t.horas).sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
	});

	let dentroSLA = $derived(
		tempos.filter((t) => t.horas <= slaMetas[t.prioridade]).length
	);

	let percDentroSLA = $derived(
		tempos.length > 0 ? Math.round((dentroSLA / tempos.length) * 100) : 0
	);

	interface AgregadoPrio {
		prioridade: PrioridadeClinica;
		total: number;
		dentro: number;
		media: number;
	}

	let porPrioridade = $derived.by<AgregadoPrio[]>(() => {
		const m = new Map<PrioridadeClinica, { soma: number; total: number; dentro: number }>();
		for (const t of tempos) {
			const prev = m.get(t.prioridade) ?? { soma: 0, total: 0, dentro: 0 };
			prev.soma += t.horas;
			prev.total += 1;
			if (t.horas <= slaMetas[t.prioridade]) prev.dentro += 1;
			m.set(t.prioridade, prev);
		}
		const ordem: PrioridadeClinica[] = ['EMERGENCIA', 'URGENTE', 'PRIORITARIA', 'ELETIVA'];
		return ordem
			.filter((p) => m.has(p))
			.map((p) => {
				const v = m.get(p)!;
				return { prioridade: p, total: v.total, dentro: v.dentro, media: v.soma / v.total };
			});
	});

	function formatarHoras(h: number): string {
		if (h < 1) return `${Math.round(h * 60)}min`;
		if (h < 24) return `${h.toFixed(1)}h`;
		return `${(h / 24).toFixed(1)}d`;
	}

	const prioTone: Record<PrioridadeClinica, string> = {
		EMERGENCIA: 'border-red-900 bg-red-900 text-white',
		URGENTE: 'border-red-700 bg-red-50 text-red-800',
		PRIORITARIA: 'border-amber-600 bg-amber-50 text-amber-800',
		ELETIVA: 'border-slate-400 bg-slate-50 text-slate-700'
	};
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Decisões Analisadas"
			value={carregando ? '—' : decididos.length}
			sublabel="Aprovados + rejeitados"
		/>
		<MetricCard
			label="Tempo Médio de Decisão"
			value={carregando ? '—' : formatarHoras(tempoMedio)}
			sublabel="Criação → decisão"
		/>
		<MetricCard
			label="P95 Decisão"
			value={carregando ? '—' : formatarHoras(tempoP95)}
			sublabel="95% dos casos dentro"
		/>
		<MetricCard
			label="Dentro do SLA"
			value={carregando ? '—' : `${percDentroSLA}%`}
			sublabel="Por prioridade"
			accent={percDentroSLA >= 90 ? 'success' : percDentroSLA >= 70 ? 'warning' : 'critical'}
		/>
	</section>

	<!-- SLA por prioridade -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="SLA por Prioridade Clínica"
			subtitle="Metas institucionais (horas até decisão): Emergência 2h · Urgente 12h · Prioritária 72h · Eletiva 240h"
			index="01"
		/>
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Prioridade</th>
						<th class="border-r border-slate-200 px-3 py-2">Meta (h)</th>
						<th class="border-r border-slate-200 px-3 py-2">Decisões</th>
						<th class="border-r border-slate-200 px-3 py-2">Dentro do SLA</th>
						<th class="border-r border-slate-200 px-3 py-2">Tempo Médio</th>
						<th class="px-3 py-2">Compliance</th>
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
					{:else if porPrioridade.length === 0}
						<tr>
							<td colspan="6" class="px-3 py-8 text-center font-sans text-sm text-slate-500">
								Nenhuma decisão registrada ainda.
							</td>
						</tr>
					{:else}
						{#each porPrioridade as row (row.prioridade)}
							{@const pct = Math.round((row.dentro / row.total) * 100)}
							<tr class="border-b border-slate-100">
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase {prioTone[
											row.prioridade
										]}"
									>
										{row.prioridade}
									</span>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{slaMetas[row.prioridade]}h
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-900">
									{row.total}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span class="font-bold {pct >= 90 ? 'text-emerald-700' : pct >= 70 ? 'text-amber-700' : 'text-red-700'}">
										{row.dentro}
									</span>
									<span class="text-slate-500"> / {row.total}</span>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarHoras(row.media)}
								</td>
								<td class="px-3 py-2">
									<div class="flex items-center gap-2">
										<div class="h-2 w-24 bg-slate-100">
											<div
												class="h-full {pct >= 90 ? 'bg-emerald-700' : pct >= 70 ? 'bg-amber-600' : 'bg-red-700'}"
												style="width: {pct}%"
											></div>
										</div>
										<span
											class="font-mono text-[11px] font-bold {pct >= 90 ? 'text-emerald-700' : pct >= 70 ? 'text-amber-700' : 'text-red-700'}"
										>
											{pct}%
										</span>
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Aviso sobre cálculo -->
	<div
		class="border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[11px] text-slate-600"
	>
		<span class="font-bold tracking-widest text-slate-700 uppercase">Nota técnica:</span> SLA
		calculado como <code class="bg-white px-1">atualizadoEm − criadoEm</code> para encaminhamentos
		em estado terminal (APROVADO/REJEITADO). Quando o backend expuser um endpoint de métricas
		agregadas, substituir pela fonte oficial.
	</div>
</div>
