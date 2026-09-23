<script lang="ts">
	import FormField from '../FormField.svelte';
	import PrimaryButton from '../PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { CriarExameRequest, PacienteCompleto, ResultadoExame } from '$lib/api/types';

	interface Props {
		pacienteId: string;
		onCancel: () => void;
		onSalvo: (atualizado: PacienteCompleto) => void;
	}

	let { pacienteId, onCancel, onSalvo }: Props = $props();

	function hojeYmd() {
		return new Date().toISOString().slice(0, 10);
	}

	let data = $state(hojeYmd());
	let tipo = $state('');
	let categoria = $state<CriarExameRequest['categoria']>('LABORATORIAL');
	let solicitante = $state('');
	let unidadeExecutora = $state('');
	let resultado = $state<ResultadoExame>('PENDENTE');
	let observacao = $state('');

	let enviando = $state(false);
	let erro = $state('');

	let podeSalvar = $derived(tipo.trim().length > 0 && solicitante.trim().length > 0 && !enviando);

	async function salvar() {
		erro = '';
		if (!podeSalvar) {
			erro = 'Tipo e solicitante são obrigatórios.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.pacientes.addExame(pacienteId, {
				data,
				tipo: tipo.trim(),
				categoria,
				solicitante: solicitante.trim(),
				unidadeExecutora: unidadeExecutora.trim(),
				resultado,
				observacao: observacao.trim() || undefined
			});
			onSalvo(atualizado);
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao registrar exame.';
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-4 font-mono text-slate-900">
	<div class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900">
		Registro de exame realizado. Upload do laudo (PDF) poderá ser adicionado depois via tela de
		anexos do exame.
	</div>

	<div class="grid grid-cols-12 gap-3">
		<FormField label="Data da Realização" name="data" type="date" span={3} mono bind:value={data} />
		<FormField
			label="Tipo / Nome do Exame"
			name="tipo"
			span={9}
			placeholder="Ex.: Hemograma completo"
			bind:value={tipo}
		/>
		<div class="col-span-4 flex flex-col">
			<label
				for="categoria"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Categoria
			</label>
			<select
				id="categoria"
				bind:value={categoria}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			>
				<option value="LABORATORIAL">Laboratorial</option>
				<option value="IMAGEM">Imagem</option>
				<option value="FUNCIONAL">Funcional</option>
				<option value="OUTROS">Outros</option>
			</select>
		</div>
		<div class="col-span-4 flex flex-col">
			<label
				for="resultado"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Resultado
			</label>
			<select
				id="resultado"
				bind:value={resultado}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			>
				<option value="PENDENTE">Pendente</option>
				<option value="NORMAL">Normal</option>
				<option value="ALTERADO">Alterado</option>
				<option value="CRITICO">Crítico</option>
			</select>
		</div>
		<FormField
			label="Solicitante"
			name="solicitante"
			span={4}
			placeholder="Ex.: Dr. João"
			bind:value={solicitante}
		/>
		<FormField
			label="Unidade Executora"
			name="unidadeExecutora"
			span={12}
			placeholder="Ex.: Laboratório Municipal"
			bind:value={unidadeExecutora}
		/>
		<div class="col-span-12 flex flex-col">
			<label
				for="observacao"
				class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
			>
				Observação (opcional)
			</label>
			<textarea
				id="observacao"
				bind:value={observacao}
				rows="2"
				placeholder="Ex.: resultado abaixo do valor de referência"
				class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
			></textarea>
		</div>
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
			label="Registrar Exame"
			onclick={salvar}
			loading={enviando}
			disabled={!podeSalvar}
		/>
	</div>
</div>
