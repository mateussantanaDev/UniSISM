<script lang="ts">
	import { untrack } from 'svelte';
	import FormField from '../FormField.svelte';
	import PrimaryButton from '../PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { PacienteCompleto, TipoAtendimento } from '$lib/api/types';

	interface Props {
		pacienteId: string;
		unidadePadrao?: string;
		onCancel: () => void;
		onSalvo: (atualizado: PacienteCompleto) => void;
	}

	let { pacienteId, unidadePadrao = '', onCancel, onSalvo }: Props = $props();

	function agoraIso() {
		// YYYY-MM-DDTHH:mm (sem timezone, localtime) — input datetime-local
		const d = new Date();
		const off = d.getTimezoneOffset();
		return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
	}

	let data = $state(agoraIso());
	let tipo = $state<TipoAtendimento>('CONSULTA_MEDICA');
	let profissional = $state('');
	let registroProfissional = $state('');
	let especialidade = $state('');
	let unidade = $state(untrack(() => unidadePadrao));
	let queixaPrincipal = $state('');
	let diagnostico = $state('');
	let cid10 = $state('');
	let conduta = $state('');
	let prescricaoResumo = $state('');

	let enviando = $state(false);
	let erro = $state('');

	const tipoOpcoes: { v: TipoAtendimento; l: string }[] = [
		{ v: 'CONSULTA_MEDICA', l: 'Consulta Médica' },
		{ v: 'ENFERMAGEM', l: 'Enfermagem' },
		{ v: 'VACINACAO', l: 'Vacinação' },
		{ v: 'CURATIVO', l: 'Curativo' },
		{ v: 'ODONTOLOGICO', l: 'Odontológico' },
		{ v: 'PROCEDIMENTO', l: 'Procedimento' },
		{ v: 'ACOLHIMENTO', l: 'Acolhimento' }
	];

	let podeSalvar = $derived(
		profissional.trim().length > 0 &&
			queixaPrincipal.trim().length > 0 &&
			conduta.trim().length > 0 &&
			!enviando
	);

	async function salvar() {
		erro = '';
		if (!podeSalvar) {
			erro = 'Profissional, queixa principal e conduta são obrigatórios.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.pacientes.addAtendimento(pacienteId, {
				data: new Date(data).toISOString(),
				tipo,
				profissional: profissional.trim(),
				registroProfissional: registroProfissional.trim(),
				especialidade: especialidade.trim(),
				unidade: unidade.trim(),
				queixaPrincipal: queixaPrincipal.trim(),
				diagnostico: diagnostico.trim(),
				cid10: cid10.trim().toUpperCase(),
				conduta: conduta.trim(),
				prescricaoResumo: prescricaoResumo.trim() || undefined
			});
			onSalvo(atualizado);
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao registrar atendimento.';
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-4 font-mono text-slate-900">
	<div class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900">
		Registro clínico do atendimento. Aparece no histórico do paciente e conta para produção da UBS.
	</div>

	<!-- Quando / Tipo -->
	<div class="grid grid-cols-12 gap-3">
		<div class="col-span-4 flex flex-col">
			<label
				for="data"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Data e Hora
			</label>
			<input
				id="data"
				type="datetime-local"
				bind:value={data}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			/>
		</div>
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
				{#each tipoOpcoes as o (o.v)}
					<option value={o.v}>{o.l}</option>
				{/each}
			</select>
		</div>
		<FormField
			label="Especialidade"
			name="especialidade"
			span={4}
			placeholder="Ex.: Clínica Geral"
			bind:value={especialidade}
		/>
	</div>

	<!-- Profissional -->
	<div class="grid grid-cols-12 gap-3">
		<FormField
			label="Profissional"
			name="profissional"
			span={6}
			placeholder="Ex.: Dr. João Cardoso"
			bind:value={profissional}
		/>
		<FormField
			label="Registro (CRM/COREN)"
			name="registroProfissional"
			span={3}
			mono
			placeholder="CRM/BA 12345"
			bind:value={registroProfissional}
		/>
		<FormField
			label="Unidade"
			name="unidade"
			span={3}
			placeholder="UBS Central"
			bind:value={unidade}
		/>
	</div>

	<!-- SOAP resumido -->
	<div class="grid grid-cols-12 gap-3">
		<div class="col-span-12 flex flex-col">
			<label
				for="queixa"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Queixa Principal (Subjetivo)
			</label>
			<textarea
				id="queixa"
				bind:value={queixaPrincipal}
				rows="2"
				placeholder="Ex.: dor torácica há 3 dias, pioram ao esforço"
				class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			></textarea>
		</div>
		<FormField
			label="Diagnóstico"
			name="diagnostico"
			span={9}
			placeholder="Ex.: Hipertensão arterial sistêmica"
			bind:value={diagnostico}
		/>
		<FormField
			label="CID-10"
			name="cid10"
			span={3}
			mono
			placeholder="Ex.: I10"
			bind:value={cid10}
		/>
		<div class="col-span-12 flex flex-col">
			<label
				for="conduta"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Conduta (Plano)
			</label>
			<textarea
				id="conduta"
				bind:value={conduta}
				rows="3"
				placeholder="Ex.: orientações, retorno em 30 dias, solicitado MAPA"
				class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			></textarea>
		</div>
		<FormField
			label="Resumo da Prescrição (opcional)"
			name="prescricao"
			span={12}
			placeholder="Ex.: Losartana 50mg 1cp 12/12h · 30 dias"
			bind:value={prescricaoResumo}
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
			label="Registrar Atendimento"
			onclick={salvar}
			loading={enviando}
			disabled={!podeSalvar}
		/>
	</div>
</div>
