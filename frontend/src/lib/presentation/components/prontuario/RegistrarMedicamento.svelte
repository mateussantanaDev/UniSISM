<script lang="ts">
	import FormField from '../FormField.svelte';
	import PrimaryButton from '../PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { PacienteCompleto } from '$lib/api/types';

	interface Props {
		pacienteId: string;
		onCancel: () => void;
		onSalvo: (atualizado: PacienteCompleto) => void;
	}

	let { pacienteId, onCancel, onSalvo }: Props = $props();

	function hojeYmd() {
		return new Date().toISOString().slice(0, 10);
	}

	let nome = $state('');
	let dosagem = $state('');
	let frequencia = $state('');
	let prescritor = $state('');
	let desde = $state(hojeYmd());

	let enviando = $state(false);
	let erro = $state('');

	let podeSalvar = $derived(
		nome.trim().length > 0 &&
			dosagem.trim().length > 0 &&
			frequencia.trim().length > 0 &&
			prescritor.trim().length > 0 &&
			!enviando
	);

	async function salvar() {
		erro = '';
		if (!podeSalvar) {
			erro = 'Preencha nome, dosagem, posologia e prescritor.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.pacientes.addMedicamento(pacienteId, {
				nome: nome.trim(),
				dosagem: dosagem.trim(),
				frequencia: frequencia.trim(),
				prescritor: prescritor.trim(),
				desde,
				ativo: true
			});
			onSalvo(atualizado);
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao registrar medicamento.';
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-4 font-mono text-slate-900">
	<div
		class="border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2 font-sans text-[12px] text-emerald-900"
	>
		Medicamentos de uso contínuo. Registro aparece no prontuário para verificação de interações em
		futuras prescrições.
	</div>

	<div class="grid grid-cols-12 gap-3">
		<FormField
			label="Medicamento"
			name="nome"
			span={8}
			placeholder="Ex.: Losartana potássica"
			bind:value={nome}
		/>
		<FormField
			label="Dosagem"
			name="dosagem"
			span={4}
			placeholder="Ex.: 50 mg"
			bind:value={dosagem}
		/>
		<FormField
			label="Posologia"
			name="frequencia"
			span={6}
			placeholder="Ex.: 1 comp. de 12/12h"
			bind:value={frequencia}
		/>
		<FormField
			label="Prescritor"
			name="prescritor"
			span={6}
			placeholder="Ex.: Dr. João Cardoso · CRM/BA 12345"
			bind:value={prescritor}
		/>
		<FormField label="Início do Uso" name="desde" type="date" span={4} mono bind:value={desde} />
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
			label="Registrar Medicamento"
			onclick={salvar}
			loading={enviando}
			disabled={!podeSalvar}
		/>
	</div>
</div>
