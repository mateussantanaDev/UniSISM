<script lang="ts">
	import FormField from '../FormField.svelte';
	import PrimaryButton from '../PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { CriarViagemTfdRequest, PacienteCompleto, StatusViagemTFD } from '$lib/api/types';

	interface Props {
		pacienteId: string;
		onCancel: () => void;
		onSalvo: (atualizado: PacienteCompleto) => void;
	}

	let { pacienteId, onCancel, onSalvo }: Props = $props();

	function hojeYmd() {
		return new Date().toISOString().slice(0, 10);
	}

	let protocolo = $state('');
	let dataIda = $state(hojeYmd());
	let dataVolta = $state(hojeYmd());
	let destino = $state('');
	let unidadeDestino = $state('');
	let motivo = $state('');
	let especialidade = $state('');
	let acompanhante = $state(false);
	let transporte = $state<CriarViagemTfdRequest['transporte']>('VAN_SMS');
	let status = $state<StatusViagemTFD>('AGENDADA');
	let custoEstimadoBRL = $state<number>(0);

	let enviando = $state(false);
	let erro = $state('');

	let podeSalvar = $derived(
		protocolo.trim().length > 0 &&
			destino.trim().length > 0 &&
			motivo.trim().length > 0 &&
			especialidade.trim().length > 0 &&
			!enviando
	);

	async function salvar() {
		erro = '';
		if (!podeSalvar) {
			erro = 'Protocolo, destino, motivo e especialidade são obrigatórios.';
			return;
		}
		if (new Date(dataVolta) < new Date(dataIda)) {
			erro = 'Data de volta não pode ser anterior à ida.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.pacientes.addViagemTfd(pacienteId, {
				protocolo: protocolo.trim(),
				dataIda,
				dataVolta,
				destino: destino.trim(),
				unidadeDestino: unidadeDestino.trim(),
				motivo: motivo.trim(),
				especialidade: especialidade.trim(),
				acompanhante,
				transporte,
				status,
				custoEstimadoBRL: Number(custoEstimadoBRL) || 0
			});
			onSalvo(atualizado);
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao registrar viagem.';
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-4 font-mono text-slate-900">
	<div class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900">
		TFD · Tratamento Fora do Domicílio. Viagem custeada pela SMS. Registro cria linha no orçamento
		municipal e aparece no relatório de custos.
	</div>

	<div class="grid grid-cols-12 gap-3">
		<FormField
			label="Protocolo"
			name="protocolo"
			span={4}
			mono
			placeholder="TFD-2026-000123"
			bind:value={protocolo}
		/>
		<FormField
			label="Especialidade"
			name="especialidade"
			span={4}
			placeholder="Ex.: Cardiologia"
			bind:value={especialidade}
		/>
		<div class="col-span-4 flex flex-col">
			<label
				for="status"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Status
			</label>
			<select
				id="status"
				bind:value={status}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			>
				<option value="AGENDADA">Agendada</option>
				<option value="EM_ANDAMENTO">Em andamento</option>
				<option value="REALIZADA">Realizada</option>
				<option value="CANCELADA">Cancelada</option>
			</select>
		</div>

		<FormField
			label="Destino (cidade/estado)"
			name="destino"
			span={6}
			placeholder="Ex.: Salvador/BA"
			bind:value={destino}
		/>
		<FormField
			label="Unidade Destino"
			name="unidadeDestino"
			span={6}
			placeholder="Ex.: Hospital Ana Nery"
			bind:value={unidadeDestino}
		/>

		<FormField label="Data Ida" name="dataIda" type="date" span={3} mono bind:value={dataIda} />
		<FormField
			label="Data Volta"
			name="dataVolta"
			type="date"
			span={3}
			mono
			bind:value={dataVolta}
		/>
		<div class="col-span-3 flex flex-col">
			<label
				for="transporte"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Transporte
			</label>
			<select
				id="transporte"
				bind:value={transporte}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			>
				<option value="VAN_SMS">Van SMS</option>
				<option value="AMBULANCIA">Ambulância</option>
				<option value="PASSAGEM_RODOVIARIA">Passagem Rodoviária</option>
				<option value="PASSAGEM_AEREA">Passagem Aérea</option>
			</select>
		</div>
		<div class="col-span-3 flex flex-col">
			<label
				for="custo"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Custo Estimado (R$)
			</label>
			<input
				id="custo"
				type="number"
				min="0"
				step="0.01"
				bind:value={custoEstimadoBRL}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			/>
		</div>

		<div class="col-span-12 flex flex-col">
			<label
				for="motivo"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Motivo
			</label>
			<textarea
				id="motivo"
				bind:value={motivo}
				rows="2"
				placeholder="Ex.: consulta especializada em cardiologia, procedimento cirúrgico..."
				class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			></textarea>
		</div>

		<label
			class="col-span-12 flex cursor-pointer items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700"
		>
			<input
				type="checkbox"
				bind:checked={acompanhante}
				class="h-4 w-4 border-slate-300 text-blue-900 focus:ring-blue-900"
			/>
			<span class="font-mono tracking-wider uppercase"> Paciente viajará com acompanhante </span>
		</label>
	</div>

	{#if erro}
		<div
			class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
		>
			⚠ {erro}
		</div>
	{/if}

	<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
		<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancel} />
		<PrimaryButton
			label="Registrar Viagem TFD"
			onclick={salvar}
			loading={enviando}
			disabled={!podeSalvar}
		/>
	</div>
</div>
