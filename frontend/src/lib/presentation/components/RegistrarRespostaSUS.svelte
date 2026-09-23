<script lang="ts">
	import Dropzone from './Dropzone.svelte';
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

	let pdfFile = $state<File[]>([]);
	let observacao = $state('');
	let enviando = $state(false);
	let erro = $state('');

	function handleArquivo(files: File[]) {
		// Aceita apenas 1 PDF.
		pdfFile = [files[0]];
	}

	async function enviar() {
		erro = '';
		if (pdfFile.length === 0) {
			erro = 'Anexe o PDF de resposta oficial do SUS.';
			return;
		}
		if (!observacao.trim()) {
			erro = 'A observação é obrigatória — resuma o teor da resposta recebida.';
			return;
		}
		enviando = true;
		try {
			const atualizado = await api.encaminhamentos.registrarRespostaSus(
				encaminhamento.id,
				pdfFile[0],
				observacao.trim()
			);
			onRegistrado(atualizado);
		} catch (e) {
			if (e instanceof ApiError) {
				switch (e.code) {
					case 'ENCAMINHAMENTO_NAO_APROVADO':
						erro = 'Este encaminhamento não está no status APROVADO.';
						break;
					case 'RESPOSTA_SUS_JA_REGISTRADA':
						erro = 'Uma resposta do SUS já foi registrada para este encaminhamento.';
						break;
					case 'PDF_RESPOSTA_OBRIGATORIO':
						erro = 'O PDF de resposta é obrigatório.';
						break;
					case 'ARQUIVO_MUITO_GRANDE':
						erro = 'PDF acima do limite permitido (10 MB).';
						break;
					case 'MIME_NAO_SUPORTADO':
						erro = 'Apenas arquivos PDF são aceitos.';
						break;
					case 'PERMISSAO_INSUFICIENTE':
						erro = 'Você não tem permissão para registrar resposta do SUS.';
						break;
					default:
						erro = e.message || 'Falha ao registrar resposta do SUS.';
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
				Encaminhamento aprovado · aguardando retorno
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
		{#if encaminhamento.agendamentoPrevisto}
			<div
				class="mt-1.5 border-l-4 border-emerald-700 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900"
			>
				Agendamento previsto: <strong
					>{new Date(encaminhamento.agendamentoPrevisto).toLocaleDateString('pt-BR')}</strong
				>
			</div>
		{/if}
	</section>

	<!-- Upload do PDF -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				PDF de Resposta Oficial do SUS
			</h3>
		</div>
		<div
			class="mb-2 border-l-4 border-purple-700 bg-purple-50 px-3 py-2 text-[11px] text-purple-900"
		>
			Documento oficial recebido do SUS federal após o encaminhamento. Será armazenado como anexo
			tipo <strong>RESPOSTA_SUS</strong> e gerará o evento <strong>RESPOSTA_SUS_RECEBIDA</strong>
			na linha do tempo.
		</div>

		<Dropzone
			label="ARRASTE O PDF OFICIAL DO SUS"
			sublabel="Formato aceito: PDF (máx 10 MB). Um único arquivo por encaminhamento."
			acceptTypes="application/pdf"
			mode="simple"
			variant="primary"
			files={pdfFile}
			onFiles={handleArquivo}
		/>
	</section>

	<!-- Observação -->
	<section>
		<div class="mb-2 border-b border-slate-200 pb-1.5">
			<h3 class="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
				Resumo da Resposta
			</h3>
		</div>
		<textarea
			rows="4"
			bind:value={observacao}
			placeholder="Ex.: SUS agendou consulta para 14/05/2026 às 10h no Hospital Ana Nery · Dr. Pedro Farias. Paciente já notificado por telefone."
			class="w-full resize-none border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-purple-700 focus:ring-1 focus:ring-purple-700"
		></textarea>
		<div class="mt-1 text-[10px] tracking-wider text-slate-500 uppercase">
			Texto curado · vira <code class="bg-slate-100 px-1">respostaSUS.observacao</code> e descrição do
			evento na timeline
		</div>
	</section>

	<!-- Consequências -->
	<section class="border border-slate-200 bg-slate-50 p-3">
		<div class="mb-1.5 text-[10px] font-bold tracking-widest text-slate-600 uppercase">
			O que acontece ao registrar
		</div>
		<ul class="space-y-1 text-[11px] text-slate-700">
			<li class="flex gap-2">
				<span class="font-bold text-purple-700">✓</span>
				<span>PDF vinculado como anexo <strong>RESPOSTA_SUS</strong></span>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-purple-700">✓</span>
				<span
					>Campo <code class="bg-white px-1">respostaSUS</code> preenchido no encaminhamento</span
				>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-purple-700">✓</span>
				<span>Evento <strong>RESPOSTA_SUS_RECEBIDA</strong> entra na linha do tempo</span>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-purple-700">✓</span>
				<span>UBS de origem notificada · paciente pode ser contatado com a resposta oficial</span>
			</li>
			<li class="flex gap-2">
				<span class="font-bold text-purple-700">✓</span>
				<span>Status permanece <strong>APROVADO</strong> (não é transição)</span>
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
			label="Registrar Resposta do SUS"
			onclick={enviar}
			loading={enviando}
			disabled={pdfFile.length === 0 || !observacao.trim()}
		/>
	</div>
</div>
