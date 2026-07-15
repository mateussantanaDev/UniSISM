<script lang="ts">
	import PrimaryButton from './PrimaryButton.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento, FilaDestino } from '$lib/api/types';

	interface Props {
		encaminhamento: Encaminhamento;
		onCancel: () => void;
		onAprovado: (atualizado: Encaminhamento) => void;
	}

	let { encaminhamento, onCancel, onAprovado }: Props = $props();

	let nota = $state('');
	let agendamentoPrevisto = $state('');
	let filaDestino = $state<FilaDestino>('SUS');

	$effect(() => {
		const isOdonto = encaminhamento.solicitacao.especialidadeSolicitada?.toUpperCase().includes('ODONTO') || false;
		filaDestino = isOdonto ? 'CEO' : 'SUS';
	});

	let enviando = $state(false);
	let erro = $state('');

	async function enviar() {
		erro = '';
		enviando = true;
		try {
			const atualizado = await api.encaminhamentos.aprovar(encaminhamento.id, {
				nota: nota.trim() || undefined,
				agendamentoPrevisto: filaDestino === 'SUS' ? (agendamentoPrevisto || undefined) : undefined,
				filaDestino
			});
			onAprovado(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO':
						erro = 'Este encaminhamento não está mais aguardando regulação.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não tem permissão para aprovar encaminhamentos.';
						break;
					default:
						erro = e.message || 'Falha ao aprovar encaminhamento.';
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
	<!-- Resumo do encaminhamento -->
	<section class="border border-slate-200 bg-slate-50 p-3">
		<div class="mb-1.5 flex items-center justify-between">
			<span class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Encaminhamento em análise
			</span>
			<StatusBadge status={encaminhamento.status} />
		</div>
		<div class="text-sm font-bold text-blue-900">{encaminhamento.protocolo}</div>
		<div class="text-xs font-sans font-semibold text-slate-900">
			{encaminhamento.paciente.nome}
		</div>
		<div class="text-[11px] text-slate-700">
			{encaminhamento.solicitacao.especialidadeSolicitada} · CID {encaminhamento.solicitacao.cid10}
		</div>
	</section>

	<!-- Destinação da Fila -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Fila de Destino / Regulação
			</h3>
		</div>
		<div class="flex flex-col gap-2">
			<label for="select-fila" class="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">
				Direcionar vaga para:
			</label>
			<select
				id="select-fila"
				bind:value={filaDestino}
				class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-sans"
			>
				<option value="SUS">Fila SUS (Regulação do Estado)</option>
				<option value="CENTRO_ESPECIALIDADES">Centro de Especialidades Municipal</option>
				<option value="CEO">Centro de Especialidades Odontológicas (CEO)</option>
			</select>
			{#if filaDestino === 'CENTRO_ESPECIALIDADES' || filaDestino === 'CEO'}
				<div class="mt-1 text-[10px] tracking-wider text-emerald-800 font-bold uppercase">
					✓ Fluxo Direto: Agendado na fila interna do centro, sem depender de decreto do SUS.
				</div>
			{:else}
				<div class="mt-1 text-[10px] tracking-wider text-slate-500 uppercase">
					Fluxo Tradicional: O encaminhamento aguardará a publicação da vaga na regulação SUS.
				</div>
			{/if}
		</div>
	</section>

	<!-- Agendamento previsto -->
	{#if filaDestino === 'SUS'}
		<section>
			<div class="mb-2 border-b border-slate-200 pb-1.5">
				<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
					Agendamento Previsto
				</h3>
			</div>
			<div class="flex flex-col">
				<label
					for="agendamento"
					class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Data prevista do atendimento especializado
				</label>
				<input
					id="agendamento"
					type="date"
					bind:value={agendamentoPrevisto}
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
				<div class="mt-1 text-[10px] tracking-wider text-slate-500 uppercase">
					Opcional · preenchida pela Regulação quando a data já for conhecida
				</div>
			</div>
		</section>
	{/if}

	<!-- Nota de aprovação -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Nota da Regulação
			</h3>
		</div>
		<textarea
			rows="4"
			bind:value={nota}
			placeholder="Observações para o atendente da UBS (opcional). Ex.: Paciente inserido na fila da Cardiologia · Hospital Ana Nery. Aguardar contato."
			class="w-full resize-none border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
		></textarea>
	</section>

	<!-- Consequências -->
	<section class="border border-slate-200 bg-slate-50 p-3">
		<div class="mb-1.5 text-[10px] font-bold tracking-widest text-slate-600 uppercase">
			O que acontece ao aprovar
		</div>
		<ul class="space-y-1 text-[11px] text-slate-700">
			<li class="flex gap-2">
				<span class="font-bold text-emerald-700">✓</span>
				<span>Status mudará para <strong>APROVADO</strong></span>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-emerald-700">✓</span>
				<span>Evento APROVADO será registrado na linha do tempo</span>
			</li>
			{#if filaDestino === 'SUS' && agendamentoPrevisto}
				<li class="flex gap-2">
					<span class="font-bold text-emerald-700">✓</span>
					<span>Evento AGENDADO será adicionado com a data prevista</span>
				</li>
			{/if}
			<li class="flex gap-2">
				<span class="font-bold text-emerald-700">✓</span>
				<span>UBS de origem será notificada automaticamente</span>
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
		<PrimaryButton label="Confirmar Aprovação" onclick={enviar} loading={enviando} />
	</div>
</div>
