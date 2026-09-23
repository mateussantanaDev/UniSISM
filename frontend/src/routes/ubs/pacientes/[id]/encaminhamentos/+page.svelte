<script lang="ts">
	import HistoricoTable from '$lib/presentation/components/HistoricoTable.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	import { api } from '$lib/api';
	import type { Encaminhamento } from '$lib/domain/models/Encaminhamento';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const ctx = usePaciente();
	const auth = useAuth();
	let p = $derived(ctx.paciente!);

	let doPaciente = $state<Encaminhamento[]>([]);
	let carregando = $state(true);

	onMount(async () => {
		try {
			doPaciente = await api.encaminhamentos.list({ pacienteId: p.id, limit: 500 });
		} finally {
			carregando = false;
		}
	});

	let ativos = $derived(
		doPaciente.filter(
			(e) => e.status === 'AGUARDANDO_REGULACAO' || e.status === 'PENDENCIA_DOCUMENTO'
		).length
	);
	let aprovados = $derived(doPaciente.filter((e) => e.status === 'APROVADO').length);
	let rejeitados = $derived(doPaciente.filter((e) => e.status === 'REJEITADO').length);
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Total Histórico"
			value={carregando ? '—' : doPaciente.length}
			sublabel="Encaminhamentos do paciente"
		/>
		<MetricCard
			label="Ativos na Fila"
			value={carregando ? '—' : ativos}
			sublabel="Aguardando / com pendência"
			accent="warning"
		/>
		<MetricCard
			label="Aprovados"
			value={carregando ? '—' : aprovados}
			sublabel="Pela regulação"
			accent="success"
		/>
		<MetricCard
			label="Rejeitados"
			value={carregando ? '—' : rejeitados}
			sublabel="Requerem nova análise"
			accent="critical"
		/>
	</section>

	<HistoricoTable
		titulo="Encaminhamentos do Paciente"
		subtitulo="Histórico completo de encaminhamentos vinculados a este prontuário"
		lista={doPaciente}
		{carregando}
	/>

	{#if !carregando && doPaciente.length === 0}
		<div class="border border-slate-200 bg-white p-8 text-center">
			<div class="font-mono text-xs font-bold tracking-widest text-slate-600 uppercase">
				Nenhum encaminhamento registrado
			</div>
			<p class="mt-2 text-xs text-slate-500">
				Este paciente ainda não possui encaminhamentos feitos pela UBS.
			</p>
			{#if auth.podeConsolidarEncaminhamento}
				<div class="mt-4">
					<PrimaryButton
						label="Criar Novo Encaminhamento"
						onclick={() => goto('/ubs/novo-encaminhamento')}
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>
