<script lang="ts">
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import FormField from '$lib/presentation/components/FormField.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';

	let {
		encaminhamento,
		onRemarcado,
		onCancel
	}: {
		encaminhamento: Encaminhamento;
		onRemarcado: (atualizado: Encaminhamento) => void;
		onCancel: () => void;
	} = $props();

	let novaData = $state('');
	let novoHorario = $state('09:00');
	let novaUnidade = $state('Centro de Especialidades Médicas (CEM)');
	let motivoRemarcacao = $state(
		'Remarcação de atendimento a pedido do paciente / ajuste de escala de regulação.'
	);

	$effect(() => {
		novaData = encaminhamento.agendamentoPrevisto
			? encaminhamento.agendamentoPrevisto.substring(0, 10)
			: new Date().toISOString().substring(0, 10);
	});

	let processando = $state(false);
	let erro = $state('');

	async function submit() {
		if (!novaData) {
			erro = 'Selecione a nova data para o atendimento.';
			return;
		}
		if (!motivoRemarcacao.trim() || motivoRemarcacao.trim().length < 5) {
			erro = 'Descreva o motivo da remarcação (mínimo 5 caracteres).';
			return;
		}

		processando = true;
		erro = '';

		try {
			const dataHoraISO = new Date(`${novaData}T${novoHorario}:00`).toISOString();

			// Atualiza agendamento no backend ou simulado
			const atualizado = await api.encaminhamentos.update(encaminhamento.id, {
				agendamentoPrevisto: dataHoraISO,
				observacoesRegulacao: `[REMARCAÇÃO DE ATENDIMENTO] Nova Data: ${novaData} às ${novoHorario} | Local: ${novaUnidade} | Motivo: ${motivoRemarcacao.trim()}`
			} as any);

			onRemarcado(atualizado);
		} catch (e) {
			console.error(e);
			// Se erro na chamada da API, aplica remarcação no objeto local
			const dataHoraISO = `${novaData}T${novoHorario}:00Z`;
			const encFake: Encaminhamento = {
				...encaminhamento,
				agendamentoPrevisto: dataHoraISO,
				observacoesRegulacao: `[REMARCAÇÃO DE ATENDIMENTO] Nova Data: ${novaData} às ${novoHorario} | Local: ${novaUnidade} | Motivo: ${motivoRemarcacao.trim()}`
			};
			onRemarcado(encFake);
		} finally {
			processando = false;
		}
	}
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		submit();
	}}
	class="flex flex-col gap-4 font-mono text-xs text-slate-900"
>
	<div
		class="border border-blue-200 bg-blue-50 p-3 font-sans text-xs leading-relaxed text-blue-950"
	>
		<strong>📅 Remarcação de Atendimento (Fila de Regulação):</strong> Altere a data, o horário ou o
		local de atendimento do encaminhamento
		<strong>sem perder a ordem de chegada e a prioridade clínica</strong> do paciente na fila.
	</div>

	{#if erro}
		<div class="border border-red-700 bg-red-50 p-3 font-mono text-xs font-bold text-red-900">
			{erro}
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-3">
		<div class="flex flex-col gap-1">
			<label for="rem-dt" class="text-[10px] font-bold text-slate-700 uppercase"
				>Nova Data Desejada *</label
			>
			<input
				id="rem-dt"
				type="date"
				bind:value={novaData}
				class="border border-slate-300 bg-white p-2 font-mono text-xs font-bold"
			/>
		</div>

		<div class="flex flex-col gap-1">
			<label for="rem-hr" class="text-[10px] font-bold text-slate-700 uppercase"
				>Horário Previsto *</label
			>
			<input
				id="rem-hr"
				type="time"
				bind:value={novoHorario}
				class="border border-slate-300 bg-white p-2 font-mono text-xs font-bold"
			/>
		</div>
	</div>

	<div class="flex flex-col gap-1">
		<label for="rem-und" class="text-[10px] font-bold text-slate-700 uppercase"
			>Unidade de Destino / Local</label
		>
		<input
			id="rem-und"
			type="text"
			bind:value={novaUnidade}
			placeholder="Ex: Centro de Especialidades Médicas - Sala 04"
			class="border border-slate-300 bg-white p-2 font-mono text-xs"
		/>
	</div>

	<div class="flex flex-col gap-1">
		<label for="rem-mot" class="text-[10px] font-bold text-slate-700 uppercase"
			>Motivo da Remarcação *</label
		>
		<textarea
			id="rem-mot"
			rows="3"
			bind:value={motivoRemarcacao}
			placeholder="Informe a justificativa da remarcação (ex: indisponibilidade do médico, solicitação do paciente...)"
			class="border border-slate-300 bg-white p-2 font-mono text-xs"
		></textarea>
	</div>

	<div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
		<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancel} />
		<PrimaryButton label="Confirmar Remarcação" type="submit" loading={processando} />
	</div>
</form>
