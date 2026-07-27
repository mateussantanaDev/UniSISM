<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { api } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';
	import { onMount } from 'svelte';

	let encs = $state<Encaminhamento[]>([]);
	let carregando = $state(true);

	onMount(async () => {
		try {
			encs = await api.encaminhamentos.list({ limit: 100 });
		} finally {
			carregando = false;
		}
	});

	interface Agregado {
		nome: string;
		total: number;
		aprovados: number;
		pendencias: number;
		rejeitados: number;
		aguardando: number;
	}

	let porEspecialidade = $derived.by<Agregado[]>(() => {
		const m = new Map<string, Agregado>();
		for (const e of encs) {
			const k = e.solicitacao.especialidadeSolicitada;
			const prev =
				m.get(k) ??
				({
					nome: k,
					total: 0,
					aprovados: 0,
					pendencias: 0,
					rejeitados: 0,
					aguardando: 0
				} satisfies Agregado);
			prev.total++;
			if (e.status === 'APROVADO') prev.aprovados++;
			if (e.status === 'PENDENCIA_DOCUMENTO') prev.pendencias++;
			if (e.status === 'REJEITADO') prev.rejeitados++;
			if (e.status === 'AGUARDANDO_REGULACAO') prev.aguardando++;
			m.set(k, prev);
		}
		return [...m.values()].sort((a, b) => b.total - a.total);
	});

	let porCid = $derived.by(() => {
		const m = new Map<string, { cid: string; descricao: string; total: number }>();
		for (const e of encs) {
			const prev = m.get(e.solicitacao.cid10) ?? {
				cid: e.solicitacao.cid10,
				descricao: e.solicitacao.cidDescricao,
				total: 0
			};
			prev.total++;
			m.set(e.solicitacao.cid10, prev);
		}
		return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 10);
	});

	let maxEsp = $derived(porEspecialidade.length > 0 ? porEspecialidade[0].total : 1);

	let totalEspecialidades = $derived(porEspecialidade.length);
	let topEspecialidade = $derived(porEspecialidade[0]?.nome ?? '—');
	let maiorRejeicao = $derived.by(() => {
		if (porEspecialidade.length === 0) return '—';
		const comMinimo = porEspecialidade.filter((e) => e.total >= 3);
		if (comMinimo.length === 0) return '—';
		const sorted = [...comMinimo].sort(
			(a, b) => b.rejeitados / b.total - a.rejeitados / a.total
		);
		return sorted[0].nome;
	});
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Especialidades Únicas"
			value={carregando ? '—' : totalEspecialidades}
			sublabel="Variedade de pedidos"
		/>
		<MetricCard
			label="Top Especialidade"
			value={carregando ? '—' : topEspecialidade}
			sublabel="Maior volume da rede"
		/>
		<MetricCard
			label="Maior Taxa de Rejeição"
			value={carregando ? '—' : maiorRejeicao}
			sublabel="≥ 3 casos"
			accent="critical"
		/>
		<MetricCard
			label="CID-10 Distintos"
			value={carregando ? '—' : new Set(encs.map((e) => e.solicitacao.cid10)).size}
			sublabel="Diversidade diagnóstica"
		/>
	</section>

	<div class="grid grid-cols-12 gap-4">
		<!-- Ranking especialidades -->
		<div class="col-span-12 border border-slate-200 bg-white xl:col-span-8">
			<PanelHeader
				title="Distribuição por Especialidade"
				subtitle="Volume e desfechos de cada área clínica"
				index="01"
			/>
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							<th class="border-r border-slate-200 px-3 py-2">#</th>
							<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-2">Total</th>
							<th class="border-r border-slate-200 px-3 py-2">Aguardando</th>
							<th class="border-r border-slate-200 px-3 py-2">Pendência</th>
							<th class="border-r border-slate-200 px-3 py-2">Aprovado</th>
							<th class="border-r border-slate-200 px-3 py-2">Rejeitado</th>
							<th class="px-3 py-2">Volume Relativo</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#if carregando}
							{#each Array(5) as _, i (i)}
								<tr class="border-b border-slate-100">
									<td colspan="8" class="px-3 py-3">
										<div class="h-3 w-full animate-pulse bg-slate-100"></div>
									</td>
								</tr>
							{/each}
						{:else}
							{#each porEspecialidade as e, i (e.nome)}
								{@const pct = (e.total / maxEsp) * 100}
								<tr class="border-b border-slate-100">
									<td class="border-r border-slate-100 px-3 py-2 text-slate-500">
										{String(i + 1).padStart(2, '0')}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-sans font-bold text-slate-900">
										{e.nome}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-900">
										{e.total}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-blue-900">
										{e.aguardando}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-amber-700">
										{e.pendencias}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-emerald-700">
										{e.aprovados}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-red-700">
										{e.rejeitados}
									</td>
									<td class="px-3 py-2">
										<div class="h-2 w-full bg-slate-100">
											<div class="h-full bg-blue-900" style="width: {pct}%"></div>
										</div>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Top CIDs -->
		<div class="col-span-12 border border-slate-200 bg-white xl:col-span-4">
			<PanelHeader title="Top CID-10" subtitle="Códigos mais solicitados" index="02" />
			<ul class="divide-y divide-slate-100 px-4">
				{#if carregando}
					{#each Array(5) as _, i (i)}
						<li class="py-2.5">
							<div class="h-3 w-full animate-pulse bg-slate-100"></div>
						</li>
					{/each}
				{:else}
					{#each porCid as c, i (c.cid)}
						<li class="py-2.5">
							<div class="flex items-baseline justify-between gap-3">
								<div class="flex min-w-0 items-center gap-2">
									<span
										class="flex h-5 w-5 shrink-0 items-center justify-center border border-slate-300 bg-slate-50 font-mono text-[10px] font-bold text-slate-700"
									>
										{i + 1}
									</span>
									<span class="font-mono text-[11px] font-bold text-blue-900">{c.cid}</span>
								</div>
								<span class="font-mono text-sm font-bold text-slate-900">{c.total}</span>
							</div>
							<div class="mt-0.5 truncate text-[11px] text-slate-700">{c.descricao}</div>
						</li>
					{/each}
				{/if}
			</ul>
		</div>
	</div>
</div>
