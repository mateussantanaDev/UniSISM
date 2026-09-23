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

	let cid10 = $state('');
	let descricao = $state('');
	let desde = $state(hojeYmd());
	let observacao = $state('');
	let ativo = $state(true);

	let enviando = $state(false);
	let erro = $state('');

	let podeSalvar = $derived(
		cid10.trim().length > 0 && descricao.trim().length > 0 && desde.length > 0 && !enviando
	);

	async function salvar() {
		erro = '';
		if (!cid10.trim() || !descricao.trim()) {
			erro = 'CID-10 e descrição são obrigatórios.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.pacientes.addCondicaoCronica(pacienteId, {
				cid10: cid10.trim().toUpperCase(),
				descricao: descricao.trim(),
				desde,
				ativo,
				observacao: observacao.trim() || undefined
			});
			onSalvo(atualizado);
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao registrar condição.';
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-4 font-mono text-slate-900">
	<div
		class="border-l-4 border-amber-600 bg-amber-50 px-3 py-2 font-sans text-[12px] text-amber-900"
	>
		Condições crônicas aparecem no painel clínico e contam nos indicadores da UBS. Use CID-10
		oficial (ex.: I10 — Hipertensão, E11 — Diabetes tipo 2).
	</div>

	<div class="grid grid-cols-12 gap-3">
		<FormField
			label="CID-10"
			name="cid10"
			span={3}
			mono
			placeholder="Ex.: I10"
			bind:value={cid10}
		/>
		<FormField
			label="Descrição"
			name="descricao"
			span={9}
			placeholder="Ex.: Hipertensão essencial"
			bind:value={descricao}
		/>
		<FormField label="Diagnosticado em" name="desde" type="date" span={4} mono bind:value={desde} />
		<div class="col-span-8 flex items-end">
			<label class="flex cursor-pointer items-center gap-2 text-[11px] text-slate-700">
				<input
					type="checkbox"
					bind:checked={ativo}
					class="h-4 w-4 border-slate-300 text-blue-900 focus:ring-blue-900"
				/>
				<span class="font-mono tracking-wider uppercase"> Condição ativa (em acompanhamento) </span>
			</label>
		</div>
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
				rows="3"
				placeholder="Ex.: controlada com Losartana 50mg"
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
			label="Registrar Condição"
			onclick={salvar}
			loading={enviando}
			disabled={!podeSalvar}
		/>
	</div>
</div>
