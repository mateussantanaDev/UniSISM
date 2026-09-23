<script lang="ts">
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import { api } from '$lib/api';
	import type { AtendentePerfil, Encaminhamento } from '$lib/api/types';
	import { onMount } from 'svelte';

	/**
	 * Minha Produção (UBS) — dados 100% dinâmicos.
	 *  - Agregados diretos vêm de GET /me/profile (producao.*).
	 *  - "Por hora" deriva dos encaminhamentos do dia via GET /encaminhamentos.
	 */

	let perfil = $state<AtendentePerfil | null>(null);
	let encsHoje = $state<Encaminhamento[]>([]);
	let carregando = $state(true);

	onMount(async () => {
		try {
			const desdeISO = new Date();
			desdeISO.setHours(0, 0, 0, 0);
			const [p, encs] = await Promise.all([
				api.perfil.get(),
				api.encaminhamentos.list({
					desde: desdeISO.toISOString().slice(0, 10),
					limit: 500
				})
			]);
			perfil = p;
			encsHoje = encs;
		} finally {
			carregando = false;
		}
	});

	/** Agrupamento horário das ingestões de hoje (7h–19h · horário funcional). */
	let porHora = $derived.by(() => {
		const buckets: Array<{ hora: string; volume: number }> = [];
		for (let h = 7; h <= 19; h++) {
			buckets.push({ hora: `${String(h).padStart(2, '0')}h`, volume: 0 });
		}
		for (const e of encsHoje) {
			const h = new Date(e.criadoEm).getHours();
			if (h >= 7 && h <= 19) {
				buckets[h - 7].volume += 1;
			}
		}
		return buckets;
	});

	let maxHora = $derived(Math.max(1, ...porHora.map((b) => b.volume)));

	/** Especialidades derivadas das ingestões do dia (apenas com contagem > 0). */
	let porEspecialidade = $derived.by(() => {
		if (!perfil) return [] as { nome: string; volume: number; pct: number }[];
		const total = perfil.producao.porEspecialidade.reduce((a, e) => a + e.volume, 0);
		if (total === 0) return [];
		return perfil.producao.porEspecialidade
			.map((e) => ({
				nome: e.nome,
				volume: e.volume,
				pct: (e.volume / total) * 100
			}))
			.sort((a, b) => b.volume - a.volume);
	});

	function formatarMesAno(): string {
		return new Date().toLocaleDateString('pt-BR', {
			month: 'long',
			year: 'numeric'
		});
	}

	let percentualMeta = $derived.by(() => {
		if (!perfil || perfil.producao.metaMes === 0) return 0;
		return Math.min(100, Math.round((perfil.producao.mes / perfil.producao.metaMes) * 100));
	});
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Hoje"
			value={carregando ? '—' : (perfil?.producao.hoje ?? 0)}
			sublabel="encaminhamentos"
		/>
		<MetricCard
			label="Esta Semana"
			value={carregando ? '—' : (perfil?.producao.semana ?? 0)}
			sublabel="últimos 7 dias"
			accent="default"
		/>
		<MetricCard
			label="Este Mês"
			value={carregando ? '—' : (perfil?.producao.mes ?? 0)}
			sublabel={formatarMesAno()}
			accent="success"
		/>
		<MetricCard
			label="Meta Mensal"
			value={carregando ? '—' : `${percentualMeta}%`}
			sublabel={carregando || !perfil
				? '—'
				: `${perfil.producao.mes} de ${perfil.producao.metaMes} esperados`}
			accent="warning"
		/>
	</section>

	<section class="grid grid-cols-12 gap-4">
		<!-- Produção por hora (hoje) -->
		<div class="col-span-12 border border-slate-200 bg-white xl:col-span-7">
			<PanelHeader
				title="Produção por Hora · Hoje"
				subtitle="Ingestões criadas entre 07h e 19h"
				index="01"
			/>
			<div class="px-4 py-4">
				{#if carregando}
					<div class="h-52 animate-pulse bg-slate-50"></div>
				{:else if encsHoje.length === 0}
					<div class="flex h-52 items-center justify-center font-mono text-xs text-slate-500">
						Nenhuma ingestão registrada hoje.
					</div>
				{:else}
					<div class="flex h-52 items-end gap-3">
						{#each porHora as h (h.hora)}
							{@const pct = (h.volume / maxHora) * 100}
							<div class="flex flex-1 flex-col items-center gap-1.5">
								<div class="font-mono text-[10px] font-bold text-slate-700">
									{h.volume}
								</div>
								<div class="w-full bg-blue-900 transition-all" style="height: {pct}%"></div>
								<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
									{h.hora}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Ranking por especialidade (vem do backend) -->
		<div class="col-span-12 border border-slate-200 bg-white xl:col-span-5">
			<PanelHeader
				title="Ranking por Especialidade"
				subtitle="Acumulado do atendente (GET /me/profile)"
				index="02"
			/>
			<ul class="divide-y divide-slate-100 px-4">
				{#if carregando}
					{#each Array(5) as _, i (i)}
						<li class="py-2.5">
							<div class="h-3 w-full animate-pulse bg-slate-100"></div>
						</li>
					{/each}
				{:else if porEspecialidade.length === 0}
					<li class="py-6 text-center font-mono text-xs text-slate-500">
						Nenhuma produção registrada por especialidade ainda.
					</li>
				{:else}
					{#each porEspecialidade as e, i (e.nome)}
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
								<div class="flex items-center gap-3">
									<span class="font-mono text-[11px] text-slate-600">
										{e.pct.toFixed(1)}%
									</span>
									<span class="font-mono text-sm font-bold text-slate-900">{e.volume}</span>
								</div>
							</div>
							<div class="mt-1.5 h-1 w-full bg-slate-100">
								<div class="h-full bg-blue-900" style="width: {e.pct}%"></div>
							</div>
						</li>
					{/each}
				{/if}
			</ul>
		</div>
	</section>

	<section class="grid grid-cols-12 gap-4">
		<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
			<PanelHeader title="Tempo Médio" subtitle="PDF → Consolidação" index="03" />
			<div class="px-4 py-4">
				<div class="font-mono text-4xl font-bold text-slate-900">
					{carregando ? '—' : (perfil?.producao.tempoMedio ?? '—')}
				</div>
				<div class="mt-1 text-[11px] text-slate-600">GET /me/profile</div>
			</div>
		</div>
		<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
			<PanelHeader title="Taxa de Aprovação" subtitle="Pós-regulação" index="04" />
			<div class="px-4 py-4">
				<div class="font-mono text-4xl font-bold text-slate-900">
					{carregando ? '—' : `${perfil?.producao.taxaAprovacao ?? 0}%`}
				</div>
				<div class="mt-1 text-[11px] text-slate-600">
					{carregando
						? '—'
						: `Ranking ${perfil?.producao.ranking ?? '—'}º de ${perfil?.producao.totalAtendentes ?? '—'}`}
				</div>
			</div>
		</div>
		<div class="col-span-12 border border-slate-200 bg-white md:col-span-4">
			<PanelHeader title="Volume do Ano" subtitle="Acumulado até hoje" index="05" />
			<div class="px-4 py-4">
				<div class="font-mono text-4xl font-bold text-slate-900">
					{carregando ? '—' : (perfil?.producao.ano ?? 0)}
				</div>
				<div class="mt-1 text-[11px] text-slate-600">
					{carregando ? '—' : `Meta mês · ${perfil?.producao.metaMes ?? '—'}`}
				</div>
			</div>
		</div>
	</section>
</div>
