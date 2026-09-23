<script lang="ts">
	import { untrack } from 'svelte';
	import FormField from '../FormField.svelte';
	import PrimaryButton from '../PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { CriarVacinaRequest, PacienteCompleto } from '$lib/api/types';

	interface Props {
		pacienteId: string;
		unidadePadrao?: string;
		onCancel: () => void;
		onSalvo: (atualizado: PacienteCompleto) => void;
	}

	let { pacienteId, unidadePadrao = '', onCancel, onSalvo }: Props = $props();

	function hojeYmd() {
		return new Date().toISOString().slice(0, 10);
	}

	let data = $state(hojeYmd());
	let vacina = $state('');
	let dose = $state('');
	let lote = $state('');
	let aplicador = $state('');
	let unidade = $state(untrack(() => unidadePadrao));
	let via = $state<CriarVacinaRequest['via']>('INTRAMUSCULAR');

	let enviando = $state(false);
	let erro = $state('');

	let podeSalvar = $derived(
		vacina.trim().length > 0 &&
			dose.trim().length > 0 &&
			lote.trim().length > 0 &&
			aplicador.trim().length > 0 &&
			!enviando
	);

	async function salvar() {
		erro = '';
		if (!podeSalvar) {
			erro = 'Vacina, dose, lote e aplicador são obrigatórios.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.pacientes.addVacina(pacienteId, {
				data,
				vacina: vacina.trim(),
				dose: dose.trim(),
				lote: lote.trim(),
				aplicador: aplicador.trim(),
				unidade: unidade.trim(),
				via
			});
			onSalvo(atualizado);
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao registrar vacina.';
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-4 font-mono text-slate-900">
	<div
		class="border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2 font-sans text-[12px] text-emerald-900"
	>
		Registro de dose aplicada na sala de vacina. Conta na caderneta digital do paciente e em
		indicadores de cobertura vacinal da UBS.
	</div>

	<div class="grid grid-cols-12 gap-3">
		<FormField label="Data da Aplicação" name="data" type="date" span={3} mono bind:value={data} />
		<FormField
			label="Vacina"
			name="vacina"
			span={6}
			placeholder="Ex.: Pfizer COVID-19"
			bind:value={vacina}
		/>
		<FormField
			label="Dose"
			name="dose"
			span={3}
			placeholder="Ex.: 1ª · Reforço"
			bind:value={dose}
		/>
		<FormField
			label="Lote"
			name="lote"
			span={4}
			mono
			placeholder="Ex.: FL-0872"
			bind:value={lote}
		/>
		<div class="col-span-4 flex flex-col">
			<label
				for="via"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Via de Aplicação
			</label>
			<select
				id="via"
				bind:value={via}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			>
				<option value="INTRAMUSCULAR">Intramuscular (IM)</option>
				<option value="SUBCUTANEA">Subcutânea (SC)</option>
				<option value="ORAL">Oral (VO)</option>
				<option value="INTRADERMICA">Intradérmica (ID)</option>
			</select>
		</div>
		<FormField
			label="Unidade"
			name="unidade"
			span={4}
			placeholder="UBS Central"
			bind:value={unidade}
		/>
		<FormField
			label="Aplicador"
			name="aplicador"
			span={12}
			placeholder="Ex.: Enf. Ana Clara · COREN/BA 012345"
			bind:value={aplicador}
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
			label="Registrar Aplicação"
			onclick={salvar}
			loading={enviando}
			disabled={!podeSalvar}
		/>
	</div>
</div>
