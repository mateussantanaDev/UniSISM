<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarCpf } from '$lib/presentation/utils/tfdFormat';
	import type {
		PrioridadeTfdPaciente,
		StatusTfdPaciente,
		TfdPacienteSolicAdmin
	} from '$lib/api/tfd-types';
	import { onMount } from 'svelte';

	type SolicitacaoPacienteComRegra = TfdPacienteSolicAdmin & {
		encaminhamentoComDataConfirmada?: boolean;
	};

	/**
	 * Pedidos de TFD vindos do app paciente (Face 3).
	 *
	 * Fluxo: paciente abre o app → solicita uma viagem TFD vinculada a
	 * encaminhamento aprovado → cai nesta tela como AGUARDANDO. Gestor
	 * decide aprovar/recusar. Após aprovação, gestor marca embarque no
	 * dia da viagem e concluir ao final.
	 *
	 * Backend: `/v1/tfd/solicitacoes-paciente/*` (6 endpoints). RBAC: rwGestor.
	 */

	let todas = $state<SolicitacaoPacienteComRegra[]>([]);
	let carregando = $state(true);
	let erro = $state<string | null>(null);

	let busca = $state('');
	let filtroStatus = $state<'TODOS' | StatusTfdPaciente>('AGUARDANDO');
	let filtroPrioridade = $state<'TODAS' | PrioridadeTfdPaciente>('TODAS');

	const lista = $derived.by(() => {
		let base = todas;
		if (filtroStatus !== 'TODOS') base = base.filter((s) => s.status === filtroStatus);
		if (filtroPrioridade !== 'TODAS') base = base.filter((s) => s.prioridade === filtroPrioridade);
		if (busca.trim()) {
			const q = busca.toLowerCase();
			base = base.filter(
				(s) =>
					s.paciente.nome.toLowerCase().includes(q) ||
					s.paciente.cpf.includes(q) ||
					s.viagem.destino.toLowerCase().includes(q) ||
					(s.encaminhamentoProtocolo ?? '').toLowerCase().includes(q)
			);
		}
		return base;
	});

	const filtrosStatus: Array<'TODOS' | StatusTfdPaciente> = [
		'TODOS',
		'AGUARDANDO',
		'APROVADA',
		'EMBARCADA',
		'CONCLUIDA',
		'RECUSADA',
		'CANCELADA'
	];

	const filtrosPrioridade: Array<'TODAS' | PrioridadeTfdPaciente> = [
		'TODAS',
		'URGENTE',
		'PRIORITARIA',
		'NORMAL'
	];

	const statusTone: Record<StatusTfdPaciente, string> = {
		AGUARDANDO: 'border-amber-600 bg-amber-50 text-amber-800',
		APROVADA: 'border-blue-700 bg-blue-50 text-blue-900',
		EMBARCADA: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		CONCLUIDA: 'border-slate-700 bg-slate-100 text-slate-800',
		RECUSADA: 'border-red-700 bg-red-50 text-red-800',
		CANCELADA: 'border-slate-300 bg-slate-50 text-slate-600'
	};

	const prioridadeTone: Record<PrioridadeTfdPaciente, string> = {
		NORMAL: 'border-slate-300 bg-white text-slate-700',
		PRIORITARIA: 'border-amber-600 bg-amber-50 text-amber-800',
		URGENTE: 'border-red-700 bg-red-50 text-red-800'
	};

	const aguardando = $derived(todas.filter((s) => s.status === 'AGUARDANDO').length);
	const aprovadas = $derived(todas.filter((s) => s.status === 'APROVADA').length);
	const embarcadas = $derived(todas.filter((s) => s.status === 'EMBARCADA').length);
	const recusadas = $derived(todas.filter((s) => s.status === 'RECUSADA').length);

	async function carregar() {
		carregando = true;
		erro = null;
		try {
			todas = await api.tfd.solicitacoesPaciente.list();
		} catch (e) {
			erro = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	function formatarDataViagem(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString('pt-BR');
		} catch {
			return iso;
		}
	}

	onMount(carregar);
</script>

<svelte:head>
	<title>Pedidos do App · TFD · UNISISM</title>
</svelte:head>

<div class="flex flex-col gap-4">
	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Aguardando"
			value={carregando ? '—' : aguardando}
			sublabel="Decisão pendente"
			accent="warning"
		/>
		<MetricCard
			label="Aprovadas"
			value={carregando ? '—' : aprovadas}
			sublabel="Embarque pendente"
			accent="default"
		/>
		<MetricCard
			label="Embarcadas"
			value={carregando ? '—' : embarcadas}
			sublabel="Em viagem"
			accent="success"
		/>
		<MetricCard
			label="Recusadas"
			value={carregando ? '—' : recusadas}
			sublabel="No total"
			accent="critical"
		/>
	</div>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Pedidos de TFD vindos do app paciente"
			subtitle="Solicitações enviadas pelos cidadãos via app — Face 3"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{lista.length} / {todas.length}
			</span>
		</PanelHeader>

		<div
			class="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5"
		>
			<input
				type="text"
				bind:value={busca}
				placeholder="Buscar por nome, CPF, destino ou protocolo do encaminhamento..."
				class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			/>
		</div>

		<div
			class="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5"
		>
			<span class="mr-2 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Status
			</span>
			{#each filtrosStatus as f (f)}
				<button
					type="button"
					onclick={() => (filtroStatus = f)}
					class="border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest uppercase transition-colors
						{filtroStatus === f
						? 'border-blue-900 bg-blue-900 text-white'
						: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
				>
					{f}
				</button>
			{/each}
		</div>

		<div
			class="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5"
		>
			<span class="mr-2 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Prioridade
			</span>
			{#each filtrosPrioridade as p (p)}
				<button
					type="button"
					onclick={() => (filtroPrioridade = p)}
					class="border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest uppercase transition-colors
						{filtroPrioridade === p
						? 'border-blue-900 bg-blue-900 text-white'
						: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
				>
					{p}
				</button>
			{/each}
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
						<th class="border-r border-slate-200 px-3 py-2">Encaminhamento</th>
						<th class="border-r border-slate-200 px-3 py-2">Destino</th>
						<th class="border-r border-slate-200 px-3 py-2">Data da Viagem</th>
						<th class="border-r border-slate-200 px-3 py-2">Vagas</th>
						<th class="border-r border-slate-200 px-3 py-2">Prioridade</th>
						<th class="border-r border-slate-200 px-3 py-2">Regra de Alocação App</th>
						<th class="px-3 py-2">Status</th>
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
					{:else if lista.length === 0}
						<tr>
							<td colspan="8" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum pedido do App encontrado.
							</td>
						</tr>
					{:else}
						{#each lista as s (s.id)}
							<tr class="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
								<td
									class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900 underline decoration-blue-900/30 underline-offset-2"
								>
									<a href="/tfd/solicitacoes-paciente/{s.id}">{s.paciente.nome}</a>
									<div class="text-[10px] font-normal text-slate-500">
										{formatarCpf(s.paciente.cpf)}
									</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{s.encaminhamentoProtocolo ?? '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{s.viagem.destino}
									{#if s.viagem.unidadeDestino && s.viagem.unidadeDestino !== s.viagem.destino}
										<div class="text-[10px] text-slate-500">{s.viagem.unidadeDestino}</div>
									{/if}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarDataViagem(s.viagem.data)}
									<div class="text-[10px] text-slate-500">{s.viagem.horaSaida}</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-center text-slate-700">
									{s.viagem.vagasOcupadas}/{s.viagem.vagasTotais}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase {prioridadeTone[
											s.prioridade
										]}"
									>
										{s.prioridade}
									</span>
								</td>
								<!-- Regra 5: Encaminhamento agendado com data ganha vaga automática; aguardando resposta exige gestor -->
								<td class="border-r border-slate-100 px-3 py-2 text-center whitespace-nowrap">
									{#if s.encaminhamentoProtocolo && s.encaminhamentoComDataConfirmada !== false}
										<span
											class="border border-emerald-700 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-900 uppercase"
										>
											✓ Vaga Automática (Data Confirmada)
										</span>
									{:else}
										<span
											class="border border-amber-600 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-900 uppercase"
										>
											⏳ Exige Gestor (Aguardando Data)
										</span>
									{/if}
								</td>
								<td class="px-3 py-2">
									<span
										class="border px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase {statusTone[
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
</div>
