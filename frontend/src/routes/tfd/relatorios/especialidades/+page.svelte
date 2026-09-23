<script lang="ts">
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarBRL } from '$lib/presentation/utils/tfdFormat';
	import type { RelatorioEspecialidadeResposta } from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let bloqueado = $derived(!auth.podeGerenciarTFD);

	let dados = $state<RelatorioEspecialidadeResposta | null>(null);
	let carregando = $state(true);
	let erro = $state<string | null>(null);

	function inicioDoMes(meses: number = 11): string {
		const d = new Date();
		d.setMonth(d.getMonth() - meses);
		d.setDate(1);
		return d.toISOString().slice(0, 10);
	}

	function hoje(): string {
		return new Date().toISOString().slice(0, 10);
	}

	let desde = $state(inicioDoMes(11)); // últimos 12 meses
	let ate = $state(hoje());

	async function carregar() {
		carregando = true;
		erro = null;
		try {
			dados = await api.tfd.relatorios.porEspecialidade({ desde, ate });
		} catch (e) {
			erro = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	// Para a barra horizontal — escala pelo maior valor
	let maxSolicitacoes = $derived.by(() => {
		if (!dados || dados.itens.length === 0) return 0;
		return Math.max(...dados.itens.map((i) => i.totalSolicitacoes));
	});

	function exportarCsv() {
		if (!dados) return;
		const linhas = [
			[
				'Especialidade',
				'Solicitações',
				'Realizadas',
				'Pendentes',
				'Negadas',
				'Pacientes Únicos',
				'Custo Total (R$)',
				'Custo Médio por Viagem (R$)',
				'Destinos Mais Frequentes'
			].join(';'),
			...dados.itens.map((i) =>
				[
					i.especialidade,
					i.totalSolicitacoes,
					i.totalRealizadas,
					i.totalPendentes,
					i.totalNegadas,
					i.pacientesUnicos,
					i.custoEstimadoBRL.toFixed(2).replace('.', ','),
					i.custoMedioPorViagemBRL.toFixed(2).replace('.', ','),
					'"' + i.destinosMaisFrequentes.join(' | ') + '"'
				].join(';')
			)
		].join('\n');
		const blob = new Blob(['﻿' + linhas], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `tfd-especialidades-${desde}-a-${ate}.csv`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
	}
</script>

{#if bloqueado}
	<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
		<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
			Permissão insuficiente
		</div>
		<p class="mt-2 text-xs text-red-800">Apenas a gestão TFD pode acessar relatórios analíticos.</p>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		{#if erro}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<!-- Filtros -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Janela de Análise"
				subtitle="Escolha o período para agregar — default: últimos 12 meses"
				index="01"
			>
				<PrimaryButton label="Atualizar" onclick={carregar} loading={carregando} />
			</PanelHeader>

			<div class="flex flex-wrap items-center gap-3 px-4 py-3">
				<label class="flex flex-col gap-1">
					<span
						class="font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Desde
					</span>
					<input
						type="date"
						bind:value={desde}
						class="border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span
						class="font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Até
					</span>
					<input
						type="date"
						bind:value={ate}
						class="border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					/>
				</label>
				<button
					type="button"
					onclick={exportarCsv}
					disabled={!dados || dados.itens.length === 0}
					class="border border-slate-300 bg-white px-3 py-1.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Exportar CSV
				</button>
			</div>
		</div>

		<!-- KPIs -->
		<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
			<MetricCard
				label="Especialidades distintas"
				value={carregando ? '—' : (dados?.itens.length ?? 0)}
				sublabel="No período selecionado"
			/>
			<MetricCard
				label="Total de solicitações"
				value={carregando ? '—' : (dados?.totalGeralSolicitacoes ?? 0)}
				sublabel="Soma de todas as especialidades"
			/>
			<MetricCard
				label="Custo estimado total"
				value={carregando ? '—' : formatarBRL(dados?.totalGeralCustoBRL ?? 0)}
				sublabel="Combustível + ajuda de custo"
			/>
		</div>

		<!-- Tabela ranqueada -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Volume por Especialidade"
				subtitle="Maior volume primeiro · subsidia decisão de contratação local"
				index="02"
			/>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							<th class="border-r border-slate-200 px-3 py-2">#</th>
							<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-2">Volume</th>
							<th class="border-r border-slate-200 px-3 py-2 text-right">Solicitações</th>
							<th class="border-r border-slate-200 px-3 py-2 text-right">Realizadas</th>
							<th class="border-r border-slate-200 px-3 py-2 text-right">Pendentes</th>
							<th class="border-r border-slate-200 px-3 py-2 text-right">Pacientes únicos</th>
							<th class="border-r border-slate-200 px-3 py-2 text-right">Custo total</th>
							<th class="px-3 py-2 text-right">Custo médio</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#if carregando}
							{#each Array(5) as _, i (i)}
								<tr class="border-b border-slate-100">
									<td colspan="9" class="px-3 py-3">
										<div class="h-3 w-full animate-pulse bg-slate-100"></div>
									</td>
								</tr>
							{/each}
						{:else if !dados || dados.itens.length === 0}
							<tr>
								<td colspan="9" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
									Nenhuma solicitação no período selecionado.
								</td>
							</tr>
						{:else}
							{#each dados.itens as it, idx (it.especialidade)}
								{@const pct =
									maxSolicitacoes > 0 ? (it.totalSolicitacoes / maxSolicitacoes) * 100 : 0}
								<tr class="border-b border-slate-100 hover:bg-slate-50">
									<td class="border-r border-slate-100 px-3 py-2 text-slate-500">
										{String(idx + 1).padStart(2, '0')}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-900">
										{it.especialidade}
										{#if it.destinosMaisFrequentes.length > 0}
											<div class="font-sans text-[10px] font-normal text-slate-500">
												→ {it.destinosMaisFrequentes.slice(0, 3).join(' · ')}
											</div>
										{/if}
									</td>
									<td class="border-r border-slate-100 px-3 py-2">
										<div class="flex items-center gap-2">
											<div class="h-2 w-32 bg-slate-100">
												<div
													class="h-full {pct > 75
														? 'bg-red-700'
														: pct > 40
															? 'bg-amber-600'
															: 'bg-blue-900'}"
													style:width="{pct}%"
												></div>
											</div>
										</div>
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-right text-slate-900">
										{it.totalSolicitacoes}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-right text-emerald-800">
										{it.totalRealizadas}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-right text-amber-800">
										{it.totalPendentes}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-right text-slate-700">
										{it.pacientesUnicos}
									</td>
									<td
										class="border-r border-slate-100 px-3 py-2 text-right font-bold text-slate-900"
									>
										{formatarBRL(it.custoEstimadoBRL)}
									</td>
									<td class="px-3 py-2 text-right text-slate-700">
										{formatarBRL(it.custoMedioPorViagemBRL)}
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<div
			class="border-l-4 border-emerald-700 bg-emerald-50 px-4 py-3 font-sans text-[12px] text-emerald-900"
		>
			<strong class="font-mono tracking-widest uppercase">Decisão estratégica:</strong>
			especialidades no topo da tabela, com alto volume e custo elevado, podem ser candidatas a contratação
			de especialista local — economizando o transporte recorrente e melhorando o acesso para o paciente.
		</div>
	</div>
{/if}
