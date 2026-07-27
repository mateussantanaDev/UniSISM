<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { api } from '$lib/api';
	import type { Encaminhamento, Ubs } from '$lib/api/types';
	import { onMount } from 'svelte';

	/**
	 * Produção da Rede — KPIs agregados cross-UBS + ranking de unidades.
	 * Deriva indicadores no cliente a partir de `GET /encaminhamentos` + `GET /admin/ubs`.
	 * Idealmente, o backend exporá um endpoint `/dashboard/producao-rede` agregado.
	 */

	let encaminhamentos = $state<Encaminhamento[]>([]);
	let ubsList = $state<Ubs[]>([]);
	let carregando = $state(true);

	onMount(async () => {
		try {
			const [encs, ubs] = await Promise.all([
				api.encaminhamentos.list({ limit: 100 }),
				api.admin.listUbs()
			]);
			encaminhamentos = encs;
			ubsList = ubs;
		} finally {
			carregando = false;
		}
	});

	let total = $derived(encaminhamentos.length);
	let aprovados = $derived(encaminhamentos.filter((e) => e.status === 'APROVADO').length);
	let taxaAprovacao = $derived(total > 0 ? Math.round((aprovados / total) * 100) : 0);
	let emFila = $derived(
		encaminhamentos.filter((e) => e.status === 'AGUARDANDO_REGULACAO').length
	);

	/** Ranking de UBSs por volume de encaminhamentos. */
	let ranking = $derived.by(() => {
		const contagem = new Map<
			string,
			{ nome: string; total: number; aprovados: number; pendencias: number }
		>();
		for (const e of encaminhamentos) {
			const k = e.unidadeOrigem;
			const prev = contagem.get(k) ?? { nome: k, total: 0, aprovados: 0, pendencias: 0 };
			prev.total += 1;
			if (e.status === 'APROVADO') prev.aprovados += 1;
			if (e.status === 'PENDENCIA_DOCUMENTO') prev.pendencias += 1;
			contagem.set(k, prev);
		}
		return [...contagem.values()].sort((a, b) => b.total - a.total);
	});

	let maxVolume = $derived(ranking.length > 0 ? ranking[0].total : 1);

	/** Distribuição por dia da semana dos últimos 7 dias. */
	let porDia = $derived.by(() => {
		const dias = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
		const contagem = new Array(7).fill(0);
		const agora = Date.now();
		for (const e of encaminhamentos) {
			const t = new Date(e.criadoEm).getTime();
			if (agora - t < 7 * 86400000) {
				contagem[new Date(e.criadoEm).getDay()] += 1;
			}
		}
		return dias.map((dia, i) => ({ dia, volume: contagem[i] }));
	});

	let maxDia = $derived(Math.max(...porDia.map((d) => d.volume), 1));

	/** Distribuição de status — 5 colunas do panel de pipeline. */
	let statuses = $derived([
		{
			key: 'AGUARDANDO_REGULACAO',
			label: 'Aguardando',
			count: encaminhamentos.filter((e) => e.status === 'AGUARDANDO_REGULACAO').length,
			tone: 'text-blue-900'
		},
		{
			key: 'PENDENCIA_DOCUMENTO',
			label: 'Pendência',
			count: encaminhamentos.filter((e) => e.status === 'PENDENCIA_DOCUMENTO').length,
			tone: 'text-amber-700'
		},
		{
			key: 'APROVADO',
			label: 'Aprovado',
			count: encaminhamentos.filter((e) => e.status === 'APROVADO').length,
			tone: 'text-emerald-700'
		},
		{
			key: 'REJEITADO',
			label: 'Rejeitado',
			count: encaminhamentos.filter((e) => e.status === 'REJEITADO').length,
			tone: 'text-red-700'
		},
		{
			key: 'RASCUNHO',
			label: 'Rascunho',
			count: encaminhamentos.filter((e) => e.status === 'RASCUNHO').length,
			tone: 'text-slate-600'
		}
	]);
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Volume Total"
			value={carregando ? '—' : total}
			sublabel="Encaminhamentos na prefeitura"
		/>
		<MetricCard
			label="Taxa de Aprovação"
			value={carregando ? '—' : `${taxaAprovacao}%`}
			sublabel="Aprovados / total"
			accent="success"
		/>
		<MetricCard
			label="Em Fila"
			value={carregando ? '—' : emFila}
			sublabel="Aguardando regulação"
			accent="warning"
		/>
		<MetricCard
			label="UBSs Ativas"
			value={carregando ? '—' : ubsList.filter((u) => u.ativa).length}
			sublabel="{ubsList.length} total"
		/>
	</section>

	<div class="grid grid-cols-12 gap-4">
		<!-- Produção por dia -->
		<div class="col-span-12 border border-slate-200 bg-white xl:col-span-7">
			<PanelHeader
				title="Produção por Dia · Última Semana"
				subtitle="Volume diário de encaminhamentos em toda a rede"
				index="01"
			/>
			<div class="px-4 py-5">
				{#if carregando}
					<div class="h-52 animate-pulse bg-slate-50"></div>
				{:else}
					<div class="flex h-52 items-end gap-3">
						{#each porDia as d (d.dia)}
							{@const pct = (d.volume / maxDia) * 100}
							<div class="flex flex-1 flex-col items-center gap-1.5">
								<div class="font-mono text-[10px] font-bold text-slate-700">{d.volume}</div>
								<div class="w-full bg-blue-900 transition-all" style="height: {pct}%"></div>
								<div
									class="font-mono text-[10px] tracking-widest text-slate-500 uppercase"
								>
									{d.dia}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Ranking UBSs -->
		<div class="col-span-12 border border-slate-200 bg-white xl:col-span-5">
			<PanelHeader
				title="Ranking de UBSs"
				subtitle="Por volume de encaminhamentos"
				index="02"
			/>
			<ul class="divide-y divide-slate-100 px-4">
				{#if carregando}
					{#each Array(5) as _, i (i)}
						<li class="py-2.5">
							<div class="h-3 w-full animate-pulse bg-slate-100"></div>
						</li>
					{/each}
				{:else if ranking.length === 0}
					<li class="py-4 text-center font-mono text-xs text-slate-500">
						Sem dados de produção.
					</li>
				{:else}
					{#each ranking.slice(0, 8) as u, i (u.nome)}
						{@const pct = (u.total / maxVolume) * 100}
						<li class="py-2.5">
							<div class="flex items-center justify-between gap-3">
								<div class="flex min-w-0 items-center gap-2">
									<span
										class="flex h-5 w-5 shrink-0 items-center justify-center border border-slate-300 bg-slate-50 font-mono text-[10px] font-bold text-slate-700"
									>
										{i + 1}
									</span>
									<span class="truncate text-xs font-semibold text-slate-900">{u.nome}</span>
								</div>
								<div class="flex shrink-0 items-center gap-3 font-mono">
									{#if u.pendencias > 0}
										<span class="text-[10px] text-red-700">⚠ {u.pendencias}</span>
									{/if}
									<span class="text-[10px] text-emerald-700">✓ {u.aprovados}</span>
									<span class="text-sm font-bold text-slate-900">{u.total}</span>
								</div>
							</div>
							<div class="mt-1.5 h-1 w-full bg-slate-100">
								<div class="h-full bg-blue-900" style="width: {pct}%"></div>
							</div>
						</li>
					{/each}
				{/if}
			</ul>
		</div>
	</div>

	<!-- Status distribution -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Distribuição de Status" subtitle="Pipeline da rede" index="03" />
		<div class="grid grid-cols-2 gap-px bg-slate-200 md:grid-cols-5">
			{#each statuses as s (s.key)}
				<div class="flex flex-col items-center justify-center bg-white px-4 py-5">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						{s.label}
					</div>
					<div class="mt-1 font-mono text-3xl font-bold {s.tone}">{s.count}</div>
					<div class="font-mono text-[10px] text-slate-500">
						{total > 0 ? Math.round((s.count / total) * 100) : 0}% do total
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
