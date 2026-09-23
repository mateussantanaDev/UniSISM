<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import { formatarData } from '$lib/presentation/utils/tfdFormat';
	import type { StatusViagem, ViagemFrota } from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = useAuth();
	let podeOperar = $derived(!!auth.podeGerenciarTFD);

	let viagens = $state<ViagemFrota[]>([]);
	let carregando = $state(true);
	let erro = $state<string | null>(null);

	let busca = $state('');
	let filtro = $state<'TODOS' | StatusViagem>('TODOS');

	const lista = $derived.by(() => {
		let base = viagens;
		if (filtro !== 'TODOS') base = base.filter((v) => v.status === filtro);
		if (busca.trim()) {
			const q = busca.toLowerCase();
			base = base.filter(
				(v) =>
					(v.veiculoPlaca ?? '').toLowerCase().includes(q) ||
					(v.motoristaNome ?? '').toLowerCase().includes(q) ||
					v.destino.toLowerCase().includes(q)
			);
		}
		return base;
	});

	const filtros: Array<'TODOS' | StatusViagem> = [
		'TODOS',
		'AGENDADA',
		'EM_ANDAMENTO',
		'CONCLUIDA',
		'CANCELADA'
	];

	const statusTone: Record<StatusViagem, string> = {
		AGENDADA: 'border-blue-700 bg-blue-50 text-blue-900',
		EM_ANDAMENTO: 'border-amber-600 bg-amber-50 text-amber-800',
		CONCLUIDA: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		CANCELADA: 'border-red-700 bg-red-50 text-red-800'
	};

	function vagasTone(o: number, t: number): string {
		if (t === 0) return 'border-slate-300 bg-slate-50 text-slate-600';
		const pct = (o / t) * 100;
		if (pct >= 100) return 'border-red-700 bg-red-50 text-red-800';
		if (pct >= 80) return 'border-amber-600 bg-amber-50 text-amber-800';
		return 'border-emerald-700 bg-emerald-50 text-emerald-800';
	}

	async function carregar() {
		carregando = true;
		erro = null;
		try {
			viagens = await api.tfd.viagens.list();
		} catch (e) {
			erro = mensagemErroTfd(e);
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);
</script>

<div class="flex flex-col gap-4">
	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Viagens da Frota"
			subtitle="Calendário operacional · clique na linha para abrir detalhe"
			index="01"
		>
			<span
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] tracking-widest text-slate-600 uppercase"
			>
				{lista.length} / {viagens.length}
			</span>
			{#if podeOperar}
				<PrimaryButton
					label="+ Nova Viagem"
					shortcut="N"
					onclick={() => goto('/tfd/viagens/nova')}
				/>
			{/if}
		</PanelHeader>

		<div class="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
			<input
				type="text"
				bind:value={busca}
				placeholder="Veículo, motorista, destino..."
				class="flex-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			/>
		</div>
		<div
			class="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5"
		>
			<span class="mr-2 font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Status
			</span>
			{#each filtros as f (f)}
				<button
					type="button"
					onclick={() => (filtro = f)}
					class="border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest uppercase transition-colors
						{filtro === f
						? 'border-blue-900 bg-blue-900 text-white'
						: 'border-slate-300 bg-white text-slate-700 hover:border-blue-900 hover:text-blue-900'}"
				>
					{f.replace('_', ' ')}
				</button>
			{/each}
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<th class="border-r border-slate-200 px-3 py-2">Data</th>
						<th class="border-r border-slate-200 px-3 py-2">Saída</th>
						<th class="border-r border-slate-200 px-3 py-2">Veículo</th>
						<th class="border-r border-slate-200 px-3 py-2">Motorista</th>
						<th class="border-r border-slate-200 px-3 py-2">Destino</th>
						<th class="border-r border-slate-200 px-3 py-2">Vagas</th>
						<th class="border-r border-slate-200 px-3 py-2">Hodômetro (KM Gestor)</th>
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
								Nenhuma viagem encontrada.
							</td>
						</tr>
					{:else}
						{#each lista as v (v.id)}
							<tr
								class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
								onclick={() => goto(`/tfd/viagens/${v.id}`)}
							>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-700">
									{formatarData(v.data)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-900">
									{v.horaSaida}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<div class="font-sans font-bold text-slate-900">{v.veiculoPlaca ?? '—'}</div>
									<div class="text-[10px] tracking-wider text-slate-500 uppercase">
										{v.veiculoModelo ?? '—'}
									</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-800">
									{v.motoristaNome ?? '—'}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700">
									{v.destino}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {vagasTone(
											v.vagasOcupadas,
											v.vagasTotais
										)}"
									>
										{v.vagasOcupadas}/{v.vagasTotais}
									</span>
								</td>
								<!-- Hodômetro (Gestor Direto) -->
								<td class="border-r border-slate-100 px-3 py-2 font-mono text-xs">
									{#if v.kmInicialHodometro || v.kmFinalHodometro}
										<div class="font-bold text-slate-900">
											{v.kmInicialHodometro
												? `Saída: ${v.kmInicialHodometro.toLocaleString('pt-BR')} km`
												: ''}
										</div>
										{#if v.kmFinalHodometro}
											<div class="text-[10px] font-bold text-emerald-800">
												Chegada: {v.kmFinalHodometro.toLocaleString('pt-BR')} km
											</div>
										{/if}
									{:else}
										<span
											class="border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-900 uppercase"
										>
											🚗 Pendente KM Gestor
										</span>
									{/if}
								</td>
								<td class="px-3 py-2">
									<span
										class="border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase {statusTone[
											v.status
										]}"
									>
										{v.status.replace('_', ' ')}
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
