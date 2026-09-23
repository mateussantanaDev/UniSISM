<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { usePerfil } from '$lib/presentation/contexts/perfilContext';
	import type { AtendentePerfil } from '$lib/api/types';

	const ctx = usePerfil();
	let p = $derived(ctx.perfil as AtendentePerfil);

	let maxDia = $derived(Math.max(...p.producao.porDia.map((d: { volume: number }) => d.volume), 1));
	let maxEsp = $derived(
		Math.max(...p.producao.porEspecialidade.map((e: { volume: number }) => e.volume), 1)
	);
	let progressoMeta = $derived(
		Math.min(100, Math.round((p.producao.mes / p.producao.metaMes) * 100))
	);
</script>

<section class="flex flex-col gap-4">
	<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Hoje"
			value={p.producao.hoje}
			sublabel="Decisões"
			trend="+0%"
			trendDirection="neutral"
		/>
		<MetricCard label="Esta Semana" value={p.producao.semana} sublabel="Últimos 7 dias" />
		<MetricCard
			label="Este Mês"
			value={p.producao.mes}
			sublabel="{progressoMeta}% da meta"
			accent="success"
		/>
		<MetricCard label="Este Ano" value={p.producao.ano} sublabel="Acumulado" accent="default" />
	</div>

	<div class="grid grid-cols-12 gap-4">
		<div class="col-span-12 border border-slate-200 bg-white xl:col-span-7">
			<PanelHeader title="Produção por Dia · Semana Atual" index="01" />
			<div class="px-4 py-5">
				<div class="flex h-52 items-end gap-3">
					{#each p.producao.porDia as d (d.dia)}
						{@const pct = (d.volume / maxDia) * 100}
						<div class="flex flex-1 flex-col items-center gap-1.5">
							<div class="font-mono text-[10px] font-bold text-slate-700">{d.volume}</div>
							<div class="w-full bg-blue-900 transition-all" style="height: {pct}%"></div>
							<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
								{d.dia}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="col-span-12 flex flex-col gap-4 xl:col-span-5">
			<div class="border border-slate-200 bg-white">
				<PanelHeader title="Meta do Mês" index="02" />
				<div class="px-4 py-4">
					<div class="flex items-baseline justify-between">
						<span class="font-mono text-2xl font-bold text-slate-900">{p.producao.mes}</span>
						<span class="font-mono text-[11px] tracking-wider text-slate-500 uppercase">
							de {p.producao.metaMes}
						</span>
					</div>
					<div class="mt-2 h-2 w-full border border-slate-200 bg-slate-50">
						<div
							class="h-full {progressoMeta >= 100
								? 'bg-emerald-700'
								: progressoMeta >= 80
									? 'bg-blue-900'
									: 'bg-amber-600'}"
							style="width: {progressoMeta}%"
						></div>
					</div>
					<div class="mt-1 font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						{progressoMeta}% concluído
					</div>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="border border-slate-200 bg-white px-4 py-3">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						Tempo Médio
					</div>
					<div class="mt-1 font-mono text-2xl font-bold text-slate-900">
						{p.producao.tempoMedio}
					</div>
				</div>
				<div class="border border-slate-200 bg-white px-4 py-3">
					<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
						Aprovação
					</div>
					<div class="mt-1 font-mono text-2xl font-bold text-slate-900">
						{p.producao.taxaAprovacao}%
					</div>
				</div>
			</div>

			<div class="border border-slate-200 bg-white">
				<PanelHeader title="Ranking" index="03" />
				<div class="flex items-center justify-between px-4 py-3">
					<div>
						<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
							Sua posição
						</div>
						<div class="mt-0.5 font-mono text-3xl font-bold text-blue-900">
							{p.producao.ranking}º
						</div>
					</div>
					<div class="text-right font-mono text-[11px] text-slate-600">
						de {p.producao.totalAtendentes} operadores<br />
						na Secretaria
					</div>
				</div>
			</div>
		</div>

		<div class="col-span-12 border border-slate-200 bg-white">
			<PanelHeader title="Decisões por Especialidade" subtitle="Top 5" index="04" />
			<ul class="divide-y divide-slate-100 px-4">
				{#each p.producao.porEspecialidade as e, i (e.nome)}
					{@const pct = (e.volume / maxEsp) * 100}
					<li class="py-2.5">
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-2">
								<span
									class="flex h-5 w-5 items-center justify-center border border-slate-300 bg-slate-50 font-mono text-[10px] font-bold text-slate-700"
								>
									{i + 1}
								</span>
								<span class="text-xs font-semibold text-slate-900">{e.nome}</span>
							</div>
							<span class="font-mono text-sm font-bold text-slate-900">{e.volume}</span>
						</div>
						<div class="mt-1.5 h-1 w-full bg-slate-100">
							<div class="h-full bg-blue-900" style="width: {pct}%"></div>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</section>
