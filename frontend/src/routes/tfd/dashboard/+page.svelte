<script lang="ts">
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarBRL, formatarData, mesAtual } from '$lib/presentation/utils/tfdFormat';
	import type { SaldoVeiculo, SolicitacaoTFD, ViagemFrota } from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let modoSimples = $derived(!!auth.ehReguladorTfdSimples);

	let solicitacoes = $state<SolicitacaoTFD[]>([]);
	let viagens = $state<ViagemFrota[]>([]);
	let saldos = $state<SaldoVeiculo[]>([]);
	let carregando = $state(true);
	let erro = $state<string | null>(null);

	// ─── Modo completo (gestor/admin/dev) ───
	const pendentes = $derived(solicitacoes.filter((s) => s.status === 'PENDENTE'));
	const aguardandoAlocacao = $derived(solicitacoes.filter((s) => s.status === 'APROVADA'));
	const emRota = $derived(viagens.filter((v) => v.status === 'EM_ANDAMENTO'));
	const proximas = $derived(viagens.filter((v) => v.status === 'AGENDADA').slice(0, 5));
	const passageirosConfirmados = $derived(
		[...emRota, ...proximas].reduce((acc, v) => acc + v.vagasOcupadas, 0)
	);
	const custoTotalSaldo = $derived(saldos.reduce((acc, s) => acc + s.saldoConsumido, 0));

	function ocupacaoTone(ocupados: number, capacidade: number): string {
		if (capacidade === 0) return 'border-slate-300 bg-slate-50 text-slate-600';
		const pct = (ocupados / capacidade) * 100;
		if (pct >= 90) return 'border-red-700 bg-red-50 text-red-800';
		if (pct >= 60) return 'border-amber-600 bg-amber-50 text-amber-800';
		return 'border-emerald-700 bg-emerald-50 text-emerald-800';
	}

	const prioridadeTone = {
		ELETIVA: 'border-slate-300 bg-white text-slate-700',
		PRIORITARIA: 'border-amber-600 bg-amber-50 text-amber-800',
		URGENTE: 'border-red-700 bg-red-50 text-red-800'
	} as const;

	async function carregar() {
		carregando = true;
		erro = null;
		try {
			if (modoSimples) {
				// REGULADOR_TFD: só precisamos das solicitações dele.
				solicitacoes = await api.tfd.solicitacoes.list({ criadaPorMim: true });
			} else {
				const [s, v, sl] = await Promise.all([
					api.tfd.solicitacoes.list(),
					api.tfd.viagens.list(),
					api.tfd.saldo.list(mesAtual())
				]);
				solicitacoes = s;
				viagens = v;
				saldos = sl;
			}
		} catch (e) {
			erro = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);

	// ─── Modo simples ───
	function inicioDoDia(d = new Date()): number {
		const x = new Date(d);
		x.setHours(0, 0, 0, 0);
		return x.getTime();
	}
	const hojeMs = inicioDoDia();
	const semanaMs = hojeMs - 6 * 86_400_000; // últimos 7 dias incluindo hoje
	const mesIso = mesAtual(); // YYYY-MM

	let cadastradasHoje = $derived(
		solicitacoes.filter((s) => new Date(s.criadaEm).getTime() >= hojeMs).length
	);
	let cadastradasSemana = $derived(
		solicitacoes.filter((s) => new Date(s.criadaEm).getTime() >= semanaMs).length
	);
	let cadastradasMes = $derived(solicitacoes.filter((s) => s.criadaEm.startsWith(mesIso)).length);

	let pendentesMinhas = $derived(solicitacoes.filter((s) => s.status === 'PENDENTE').length);
	let aprovadasMinhas = $derived(
		solicitacoes.filter((s) => s.status === 'APROVADA' || s.status === 'ALOCADA').length
	);
	let realizadasMinhas = $derived(solicitacoes.filter((s) => s.status === 'REALIZADA').length);
	let negadasMinhas = $derived(
		solicitacoes.filter((s) => s.status === 'NEGADA' || s.status === 'CANCELADA').length
	);

	let recentes = $derived(
		[...solicitacoes].sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : -1)).slice(0, 8)
	);

	const statusTone = {
		PENDENTE: 'border-amber-600 bg-amber-50 text-amber-800',
		APROVADA: 'border-blue-700 bg-blue-50 text-blue-900',
		ALOCADA: 'border-blue-700 bg-blue-50 text-blue-900',
		REALIZADA: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		NEGADA: 'border-red-700 bg-red-50 text-red-800',
		CANCELADA: 'border-slate-300 bg-slate-50 text-slate-600'
	} as const;
</script>

