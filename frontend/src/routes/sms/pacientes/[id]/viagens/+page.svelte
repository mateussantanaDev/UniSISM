<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	import type { StatusViagemTFD, ViagemTFD } from '$lib/api/types';

	const ctx = usePaciente();
	let p = $derived(ctx.paciente!);

	const statusTone: Record<StatusViagemTFD, string> = {
		AGENDADA: 'border-blue-700 bg-blue-50 text-blue-900',
		REALIZADA: 'border-emerald-700 bg-emerald-50 text-emerald-800',
		CANCELADA: 'border-red-700 bg-red-50 text-red-800',
		EM_ANDAMENTO: 'border-amber-600 bg-amber-50 text-amber-800'
	};

	const transporteLabel: Record<ViagemTFD['transporte'], string> = {
		VAN_SMS: 'Van SMS',
		AMBULANCIA: 'Ambulância',
		PASSAGEM_RODOVIARIA: 'Passagem Rodoviária',
		PASSAGEM_AEREA: 'Passagem Aérea'
	};

	function formatarData(iso: string) {
		return new Date(iso).toLocaleDateString('pt-BR');
	}

	function formatarBRL(v: number) {
		return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	let realizadas = $derived(p.viagensTFD.filter((v) => v.status === 'REALIZADA').length);
	let agendadas = $derived(p.viagensTFD.filter((v) => v.status === 'AGENDADA').length);
	let custoTotal = $derived(
		p.viagensTFD
			.filter((v) => v.status === 'REALIZADA')
			.reduce((acc, v) => acc + v.custoEstimadoBRL, 0)
	);
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard label="Total de Viagens" value={p.viagensTFD.length} sublabel="TFD · histórico" />
		<MetricCard label="Realizadas" value={realizadas} sublabel="Concluídas" accent="success" />
		<MetricCard label="Agendadas" value={agendadas} sublabel="Em fila" accent="warning" />
		<MetricCard
			label="Custo Acumulado"
			value={formatarBRL(custoTotal)}
			sublabel="Recurso público SMS"
		/>
	</section>

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Viagens TFD · Tratamento Fora do Domicílio"
			subtitle="Deslocamentos custeados pela SMS para atendimento especializado"
			index="01"
		/>
		{#if p.viagensTFD.length === 0}
			<div class="px-4 py-8 text-center font-mono text-xs text-slate-500">
				Nenhuma viagem TFD registrada.
			</div>
		{:else}
			<ul class="divide-y divide-slate-100">
				{#each p.viagensTFD as v (v.id)}
					<li class="grid grid-cols-12 gap-3 px-4 py-4">
						<div class="col-span-12 md:col-span-8">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-mono text-sm font-bold text-blue-900">{v.protocolo}</span>
								<span
									class="border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase {statusTone[
										v.status
									]}"
								>
									{v.status.replace('_', ' ')}
								</span>
								<span
									class="border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-slate-700 uppercase"
								>
									{v.especialidade}
								</span>
							</div>
							<div class="mt-1.5 text-sm font-bold text-slate-900">{v.destino}</div>
							<div class="font-mono text-[11px] text-slate-600">{v.unidadeDestino}</div>
							<div class="mt-1.5 text-xs text-slate-700">
								<span class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
									Motivo:
								</span>
								{v.motivo}
							</div>
						</div>
						<div class="col-span-12 md:col-span-4">
							<dl class="grid grid-cols-2 gap-2 font-mono text-[11px]">
								<div>
									<dt class="tracking-widest text-slate-500 uppercase">Ida</dt>
									<dd class="font-bold text-slate-900">{formatarData(v.dataIda)}</dd>
								</div>
								<div>
									<dt class="tracking-widest text-slate-500 uppercase">Volta</dt>
									<dd class="font-bold text-slate-900">{formatarData(v.dataVolta)}</dd>
								</div>
								<div>
									<dt class="tracking-widest text-slate-500 uppercase">Transporte</dt>
									<dd class="text-slate-900">{transporteLabel[v.transporte]}</dd>
								</div>
								<div>
									<dt class="tracking-widest text-slate-500 uppercase">Acompanhante</dt>
									<dd class="text-slate-900">{v.acompanhante ? 'Sim' : 'Não'}</dd>
								</div>
								<div class="col-span-2">
									<dt class="tracking-widest text-slate-500 uppercase">Custo Estimado</dt>
									<dd class="text-sm font-bold text-slate-900">
										{formatarBRL(v.custoEstimadoBRL)}
									</dd>
								</div>
							</dl>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
