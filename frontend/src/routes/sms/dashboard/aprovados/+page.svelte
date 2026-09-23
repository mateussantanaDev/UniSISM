<script lang="ts">
	import HistoricoTable from '$lib/presentation/components/HistoricoTable.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { api } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';
	import { onMount } from 'svelte';

	/**
	 * Aprovados pela Regulação — encaminhamentos com status APROVADO.
	 * São casos que seguiram para a rede especializada.
	 */

	let aprovados = $state<Encaminhamento[]>([]);
	let carregando = $state(true);

	onMount(async () => {
		try {
			aprovados = await api.encaminhamentos.list({ status: 'APROVADO', limit: 500 });
		} finally {
			carregando = false;
		}
	});

	/** Aprovados nos últimos 7 dias. */
	let ultimaSemana = $derived(
		aprovados.filter((e) => {
			const dias = (Date.now() - new Date(e.atualizadoEm).getTime()) / 86_400_000;
			return dias <= 7;
		}).length
	);

	/** Aprovados hoje. */
	let hoje = $derived(
		aprovados.filter((e) => {
			const d = new Date(e.atualizadoEm);
			const agora = new Date();
			return (
				d.getFullYear() === agora.getFullYear() &&
				d.getMonth() === agora.getMonth() &&
				d.getDate() === agora.getDate()
			);
		}).length
	);

	/** Já com agendamento previsto definido. */
	let comAgendamento = $derived(aprovados.filter((e) => !!e.agendamentoPrevisto).length);
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Total Aprovados"
			value={carregando ? '—' : aprovados.length}
			sublabel="Encaminhados à rede especializada"
			accent="success"
		/>
		<MetricCard
			label="Aprovados Hoje"
			value={carregando ? '—' : hoje}
			sublabel="Decididos nas últimas 24h"
			accent="success"
		/>
		<MetricCard
			label="Última Semana"
			value={carregando ? '—' : ultimaSemana}
			sublabel="Volume dos últimos 7 dias"
		/>
		<MetricCard
			label="Com Agendamento"
			value={carregando ? '—' : comAgendamento}
			sublabel="Data prevista já definida"
		/>
	</section>

	<HistoricoTable
		titulo="Encaminhamentos Aprovados"
		subtitulo="Decisões positivas da Regulação · ordenadas do mais recente ao mais antigo"
		lista={aprovados}
		{carregando}
		mostrarStatus={false}
		detalheBasePath="/sms/encaminhamento"
	/>
</div>