{#if modoSimples}
	<!-- ─────────── Modo simples · REGULADOR_TFD ─────────── -->
	<section class="flex flex-col gap-5">
		{#if erro}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<div
			class="border-l-4 border-blue-900 bg-blue-50 px-4 py-3 font-sans text-[13px] text-blue-900"
		>
			<strong class="font-mono tracking-widest uppercase"
				>Bom dia, {auth.me?.nome ?? 'Atendente'}.</strong
			>
			Aqui está o resumo das solicitações que você cadastrou. Para abrir uma nova viagem TFD, clique em
			<strong>+ Nova Solicitação</strong>.
		</div>

		<!-- 4 cards principais -->
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			<MetricCard
				label="Cadastradas Hoje"
				value={carregando ? '—' : cadastradasHoje}
				sublabel="Suas solicitações de hoje"
				accent="default"
			/>
			<MetricCard
				label="Pendentes"
				value={carregando ? '—' : pendentesMinhas}
				sublabel="Aguardando decisão da gestão"
				accent={pendentesMinhas > 0 ? 'warning' : 'default'}
			/>
			<MetricCard
				label="Aprovadas / Alocadas"
				value={carregando ? '—' : aprovadasMinhas}
				sublabel="Em fila ou viagem programada"
				accent="success"
			/>
			<MetricCard
				label="Realizadas no Mês"
				value={carregando ? '—' : realizadasMinhas}
				sublabel="Pacientes atendidos"
				accent="success"
			/>
		</div>

		<!-- Bloco de produção -->
		<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
			<div class="border border-slate-200 bg-white px-4 py-3">
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
					Últimos 7 dias
				</div>
				<div class="mt-1 font-mono text-2xl font-bold text-slate-900">
					{carregando ? '—' : cadastradasSemana}
				</div>
				<div class="font-sans text-[11px] text-slate-600">cadastradas por você</div>
			</div>
			<div class="border border-slate-200 bg-white px-4 py-3">
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
					Mês corrente
				</div>
				<div class="mt-1 font-mono text-2xl font-bold text-slate-900">
					{carregando ? '—' : cadastradasMes}
				</div>
				<div class="font-sans text-[11px] text-slate-600">cadastradas por você em {mesIso}</div>
			</div>
			<div class="border border-slate-200 bg-white px-4 py-3">
				<div class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
					Negadas / Canceladas
				</div>
				<div class="mt-1 font-mono text-2xl font-bold text-slate-900">
					{carregando ? '—' : negadasMinhas}
				</div>
				<div class="font-sans text-[11px] text-slate-600">total geral</div>
			</div>
		</div>

		<!-- CTA Nova Solicitação -->
		<button
			type="button"
			onclick={() => goto('/tfd/solicitacoes/nova')}
			class="flex items-center justify-between gap-3 border-2 border-blue-900 bg-blue-50 px-5 py-5 text-left transition-colors hover:bg-blue-100"
		>
			<div class="leading-tight">
				<div class="font-mono text-[10px] tracking-widest text-blue-700 uppercase">Nova viagem</div>
				<div class="mt-1 font-sans text-base font-bold text-blue-900">
					+ Cadastrar Passageiro / Solicitação TFD
				</div>
				<div class="mt-1 font-sans text-[12px] text-blue-800">
					Paciente · Especialidade · Destino · Acompanhante
				</div>
			</div>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="2"
				stroke="currentColor"
				class="h-7 w-7 text-blue-900"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
			</svg>
		</button>

		<!-- Recentes -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Suas Últimas Solicitações"
				subtitle="As 8 mais recentes — pendentes ficam no topo até decisão da gestão"
				index="01"
			/>
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
							<th class="border-r border-slate-200 px-3 py-2">Cadastrada</th>
							<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
							<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
							<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-2">Destino</th>
							<th class="px-3 py-2">Status</th>
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
						{:else if recentes.length === 0}
							<tr>
								<td colspan="6" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
									Nada cadastrado ainda. Use “+ Cadastrar Passageiro / Solicitação TFD” acima.
								</td>
							</tr>
						{:else}
							{#each recentes as s (s.id)}
								<tr class="border-b border-slate-100 hover:bg-slate-50">
									<td class="border-r border-slate-100 px-3 py-2 text-[10px] text-slate-600">
										{formatarData(s.criadaEm.slice(0, 10))}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900">
										{s.protocolo}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
										{s.pacienteNome ?? '—'}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{s.especialidade}
									</td>
									<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
										{s.destino}
									</td>
									<td class="px-3 py-2">
										<span
											class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {statusTone[
												s.status
											]}"
										>
											{s.status}
										</span>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	</section>
{:else}
	<!-- ─────────── Modo completo (GESTOR/ADMIN/DEV) ─────────── -->
	<section class="flex flex-col gap-4">
		{#if erro}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<!-- KPIs -->
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			<MetricCard
				label="Solicitações Pendentes"
				value={carregando ? '—' : pendentes.length}
				sublabel="Aguardando aprovação"
				accent={pendentes.length > 0 ? 'warning' : 'default'}
			/>
			<MetricCard
				label="Veículos em Rota"
				value={carregando ? '—' : emRota.length}
				sublabel="Frota em deslocamento"
				accent="warning"
			/>
			<MetricCard
				label="Passageiros Confirmados"
				value={carregando ? '—' : passageirosConfirmados}
				sublabel="Próximas saídas"
				accent="success"
			/>
			<MetricCard
				label="Consumo do Mês"
				value={carregando ? '—' : formatarBRL(custoTotalSaldo)}
				sublabel="Total da frota · {mesAtual()}"
			/>
		</div>

		<div class="grid grid-cols-12 gap-4">
			<!-- Solicitações pendentes -->
			<div class="col-span-12 border border-slate-200 bg-white xl:col-span-6">
				<PanelHeader
					title="Solicitações Aguardando Aprovação"
					subtitle="Pacientes pendentes de decisão · clique para ver detalhe"
					index="01"
				>
					<span
						class="border border-amber-600 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-amber-800 uppercase"
					>
						{pendentes.length} PENDENTES
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
								<th class="border-r border-slate-200 px-3 py-2">Destino</th>
								<th class="border-r border-slate-200 px-3 py-2">Data</th>
								<th class="px-3 py-2">Prioridade</th>
							</tr>
						</thead>
						<tbody class="font-mono">
							{#if carregando}
								{#each Array(3) as _, i (i)}
									<tr class="border-b border-slate-100">
										<td colspan="5" class="px-3 py-3">
											<div class="h-3 w-full animate-pulse bg-slate-100"></div>
										</td>
									</tr>
								{/each}
							{:else if pendentes.length === 0}
								<tr>
									<td colspan="5" class="px-3 py-8 text-center font-sans text-sm text-slate-500">
										Nenhuma solicitação pendente.
									</td>
								</tr>
							{:else}
								{#each pendentes as s (s.id)}
									<tr class="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
										<td
											class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900 underline decoration-blue-900/30 underline-offset-2"
										>
											<a href="/tfd/solicitacoes/{s.id}">{s.protocolo}</a>
										</td>
										<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
											{s.pacienteNome ?? '—'}
											<div class="text-[10px] text-slate-500">{s.especialidade}</div>
										</td>
										<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
											{s.destino}
										</td>
										<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
											{formatarData(s.dataDesejada)}
										</td>
										<td class="px-3 py-2">
											<span
												class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {prioridadeTone[
													s.prioridade
												]}"
											>
												{s.prioridade}
											</span>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Saídas próximas -->
			<div class="col-span-12 border border-slate-200 bg-white xl:col-span-6">
				<PanelHeader
					title="Saídas Agendadas"
					subtitle="Frota das próximas saídas + viagens em rota"
					index="02"
				>
					<span
						class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						{emRota.length + proximas.length} VEÍCULOS
					</span>
				</PanelHeader>

				<ul class="divide-y divide-slate-100">
					{#if carregando}
						{#each Array(3) as _, i (i)}
							<li class="px-4 py-3"><div class="h-4 w-full animate-pulse bg-slate-100"></div></li>
						{/each}
					{:else if emRota.length === 0 && proximas.length === 0}
						<li class="px-4 py-8 text-center font-sans text-sm text-slate-500">
							Nenhuma viagem agendada.
						</li>
					{:else}
						{#each [...emRota, ...proximas] as v (v.id)}
							<li>
								<a
									href={`/tfd/viagens/${v.id}`}
									class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
								>
									<div class="flex items-center gap-3">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											stroke-width="1.5"
											stroke="currentColor"
											class="h-6 w-6 shrink-0 {v.status === 'EM_ANDAMENTO'
												? 'text-amber-700'
												: 'text-slate-700'}"
											aria-hidden="true"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0H15M5.25 18.75v-1.5m0 0a3 3 0 0 1 3-3h7.5a3 3 0 0 1 3 3m-13.5 0V9a3 3 0 0 1 3-3h7.5a3 3 0 0 1 3 3v9.75M18.75 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0M3 8.25h18M3 12h18m-9-3.75v9"
											/>
										</svg>
										<div class="leading-tight">
											<div class="font-mono text-xs font-bold text-slate-900">
												{v.veiculoPlaca ?? '—'} · {v.destino}
											</div>
											<div class="font-mono text-[10px] tracking-wider text-slate-500 uppercase">
												{v.motoristaNome ?? '—'} · {formatarData(v.data)} · Saída {v.horaSaida}
											</div>
										</div>
									</div>
									<div class="flex items-center gap-2">
										{#if v.status === 'EM_ANDAMENTO'}
											<span
												class="border border-amber-600 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber-800 uppercase"
											>
												EM ROTA
											</span>
										{/if}
										<span
											class="border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase {ocupacaoTone(
												v.vagasOcupadas,
												v.vagasTotais
											)}"
										>
											{v.vagasOcupadas}/{v.vagasTotais} VAGAS
										</span>
									</div>
								</a>
							</li>
						{/each}
					{/if}
				</ul>
			</div>
		</div>

		{#if aguardandoAlocacao.length > 0}
			<div
				class="border-l-4 border-blue-900 bg-blue-50 px-4 py-3 font-sans text-[12px] text-blue-900"
			>
				<strong class="font-mono tracking-wider uppercase">Atenção:</strong>
				{aguardandoAlocacao.length} solicitação(ões) aprovada(s) ainda sem viagem alocada — abra
				<a class="underline" href="/tfd/viagens/nova">/tfd/viagens/nova</a> para criar uma nova viagem.
			</div>
		{/if}
	</section>
{/if}
