<script lang="ts">
	interface PacienteInfo {
		nome: string;
		cpf: string;
		cartaoSus: string;
		sexo: string;
	}

	interface ConsultaData {
		paciente: PacienteInfo;
	}

	let {
		isOpen,
		consulta,
		medicoLogado,
		medicoCrm,
		soapCid10 = '',
		soapDiagnostico = '',
		enviando = false,
		onClose,
		onSubmit
	}: {
		isOpen: boolean;
		consulta: ConsultaData | null;
		medicoLogado: string;
		medicoCrm: string;
		soapCid10?: string;
		soapDiagnostico?: string;
		enviando?: boolean;
		onClose: () => void;
		onSubmit: (dados: {
			especialidade: string;
			prioridade: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE';
			cid10: string;
			diagnostico: string;
			justificativa: string;
		}) => void;
	} = $props();

	let formNovoEncEspecialidade = $state('Cardiologia Pediátrica');
	let formNovoEncPrioridade = $state<'ELETIVA' | 'PRIORITARIA' | 'URGENTE'>('PRIORITARIA');
	let formNovoEncJustificativa = $state('');
	let erroLocal = $state('');

	function handleSubmit() {
		if (!formNovoEncJustificativa.trim() || formNovoEncJustificativa.trim().length < 8) {
			erroLocal = 'Informe a justificativa clínica detalhada (mínimo 8 caracteres).';
			return;
		}
		erroLocal = '';
		onSubmit({
			especialidade: formNovoEncEspecialidade,
			prioridade: formNovoEncPrioridade,
			cid10: soapCid10.trim().toUpperCase(),
			diagnostico: soapDiagnostico.trim(),
			justificativa: formNovoEncJustificativa.trim()
		});
	}
</script>

{#if isOpen && consulta}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs backdrop-blur-xs">
		<div class="w-full max-w-2xl border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]">
			<div class="flex items-center justify-between border-b border-slate-200 bg-blue-900 px-5 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">➕ SOLICITAÇÃO DE ENCAMINHAMENTO PARA REGULAÇÃO SMS</div>
				<button type="button" aria-label="Fechar modal" onclick={onClose} class="text-blue-200 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-6 flex flex-col gap-4">
				{#if erroLocal}
					<div class="border border-red-700 bg-red-50 p-2.5 font-mono text-xs font-bold text-red-900">
						⚠ {erroLocal}
					</div>
				{/if}

				<!-- Dados Preenchidos Automaticamente do Paciente -->
				<div class="bg-blue-50 border border-blue-200 p-3 font-mono">
					<div class="font-bold text-blue-900 text-xs font-sans">{consulta.paciente.nome}</div>
					<div class="text-[11px] text-slate-600 mt-0.5">
						CPF: {consulta.paciente.cpf} · Cartão SUS: {consulta.paciente.cartaoSus} · Sexo: {consulta.paciente.sexo}
					</div>
					<div class="text-[10px] text-slate-500 mt-1">
						Unidade Solicitante: <strong>Centro Municipal de Especialidades</strong> · Solicitante: <strong>{medicoLogado} ({medicoCrm})</strong>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="enc-esp" class="font-bold text-slate-700 text-[11px]">Especialidade / Fila de Destino *</label>
						<select id="enc-esp" bind:value={formNovoEncEspecialidade} class="border border-slate-300 p-2 text-xs bg-white font-bold">
							<option value="Cardiologia Pediátrica">Cardiologia Pediátrica</option>
							<option value="Cirurgia Vascular">Cirurgia Vascular</option>
							<option value="Neurologia Clínica">Neurologia Clínica</option>
							<option value="Oncologia Cirúrgica">Oncologia Cirúrgica</option>
							<option value="Endocrinologia e Metabologia">Endocrinologia e Metabologia</option>
							<option value="Pneumologia Clínica">Pneumologia Clínica</option>
							<option value="Ressonância Magnética com Contraste">Ressonância Magnética com Contraste</option>
							<option value="Tomografia Computadorizada">Tomografia Computadorizada</option>
						</select>
					</div>

					<div class="flex flex-col gap-1">
						<label for="enc-prio" class="font-bold text-slate-700 text-[11px]">Prioridade Clínica *</label>
						<select id="enc-prio" bind:value={formNovoEncPrioridade} class="border border-slate-300 p-2 text-xs bg-white font-bold">
							<option value="ELETIVA">Eletiva (Fluxo Normal)</option>
							<option value="PRIORITARIA">Prioritária (Acompanhamento Próximo)</option>
							<option value="URGENTE">Urgente (Risco de Descompensação)</option>
						</select>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-12 gap-2">
					<div class="md:col-span-4 flex flex-col gap-1">
						<label for="enc-cid" class="font-bold text-slate-700 text-[11px]">CID-10 Principal</label>
						<input id="enc-cid" type="text" bind:value={soapCid10} class="border border-slate-300 p-2 text-xs font-mono font-bold bg-slate-50 uppercase" />
					</div>
					<div class="md:col-span-8 flex flex-col gap-1">
						<label for="enc-diag" class="font-bold text-slate-700 text-[11px]">Diagnóstico / Impressão Clínica</label>
						<input id="enc-diag" type="text" bind:value={soapDiagnostico} class="border border-slate-300 p-2 text-xs font-sans bg-slate-50" />
					</div>
				</div>

				<div class="flex flex-col gap-1">
					<label for="enc-just" class="font-bold text-slate-700 text-[11px]">Justificativa Clínica / O que o paciente precisa fazer *</label>
					<textarea
						id="enc-just"
						rows="4"
						bind:value={formNovoEncJustificativa}
						placeholder="Descreva detalhadamente a necessidade clínica, indicação do exame/consulta especializada..."
						class="border border-slate-300 p-2.5 text-xs font-sans resize-none outline-none focus:border-blue-900"
					></textarea>
				</div>

				<div class="bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900">
					ℹ Ao confirmar, a solicitação será transmitida diretamente para a Fila de Regulação da Secretaria Municipal de Saúde.
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
				<button onclick={onClose} class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100">
					Cancelar
				</button>
				<button
					onclick={handleSubmit}
					disabled={enviando}
					class="border border-blue-900 bg-blue-900 px-5 py-2 font-bold text-white uppercase hover:bg-blue-950 disabled:opacity-50"
				>
					{enviando ? 'Enviando à Regulação...' : '✓ Confirmar e Enviar para a Secretaria / Regulação'}
				</button>
			</div>
		</div>
	</div>
{/if}
