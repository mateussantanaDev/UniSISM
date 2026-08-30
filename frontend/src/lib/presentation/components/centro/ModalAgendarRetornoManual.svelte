<script lang="ts">
	interface PacienteInfo {
		nome: string;
		cpf: string;
	}

	interface ConsultaData {
		paciente: PacienteInfo;
		pacienteId: string;
	}

	let {
		isOpen,
		consulta,
		medicoNomePadrao,
		agendando = false,
		onClose,
		onSubmit
	}: {
		isOpen: boolean;
		consulta: ConsultaData | null;
		medicoNomePadrao: string;
		agendando?: boolean;
		onClose: () => void;
		onSubmit: (dados: {
			dataRetorno: string;
			horaRetorno: string;
			medicoRetornoNome: string;
			obsRetorno: string;
		}) => void;
	} = $props();

	let dataRetornoManual = $state('');
	let horaRetornoManual = $state('09:00');
	let medicoRetornoNome = $state('');
	let obsRetorno = $state('');
	let erroLocal = $state('');

	$effect(() => {
		if (isOpen) {
			const d = new Date();
			d.setDate(d.getDate() + 30);
			dataRetornoManual = d.toISOString().substring(0, 10);
			medicoRetornoNome = medicoNomePadrao || '';
			obsRetorno = 'Consulta de retorno clínico com apresentação de exames solicitados.';
			erroLocal = '';
		}
	});

	function selecionarPrazoPresetRetorno(dias: number) {
		const d = new Date();
		d.setDate(d.getDate() + dias);
		dataRetornoManual = d.toISOString().substring(0, 10);
	}

	function handleSubmit() {
		if (!dataRetornoManual) {
			erroLocal = 'Selecione a data manual para a consulta de retorno.';
			return;
		}
		erroLocal = '';
		onSubmit({
			dataRetorno: dataRetornoManual,
			horaRetorno: horaRetornoManual,
			medicoRetornoNome: medicoRetornoNome.trim(),
			obsRetorno: obsRetorno.trim()
		});
	}
</script>

{#if isOpen && consulta}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs backdrop-blur-xs">
		<div class="w-full max-w-xl border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.15)]">
			<div class="flex items-center justify-between border-b border-slate-200 bg-purple-900 px-5 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">📅 AGENDAR RETORNO / VOLTA DO PACIENTE (DATA MANUAL)</div>
				<button type="button" aria-label="Fechar modal" onclick={onClose} class="text-purple-200 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5 flex flex-col gap-4">
				{#if erroLocal}
					<div class="border border-red-700 bg-red-50 p-2.5 font-mono text-xs font-bold text-red-900">
						⚠ {erroLocal}
					</div>
				{/if}

				<div class="bg-purple-50 border border-purple-200 p-3 font-sans text-purple-950">
					<div class="font-bold text-xs">{consulta.paciente.nome}</div>
					<div class="text-[11px] text-purple-800 font-mono mt-0.5">CPF: {consulta.paciente.cpf} · Prontuário PEC: {consulta.pacienteId}</div>
					<div class="text-[10px] text-purple-900 mt-1">
						⚡ <strong>Agendamento Direto:</strong> A vaga do retorno é gravada imediatamente na data escolhida, sem precisar passar pela fila de cálculo automático.
					</div>
				</div>

				<!-- Atalhos Rápidos de Prazos de Retorno -->
				<div class="flex flex-col gap-1">
					<span class="text-[10px] font-bold text-slate-600 uppercase">Atalhos de Prazo para o Retorno:</span>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							onclick={() => selecionarPrazoPresetRetorno(7)}
							class="border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900 px-2.5 py-1 text-xs font-bold"
						>
							+ 7 Dias
						</button>
						<button
							type="button"
							onclick={() => selecionarPrazoPresetRetorno(15)}
							class="border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900 px-2.5 py-1 text-xs font-bold"
						>
							+ 15 Dias
						</button>
						<button
							type="button"
							onclick={() => selecionarPrazoPresetRetorno(30)}
							class="border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900 px-2.5 py-1 text-xs font-bold"
						>
							+ 30 Dias (1 Mês)
						</button>
						<button
							type="button"
							onclick={() => selecionarPrazoPresetRetorno(60)}
							class="border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900 px-2.5 py-1 text-xs font-bold"
						>
							+ 60 Dias (2 Meses)
						</button>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="ret-data" class="font-bold text-slate-700 text-[10px] uppercase">Data Manual do Retorno *</label>
						<input
							id="ret-data"
							type="date"
							bind:value={dataRetornoManual}
							class="border border-slate-300 p-2 text-xs font-bold font-mono outline-none focus:border-purple-800 bg-white"
						/>
					</div>

					<div class="flex flex-col gap-1">
						<label for="ret-hora" class="font-bold text-slate-700 text-[10px] uppercase">Horário da Consulta *</label>
						<input
							id="ret-hora"
							type="time"
							bind:value={horaRetornoManual}
							class="border border-slate-300 p-2 text-xs font-bold font-mono outline-none focus:border-purple-800 bg-white"
						/>
					</div>
				</div>

				<div class="flex flex-col gap-1">
					<label for="ret-medico" class="font-bold text-slate-700 text-[10px] uppercase">Médico Atribuído ao Retorno</label>
					<input
						id="ret-medico"
						type="text"
						bind:value={medicoRetornoNome}
						class="border border-slate-300 p-2 text-xs font-sans outline-none focus:border-purple-800 bg-white"
					/>
				</div>

				<div class="flex flex-col gap-1">
					<label for="ret-obs" class="font-bold text-slate-700 text-[10px] uppercase">Observações / Exames a Apresentar</label>
					<textarea
						id="ret-obs"
						rows="3"
						bind:value={obsRetorno}
						class="border border-slate-300 p-2 text-xs font-sans resize-none outline-none focus:border-purple-800 bg-white"
					></textarea>
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
				<button onclick={onClose} class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100">
					Cancelar
				</button>
				<button
					onclick={handleSubmit}
					disabled={agendando}
					class="border border-purple-900 bg-purple-900 px-5 py-2 font-bold text-white uppercase hover:bg-purple-950 disabled:opacity-50"
				>
					{agendando ? 'Agendando...' : '✓ Confirmar Agendamento de Retorno (Data Manual)'}
				</button>
			</div>
		</div>
	</div>
{/if}
