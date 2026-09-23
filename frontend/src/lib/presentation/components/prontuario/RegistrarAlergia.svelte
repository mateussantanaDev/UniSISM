<script lang="ts">
	import FormField from '../FormField.svelte';
	import PrimaryButton from '../PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { CriarAlergiaRequest, PacienteCompleto } from '$lib/api/types';

	interface Props {
		pacienteId: string;
		onCancel: () => void;
		onSalvo: (atualizado: PacienteCompleto) => void;
	}

	let { pacienteId, onCancel, onSalvo }: Props = $props();

	let substancia = $state('');
	let tipo = $state<CriarAlergiaRequest['tipo']>('MEDICAMENTO');
	let gravidade = $state<CriarAlergiaRequest['gravidade']>('MODERADA');
	let observacao = $state('');
	let enviando = $state(false);
	let erro = $state('');

	let podeSalvar = $derived(substancia.trim().length > 0 && !enviando);

	async function salvar() {
		erro = '';
		if (!substancia.trim()) {
			erro = 'Informe a substância.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.pacientes.addAlergia(pacienteId, {
				substancia: substancia.trim(),
				tipo,
				gravidade,
				observacao: observacao.trim() || undefined
			});
			onSalvo(atualizado);
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao registrar alergia.';
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-4 font-mono text-slate-900">
	<div class="border-l-4 border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-900">
		Alergias marcam o prontuário com alerta vermelho. Médicos e enfermeiros verão essa informação
		antes de qualquer prescrição.
	</div>

	<div class="grid grid-cols-12 gap-3">
		<FormField
			label="Substância"
			name="substancia"
			span={12}
			placeholder="Ex.: Dipirona, Amoxicilina, Amendoim..."
			bind:value={substancia}
		/>
		<div class="col-span-4 flex flex-col">
			<label
				for="tipo"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Tipo
			</label>
			<select
				id="tipo"
				bind:value={tipo}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			>
				<option value="MEDICAMENTO">Medicamento</option>
				<option value="ALIMENTO">Alimento</option>
				<option value="AMBIENTAL">Ambiental</option>
				<option value="OUTRO">Outro</option>
			</select>
		</div>
		<div class="col-span-4 flex flex-col">
			<label
				for="gravidade"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Gravidade
			</label>
			<select
				id="gravidade"
				bind:value={gravidade}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			>
				<option value="LEVE">Leve</option>
				<option value="MODERADA">Moderada</option>
				<option value="GRAVE">Grave</option>
			</select>
		</div>
		<FormField
			label="Observação (opcional)"
			name="observacao"
			span={12}
			placeholder="Ex.: causa urticária e edema de glote"
			bind:value={observacao}
		/>
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
			label="Registrar Alergia"
			variant="danger"
			onclick={salvar}
			loading={enviando}
			disabled={!podeSalvar}
		/>
	</div>
</div>
