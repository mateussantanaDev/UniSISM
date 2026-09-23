<script lang="ts">
	import PrimaryButton from './PrimaryButton.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento } from '$lib/api/types';

	interface Props {
		encaminhamento: Encaminhamento;
		onCancel: () => void;
		onRegistrado: (atualizado: Encaminhamento) => void;
	}

	let { encaminhamento, onCancel, onRegistrado }: Props = $props();

	let observacao = $state('');
	let enviando = $state(false);
	let erro = $state('');

	async function enviar() {
		erro = '';
		if (!observacao.trim()) {
			erro = 'A observação é obrigatória — descreva a correção necessária.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.encaminhamentos.registrarPendencia(encaminhamento.id, {
				observacao: observacao.trim()
			});
			onRegistrado(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO':
						erro = 'Este encaminhamento não está mais em análise.';
						break;
					case 'OBSERVACAO_OBRIGATORIA':
						erro = 'A observação é obrigatória.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não tem permissão para registrar pendências.';
						break;
					default:
						erro = e.message || 'Falha ao registrar pendência.';
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

	<!-- Observação -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Descrição da Pendência
			</h3>
		</div>
		<div class="mb-2 border-l-4 border-amber-600 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
			A observação aparecerá em destaque na tela do atendente da UBS. Seja específico sobre qual
			documento/dado precisa ser corrigido ou complementado.
		</div>
		<textarea
			rows="6"
			bind:value={observacao}
			placeholder="Ex.: Anexar laudo médico com data inferior a 90 dias. O laudo atual está desatualizado (datado de 12/2024). Reenviar após correção."
			class="w-full resize-none border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
		></textarea>
	</section>

	<!-- Consequências -->
	<section class="border border-slate-200 bg-slate-50 p-3">
		<div class="mb-1.5 text-[10px] font-bold tracking-widest text-slate-600 uppercase">
			O que acontece ao registrar
		</div>
		<ul class="space-y-1 text-[11px] text-slate-700">
			<li class="flex gap-2">
				<span class="font-bold text-amber-700">◐</span>
				<span>Status mudará para <strong>PENDÊNCIA DE DOCUMENTO</strong></span>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-amber-700">◐</span>
				<span
					>Observação vira <code class="px-1 text-slate-900">observacoesRegulacao</code> visível na UBS</span
				>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-amber-700">◐</span>
				<span>Evento PENDÊNCIA_REGISTRADA entra na linha do tempo</span>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-amber-700">◐</span>
				<span>UBS de origem é notificada para readequação</span>
			</li>
		</ul>
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
			label="Registrar Pendência"
			onclick={enviar}
			loading={enviando}
			disabled={!observacao.trim()}
		/>
	</div>
</div>
