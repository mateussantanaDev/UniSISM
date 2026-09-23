<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { api } from '$lib/api';
	import type { PacienteResumo } from '$lib/api/types';
	import { onMount } from 'svelte';

	/**
	 * Distribuição geográfica — agregações por UBS, equipe ESF e microárea.
	 * Útil para planejamento territorial e alocação de ACS.
	 */

	let pacientes = $state<PacienteResumo[]>([]);
	let carregando = $state(true);

	onMount(async () => {
		try {
			pacientes = await api.pacientes.list();
		} finally {
			carregando = false;
		}
	});

	interface AgrupadoUbs {
		nome: string;
		pacientes: number;
		cronicos: number;
		encAtivos: number;
		abandono: number;
	}

	function diasDesde(iso?: string): number {
		if (!iso) return Infinity;
		return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
	}

	let porUbs = $derived.by<AgrupadoUbs[]>(() => {
		const m = new Map<string, AgrupadoUbs>();
		for (const p of pacientes) {
			const k = p.unidadeVinculada;
			const prev = m.get(k) ?? {
				nome: k,
				pacientes: 0,
				cronicos: 0,
				encAtivos: 0,
				abandono: 0
			};
			prev.pacientes++;
			if (p.condicoesCronicasAtivas > 0) prev.cronicos++;
			prev.encAtivos += p.encaminhamentosAtivos;
			if (diasDesde(p.ultimoAtendimento) > 90) prev.abandono++;
			m.set(k, prev);
		}
		return [...m.values()].sort((a, b) => b.pacientes - a.pacientes);
	});

	let porEquipe = $derived.by(() => {
		const m = new Map<string, number>();
		for (const p of pacientes) {
			if (!p.equipeSaudeFamilia) continue;
			m.set(p.equipeSaudeFamilia, (m.get(p.equipeSaudeFamilia) ?? 0) + 1);
		}
		return [...m.entries()]
			.map(([nome, total]) => ({ nome, total }))
			.sort((a, b) => b.total - a.total);
	});

	let maxUbs = $derived(porUbs.length > 0 ? porUbs[0].pacientes : 1);
	let maxEquipe = $derived(porEquipe.length > 0 ? porEquipe[0].total : 1);

	let totalAbandono = $derived(porUbs.reduce((a, u) => a + u.abandono, 0));
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Pacientes na Rede"
			value={carregando ? '—' : pacientes.length}
			sublabel="Total municipal"
		/>
		<MetricCard
			label="UBSs Atendendo"
			value={carregando ? '—' : porUbs.length}
			sublabel="Com pacientes vinculados"
		/>
		<MetricCard
			label="Equipes ESF"
			value={carregando ? '—' : porEquipe.length}
			sublabel="Cadastradas no sistema"
		/>
		<MetricCard
			label="Busca Ativa"
			value={carregando ? '—' : totalAbandono}
			sublabel="Sem atendimento >90d"
			accent="critical"
		/>
	</section>

	<div class="grid grid-cols-12 gap-4">
		<!-- Por UBS -->
		<div class="col-span-12 border border-slate-200 bg-white xl:col-span-7">
			<PanelHeader
				title="Distribuição por UBS"
				subtitle="Pacientes vinculados · crônicos · abandono"
				index="01"
			/>
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							<th class="border-r border-slate-200 px-3 py-2">UBS</th>
							<th class="border-r border-slate-200 px-3 py-2">Pacientes</th>
							<th class="border-r border-slate-200 px-3 py-2">Crônicos</th>
							<th class="border-r border-slate-200 px-3 py-2">Enc. Ativos</th>
							<th class="border-r border-slate-200 px-3 py-2">Abandono</th>
							<th class="px-3 py-2">Volume Relativo</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#if carregando}
							{#each Array(5) as _, i (i)}
								<tr class="border-b border-slate-100">
									<td colspan="6" class="px-3 py-3">
										<div class="h-3 w-full animate-pulse bg-slate-100"></div>
									</td>
								</tr>
							{/each}
						{:else if porUbs.length === 0}
							<tr>
								<td colspan="6" class="px-3 py-8 text-center font-sans text-sm text-slate-500">
									Sem pacientes cadastrados.
								</td>
							</tr>
						{:else}
							{#each porUbs as u (u.nome)}
								{@const pct = (u.pacientes / maxUbs) * 100}
								<tr class="border-b border-slate-100">
									<td
										class="border-r border-slate-100 px-3 py-2 font-sans font-bold text-slate-900"
									>
										{u.nome}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-900">
										{u.pacientes}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-amber-700">
										{u.cronicos}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-blue-900">
										{u.encAtivos}
									</td>
									<td
										class="border-r border-slate-100 px-3 py-2 {u.abandono > 0
											? 'font-bold text-red-700'
											: 'text-slate-400'}"
									>
										{u.abandono}
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

		<!-- Por Equipe ESF -->
		<div class="col-span-12 border border-slate-200 bg-white xl:col-span-5">
			<PanelHeader
				title="Pacientes por Equipe ESF"
				subtitle="Carga por equipe de Saúde da Família"
				index="02"
			/>
			<ul class="divide-y divide-slate-100 px-4">
				{#if carregando}
					{#each Array(5) as _, i (i)}
						<li class="py-2.5">
							<div class="h-3 w-full animate-pulse bg-slate-100"></div>
						</li>
					{/each}
				{:else if porEquipe.length === 0}
					<li class="py-4 text-center font-mono text-xs text-slate-500">
						Sem equipes identificadas.
					</li>
				{:else}
					{#each porEquipe as e (e.nome)}
						{@const pct = (e.total / maxEquipe) * 100}
						<li class="py-2.5">
							<div class="flex items-baseline justify-between gap-3">
								<span class="truncate text-xs font-semibold text-slate-900">{e.nome}</span>
								<span class="font-mono text-sm font-bold text-slate-900">{e.total}</span>
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
</div>
