<script lang="ts">
	import PrimaryButton from './PrimaryButton.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';

	interface Props {
		encaminhamento: Encaminhamento;
		onCancel: () => void;
		onRejeitado: (atualizado: Encaminhamento) => void;
	}

	let { encaminhamento, onCancel, onRejeitado }: Props = $props();

	let motivo = $state('');
	let confirmado = $state(false);
	let enviando = $state(false);
	let erro = $state('');

	async function enviar() {
		erro = '';
		if (!motivo.trim()) {
			erro = 'O motivo da rejeição é obrigatório.';
			return;
		}
		if (!confirmado) {
			erro = 'Marque a confirmação — a rejeição é definitiva.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.encaminhamentos.rejeitar(encaminhamento.id, {
				motivo: motivo.trim()
			});
			onRejeitado(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO':
						erro = 'Este encaminhamento não está mais em análise.';
						break;
					case 'MOTIVO_OBRIGATORIO':
						erro = 'O motivo da rejeição é obrigatório.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não tem permissão para rejeitar encaminhamentos.';
						break;
					default:
						erro = e.message || 'Falha ao rejeitar encaminhamento.';
				}
			} else {
				erro = 'Falha de conexão com o servidor.';
			}
		} finally {
			enviando = false;
		}
	}
</script>

<div class="flex flex-col gap-5 font-mono text-slate-900">
	<!-- Aviso crítico -->
	<section class="border-2 border-red-700 bg-red-50 p-3">
		<div class="text-[10px] font-bold tracking-widest text-red-800 uppercase">
			⚠ Ação Definitiva
		</div>
		<p class="mt-1 text-xs text-red-900">
			A rejeição encerra o encaminhamento. Para correções pontuais, prefira <strong
				>Solicitar Correção</strong
			> (registra pendência e permite reenvio pela UBS).
		</p>
	</section>

	<!-- Resumo -->
	<section class="border border-slate-200 bg-slate-50 p-3">
		<div class="mb-1.5 flex items-center justify-between">
			<span class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Encaminhamento em análise
			</span>
			<StatusBadge status={encaminhamento.status} />
		</div>
		<div class="text-sm font-bold text-blue-900">{encaminhamento.protocolo}</div>
		<div class="font-sans text-xs font-semibold text-slate-900">
			{encaminhamento.paciente.nome}
		</div>
		<div class="text-[11px] text-slate-700">
			{encaminhamento.solicitacao.especialidadeSolicitada} · CID {encaminhamento.solicitacao.cid10}
		</div>
	</section>

	<!-- Motivo -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Motivo da Rejeição
			</h3>
		</div>
		<textarea
			rows="5"
			bind:value={motivo}
			placeholder="Ex.: Paciente não atende aos critérios de protocolo para a especialidade. Indicar tratamento conservador na atenção básica."
			class="w-full resize-none border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700"
		></textarea>
	</section>

	<!-- Confirmação -->
	<section>
		<label class="flex items-start gap-2 border border-slate-200 bg-slate-50 px-3 py-2">
			<input
				type="checkbox"
				bind:checked={confirmado}
				class="mt-0.5 h-3.5 w-3.5 border-slate-300 text-red-700 focus:ring-red-700"
			/>
			<span class="text-[11px] text-slate-700">
				Confirmo que esta é uma rejeição <strong class="text-red-700">definitiva</strong> e que a UBS
				de origem será notificada. Li o motivo acima.
			</span>
		</label>
	</section>

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
			label="Rejeitar Definitivamente"
			variant="danger"
			onclick={enviar}
			loading={enviando}
			disabled={!motivo.trim() || !confirmado}
		/>
	</div>
</div>
