<script lang="ts">
	import HistoricoTable from '$lib/presentation/components/HistoricoTable.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import { api } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';
	import { onMount } from 'svelte';

	/**
	 * Fila de Pendências — encaminhamentos com PENDENCIA_DOCUMENTO.
	 * São casos em que a Regulação já identificou algo a corrigir e aguarda
	 * que a UBS reenvie. O regulador acompanha aqui o SLA de resolução.
	 */

	let pendencias = $state<Encaminhamento[]>([]);
	let carregando = $state(true);

	onMount(async () => {
		try {
			pendencias = await api.encaminhamentos.list({
				status: 'PENDENCIA_DOCUMENTO',
				limit: 500
			});
		} finally {
			carregando = false;
		}
	});

	/** Quantas já passaram de 48h aguardando readequação. */
	let estouradas = $derived(
		pendencias.filter((e) => {
			const horas = (Date.now() - new Date(e.atualizadoEm).getTime()) / 36e5;
			return horas > 48;
		}).length
	);

	let urgentes = $derived(
		pendencias.filter(
			(e) => e.solicitacao.prioridade === 'URGENTE' || e.solicitacao.prioridade === 'EMERGENCIA'
		).length
	);
</script>

<div class="flex flex-col gap-4">
	<section class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<MetricCard
			label="Total em Pendência"
			value={carregando ? '—' : pendencias.length}
			sublabel="Aguardando readequação da UBS"
			accent="warning"
		/>
		<MetricCard
			label="SLA Estourado"
			value={carregando ? '—' : estouradas}
			sublabel="> 48h sem resposta da UBS"
			accent="critical"
		/>
		<MetricCard
			label="Prioridade Urgente"
			value={carregando ? '—' : urgentes}
			sublabel="Casos urgentes / emergência"
			accent="critical"
		/>
		<MetricCard
			label="Taxa de Readequação"
			value="—"
			sublabel="Pendências resolvidas / registradas (mês)"
		/>
	</section>

	<HistoricoTable
		titulo="Encaminhamentos com Pendência"
		subtitulo="Aguardando correção da UBS · ordenados do mais antigo ao mais recente"
		lista={pendencias}
		{carregando}
		mostrarStatus={false}
		detalheBasePath="/sms/encaminhamento"
	/>
</div>
