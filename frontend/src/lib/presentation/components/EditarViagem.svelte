<script lang="ts">
	import { untrack } from 'svelte';
	import FormField from './FormField.svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import type { AtualizarViagemRequest, ViagemFrota } from '$lib/api/tfd-types';

	/**
	 * Modal-friendly de edição de Viagem.
	 *
	 * - PATCH `/v1/tfd/viagens/:id` (RBAC: rwGestor).
	 * - Só AGENDADA é editável; backend rejeita EM_ANDAMENTO/CONCLUIDA/CANCELADA.
	 * - Veículo e motorista NÃO se editam aqui — implicam recálculo de saldo
	 *   e alocação. Para trocar veículo, cancele e crie nova viagem.
	 * - Hodômetro inicial/final NÃO se editam aqui — vêm de iniciar/concluir.
	 */
	interface Props {
		viagem: ViagemFrota;
		onCancel: () => void;
		onSaved: (atualizado: ViagemFrota) => void;
	}

	let { viagem, onCancel, onSaved }: Props = $props();

	const orig = untrack(() => ({
		data: viagem.data.slice(0, 10),
		horaSaida: viagem.horaSaida,
		horaPrevistaRetorno: viagem.horaPrevistaRetorno ?? '',
		destino: viagem.destino,
		unidadeDestino: viagem.unidadeDestino ?? '',
		rotaResumo: viagem.rotaResumo ?? '',
		kmEstimados: String(viagem.kmEstimados ?? ''),
		observacoes: viagem.observacoes ?? ''
	}));

	let data = $state(orig.data);
	let horaSaida = $state(orig.horaSaida);
	let horaPrevistaRetorno = $state(orig.horaPrevistaRetorno);
	let destino = $state(orig.destino);
	let unidadeDestino = $state(orig.unidadeDestino);
	let rotaResumo = $state(orig.rotaResumo);
	let kmEstimados = $state(orig.kmEstimados);
	let observacoes = $state(orig.observacoes);

	let enviando = $state(false);
	let erro = $state('');

	function diff(): AtualizarViagemRequest {
		const out: AtualizarViagemRequest = {};
		if (data !== orig.data) out.data = data;
		if (horaSaida !== orig.horaSaida) out.horaSaida = horaSaida;
		if (horaPrevistaRetorno !== orig.horaPrevistaRetorno) {
			out.horaPrevistaRetorno = horaPrevistaRetorno;
		}
		if (destino.trim() !== orig.destino) out.destino = destino.trim();
		if (unidadeDestino.trim() !== orig.unidadeDestino) {
			out.unidadeDestino = unidadeDestino.trim();
		}
		if (rotaResumo.trim() !== orig.rotaResumo) out.rotaResumo = rotaResumo.trim();
		if (kmEstimados.trim() !== orig.kmEstimados) {
			out.kmEstimados = Number(kmEstimados);
		}
		if (observacoes.trim() !== orig.observacoes) out.observacoes = observacoes.trim();
		return out;
	}

	let pendente = $derived(Object.keys(diff()).length);
	let dataOk = $derived(data.length >= 8);
	let horaSaidaOk = $derived(/^\d{2}:\d{2}$/.test(horaSaida));
	let destinoOk = $derived(destino.trim().length >= 3);
	let kmOk = $derived(kmEstimados.trim() === '' || Number(kmEstimados) > 0);

	let podeSalvar = $derived(
		pendente > 0 && !enviando && dataOk && horaSaidaOk && destinoOk && kmOk,
	);

	let viagemTrancada = $derived(viagem.status !== 'AGENDADA');

	async function salvar() {
		erro = '';
		if (viagemTrancada) {
			erro = `Viagens com status ${viagem.status} não podem ser editadas.`;
			return;
		}
		const patch = diff();
		if (Object.keys(patch).length === 0) {
			erro = 'Nenhum campo foi alterado.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.tfd.viagens.update(viagem.id, patch);
			onSaved(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				if (e.code === 'STATUS_INVALIDO') {
					erro = 'A viagem mudou de status — recarregue a página.';
				} else if (e.code === 'NENHUMA_ALTERACAO') {
					erro = 'Nenhuma alteração identificada.';
				} else {
					erro = mensagemErroTfd(e);
				}
			} else {
				erro = mensagemErroTfd(e);
			}
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-5 font-mono text-slate-900">
	{#if viagemTrancada}
		<section
			class="border-l-4 border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-800"
		>
			Status <strong>{viagem.status}</strong> impede edição. Só viagens
			<strong>AGENDADAS</strong> podem ser alteradas.
		</section>
	{:else}
		<section
			class="border-l-4 border-blue-900 bg-blue-50 px-3 py-2 font-sans text-[12px] text-blue-900"
		>
			Veículo e motorista não são editáveis aqui (para trocar, cancele a viagem
			e crie nova). Hodômetro é atualizado por iniciar/concluir.
		</section>
	{/if}

	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Programação
			</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Data" name="data" type="date" span={4} mono bind:value={data} />
			<FormField label="Hora de saída" name="horaSaida" span={4} mono bind:value={horaSaida} placeholder="HH:mm" />
			<FormField
				label="Hora prevista de retorno"
				name="horaPrevistaRetorno"
				span={4}
				mono
				bind:value={horaPrevistaRetorno}
				placeholder="HH:mm"
			/>
		</div>
	</section>

	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Destino & rota
			</h3>
		</div>
		<div class="grid grid-cols-12 gap-3">
			<FormField label="Cidade de destino" name="destino" span={6} bind:value={destino} />
			<FormField
				label="Unidade / local específico"
				name="unidadeDestino"
				span={6}
				bind:value={unidadeDestino}
			/>
			<FormField
				label="Resumo da rota"
				name="rotaResumo"
				span={9}
				bind:value={rotaResumo}
				hint="Ex.: BR-101 → BR-116"
			/>
			<FormField
				label="Km estimados"
				name="kmEstimados"
				type="number"
				span={3}
				mono
				bind:value={kmEstimados}
			/>
		</div>
	</section>

	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Observações
			</h3>
		</div>
		<textarea
			bind:value={observacoes}
			rows={3}
			maxlength={500}
			placeholder="Notas internas, restrições, contatos no destino..."
			class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
		></textarea>
	</section>

	{#if erro}
		<div class="border border-red-700 bg-red-50 px-3 py-2 font-sans text-[12px] text-red-800">
			{erro}
		</div>
	{/if}

	<div class="flex items-center justify-between pt-2">
		<span class="font-sans text-[11px] text-slate-500">
			{pendente === 0 ? 'Nenhum campo alterado' : `${pendente} campo${pendente === 1 ? '' : 's'} alterado${pendente === 1 ? '' : 's'}`}
		</span>
		<div class="flex gap-2">
			<PrimaryButton label="Cancelar" variant="secondary" onclick={onCancel} disabled={enviando} />
			<PrimaryButton
				label={enviando ? 'Salvando...' : 'Salvar alterações'}
				onclick={salvar}
				disabled={!podeSalvar || viagemTrancada}
			/>
		</div>
	</div>
</div>
