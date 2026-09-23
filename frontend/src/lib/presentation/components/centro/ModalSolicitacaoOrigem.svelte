<script lang="ts">
	import Modal from '$lib/presentation/components/Modal.svelte';

	interface PacienteInfo {
		nome: string;
		cpf: string;
		cartaoSus: string;
	}

	interface SolicitacaoInfo {
		medicoSolicitante: string;
		crm: string;
		dataSolicitacao: string;
		especialidadeSolicitada: string;
		cid10: string;
		cidDescricao: string;
		justificativaClinica: string;
	}

	interface ConsultaData {
		protocolo: string;
		unidadeOrigem: string;
		paciente: PacienteInfo;
		solicitacao: SolicitacaoInfo;
		observacoesRegulacao?: string;
	}

	let {
		isOpen,
		consulta,
		onClose
	}: {
		isOpen: boolean;
		consulta: ConsultaData | null;
		onClose: () => void;
	} = $props();
</script>

<Modal
	{isOpen}
	{onClose}
	title="SOLICITAÇÃO MÉDICA DE ORIGEM"
	subtitle={consulta ? `Protocolo: ${consulta.protocolo} · Unidade: ${consulta.unidadeOrigem}` : ''}
	maxWidth="lg"
>
	{#if consulta}
		<div class="flex flex-col gap-4 font-mono text-xs">
			<!-- Dados do Paciente e Origem -->
			<div class="grid grid-cols-2 gap-4 border border-slate-200 bg-slate-50 p-4">
				<div>
					<div class="text-[9px] font-bold text-slate-500 uppercase">PACIENTE</div>
					<div class="font-sans text-sm font-bold text-slate-900">{consulta.paciente.nome}</div>
					<div class="text-[11px] text-slate-600">
						CPF: {consulta.paciente.cpf} · SUS: {consulta.paciente.cartaoSus}
					</div>
				</div>
				<div>
					<div class="text-[9px] font-bold text-slate-500 uppercase">MÉDICO SOLICITANTE DA UBS</div>
					<div class="font-sans font-bold text-slate-900">
						{consulta.solicitacao.medicoSolicitante}
					</div>
					<div class="text-[11px] text-slate-600">
						{consulta.solicitacao.crm} · Data: {consulta.solicitacao.dataSolicitacao}
					</div>
				</div>
			</div>

			<!-- Detalhes Clínicos da Solicitação -->
			<div class="flex flex-col gap-3 border border-slate-200 p-4 font-sans">
				<div class="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3 font-mono">
					<div>
						<span class="block text-[10px] text-slate-500 uppercase">Especialidade Solicitada</span>
						<span class="text-sm font-bold text-blue-900"
							>{consulta.solicitacao.especialidadeSolicitada}</span
						>
					</div>
					<div>
						<span class="block text-[10px] text-slate-500 uppercase">CID-10 e Diagnóstico</span>
						<span class="font-bold text-slate-900"
							>{consulta.solicitacao.cid10} — {consulta.solicitacao.cidDescricao}</span
						>
					</div>
				</div>

				<div>
					<div class="font-mono text-[10px] font-bold text-slate-500 uppercase">
						JUSTIFICATIVA CLÍNICA ORIGINAL DA UBS
					</div>
					<div
						class="mt-1 border border-slate-200 bg-slate-50 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-slate-800"
					>
						{consulta.solicitacao.justificativaClinica}
					</div>
				</div>

				{#if consulta.observacoesRegulacao}
					<div>
						<div class="font-mono text-[10px] font-bold text-slate-500 uppercase">
							NOTAS DE REGULAÇÃO / RECEPÇÃO
						</div>
						<div
							class="mt-1 border border-blue-200 bg-blue-50 p-2.5 font-mono text-xs text-blue-900"
						>
							{consulta.observacoesRegulacao}
						</div>
					</div>
				{/if}
			</div>

			<div class="flex justify-end border-t border-slate-200 pt-2">
				<button
					type="button"
					onclick={onClose}
					class="border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase hover:bg-slate-50"
				>
					Fechar
				</button>
			</div>
		</div>
	{/if}
</Modal>
