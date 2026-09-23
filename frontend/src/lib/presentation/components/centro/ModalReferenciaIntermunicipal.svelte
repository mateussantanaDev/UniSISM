<script lang="ts">
	import Modal from '$lib/presentation/components/Modal.svelte';

	interface PacienteInfo {
		nome: string;
		cpf: string;
		cartaoSus: string;
	}

	interface ConsultaData {
		paciente: PacienteInfo;
		solicitacao?: {
			cid10?: string;
			cidDescricao?: string;
		};
	}

	let {
		isOpen,
		consulta,
		enviando = false,
		protocoloGerado = null,
		onClose,
		onSubmit
	}: {
		isOpen: boolean;
		consulta: ConsultaData | null;
		enviando?: boolean;
		protocoloGerado?: string | null;
		onClose: () => void;
		onSubmit: (dados: {
			municipioDestino: string;
			especialidade: string;
			cid10: string;
			diagnostico: string;
			justificativa: string;
			prioridade: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';
			transporte: string;
			acompanhante: boolean;
		}) => void;
	} = $props();

	const municipiosReferencia = [
		'Salvador (SESAB - Central Estadual)',
		'Feira de Santana (Hospital Geral Clériston Andrade)',
		'Vitória da Conquista (Hospital de Base)',
		'Itabuna (Hospital de Base Luís Eduardo Magalhães)',
		'Juazeiro (Hospital Regional)',
		'Barreiras (Hospital do Oeste)'
	];

	const especialidadesReferencia = [
		'Oncologia Clínica e Cirúrgica',
		'Cirurgia Cardiovascular de Alta Complexidade',
		'Neurocirurgia e Neurologia Avançada',
		'Ortopedia e Traumatologia de Alta Complexidade',
		'Transplante Renal / Hepático',
		'Genética Médica e Doenças Raras',
		'Terapia Renal Substitutiva (Hemodiálise)'
	];

	let refMunicipioDestino = $state('Salvador (SESAB - Central Estadual)');
	let refEspecialidade = $state('Oncologia Clínica e Cirúrgica');
	let refCid10 = $state('');
	let refDiagnostico = $state('');
	let refJustificativa = $state('');
	let refPrioridade = $state<'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA'>('PRIORITARIA');
	let refTransporte = $state('VAN_SMS');
	let refAcompanhante = $state(false);
	let erroLocal = $state('');

	$effect(() => {
		if (consulta?.solicitacao?.cid10) {
			refCid10 = consulta.solicitacao.cid10;
		}
		if (consulta?.solicitacao?.cidDescricao) {
			refDiagnostico = consulta.solicitacao.cidDescricao;
		}
	});

	function handleSubmit() {
		if (!refJustificativa.trim() || refJustificativa.trim().length < 10) {
			erroLocal = 'Informe a justificativa médica detalhada (mínimo 10 caracteres).';
			return;
		}
		if (!refCid10.trim()) {
			erroLocal = 'Informe o código CID-10 para a regulação intermunicipal.';
			return;
		}
		erroLocal = '';
		onSubmit({
			municipioDestino: refMunicipioDestino,
			especialidade: refEspecialidade,
			cid10: refCid10.trim().toUpperCase(),
			diagnostico: refDiagnostico.trim(),
			justificativa: refJustificativa.trim(),
			prioridade: refPrioridade,
			transporte: refTransporte,
			acompanhante: refAcompanhante
		});
	}
</script>

<Modal
	{isOpen}
	{onClose}
	title="ENCAMINHAMENTO INTERMUNICIPAL (REGULAÇÃO SMS / TFD)"
	subtitle={consulta ? `Paciente: ${consulta.paciente.nome}` : ''}
	maxWidth="lg"
>
	{#if protocoloGerado}
		<div
			class="flex flex-col items-center gap-3 border-2 border-emerald-700 bg-emerald-50 p-6 text-center"
		>
			<div class="font-mono text-xl font-black text-emerald-900">
				✓ ENCAMINHAMENTO INTERMUNICIPAL REGISTRADO
			</div>
			<div class="font-mono text-sm text-slate-800">
				Protocolo Gerado: <strong class="bg-emerald-200 px-2 py-1 text-base"
					>{protocoloGerado}</strong
				>
			</div>
			<div class="max-w-md font-sans text-xs text-slate-700">
				O pedido foi enviado diretamente para a fila da Regulação da Secretaria Municipal de Saúde.
				O paciente poderá acompanhar a regulação e o agendamento logístico no centro de comando.
			</div>
			<div class="pt-3">
				<button
					type="button"
					onclick={onClose}
					class="border border-emerald-800 bg-emerald-800 px-5 py-2 font-mono text-xs font-bold text-white uppercase hover:bg-emerald-900"
				>
					Fechar Janela
				</button>
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-4 font-sans text-xs">
			{#if erroLocal}
				<div class="border border-red-700 bg-red-50 p-2.5 font-mono text-xs font-bold text-red-900">
					⚠ {erroLocal}
				</div>
			{/if}

			<div class="border border-blue-200 bg-blue-50 p-3 font-mono text-[11px] text-blue-900">
				ℹ Utilize este formulário quando o tratamento ou procedimento do paciente não estiver
				disponível na rede municipal, necessitando de encaminhamento para centro de referência em
				outra cidade.
			</div>

			<div class="grid grid-cols-2 gap-3 font-mono">
				<!-- Município de Destino -->
				<div class="flex flex-col gap-1">
					<label for="ref-mun" class="text-[10px] font-bold text-slate-600 uppercase"
						>Município de Referência <span class="text-red-700">*</span></label
					>
					<select
						id="ref-mun"
						bind:value={refMunicipioDestino}
						class="border border-slate-300 bg-white p-2 font-sans text-xs outline-none focus:border-blue-900"
					>
						{#each municipiosReferencia as m}
							<option value={m}>{m}</option>
						{/each}
					</select>
				</div>

				<!-- Especialidade / Procedimento de Alta Complexidade -->
				<div class="flex flex-col gap-1">
					<label for="ref-esp" class="text-[10px] font-bold text-slate-600 uppercase"
						>Especialidade / Alta Complexidade <span class="text-red-700">*</span></label
					>
					<select
						id="ref-esp"
						bind:value={refEspecialidade}
						class="border border-slate-300 bg-white p-2 font-sans text-xs outline-none focus:border-blue-900"
					>
						{#each especialidadesReferencia as e}
							<option value={e}>{e}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="grid grid-cols-12 gap-3 font-mono">
				<div class="col-span-4 flex flex-col gap-1">
					<label for="ref-cid" class="text-[10px] font-bold text-slate-600 uppercase"
						>CID-10 <span class="text-red-700">*</span></label
					>
					<input
						id="ref-cid"
						type="text"
						bind:value={refCid10}
						class="border border-slate-300 bg-white p-2 text-xs font-bold uppercase outline-none focus:border-blue-900"
					/>
				</div>
				<div class="col-span-8 flex flex-col gap-1">
					<label for="ref-diag" class="text-[10px] font-bold text-slate-600 uppercase"
						>Diagnóstico Clínico</label
					>
					<input
						id="ref-diag"
						type="text"
						bind:value={refDiagnostico}
						class="border border-slate-300 bg-white p-2 font-sans text-xs outline-none focus:border-blue-900"
					/>
				</div>
			</div>

			<!-- Justificativa / Laudo Médico -->
			<div class="flex flex-col gap-1">
				<label for="ref-just" class="font-mono text-[10px] font-bold text-slate-600 uppercase">
					Laudo Médico e Justificativa da Necessidade Intermunicipal <span class="text-red-700"
						>*</span
					>
				</label>
				<textarea
					id="ref-just"
					rows="4"
					bind:value={refJustificativa}
					placeholder="Descreva a fundamentação clínica para o tratamento fora do município..."
					class="resize-none border border-slate-300 bg-white p-2.5 font-sans text-xs outline-none focus:border-blue-900"
				></textarea>
			</div>

			<!-- Prioridade e Logística -->
			<div class="grid grid-cols-3 gap-3 border-t border-slate-200 pt-3 font-mono">
				<div class="flex flex-col gap-1">
					<label for="ref-prio" class="text-[9px] font-bold text-slate-600 uppercase"
						>Prioridade Clínica</label
					>
					<select
						id="ref-prio"
						bind:value={refPrioridade}
						class="border border-slate-300 bg-white p-1.5 text-xs outline-none"
					>
						<option value="ELETIVA">ELETIVA</option>
						<option value="PRIORITARIA">PRIORITÁRIA</option>
						<option value="URGENTE">URGENTE</option>
						<option value="EMERGENCIA">EMERGÊNCIA</option>
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<label for="ref-transp" class="text-[9px] font-bold text-slate-600 uppercase"
						>Transporte Solicitado</label
					>
					<select
						id="ref-transp"
						bind:value={refTransporte}
						class="border border-slate-300 bg-white p-1.5 text-xs outline-none"
					>
						<option value="VAN_SMS">Van da SMS</option>
						<option value="AMBULANCIA">Ambulância Simples</option>
						<option value="UTI_MOVEL">Ambulância UTI Móvel</option>
						<option value="PASSAGEM_RODOVIARIA">Passagem Rodoviária</option>
					</select>
				</div>
				<div class="flex flex-col justify-center gap-1">
					<span class="text-[9px] font-bold text-slate-600 uppercase">Acompanhante</span>
					<label for="ref-acomp" class="flex cursor-pointer items-center gap-1.5 font-sans">
						<input id="ref-acomp" type="checkbox" bind:checked={refAcompanhante} class="h-4 w-4" />
						<span>Exige Acompanhante</span>
					</label>
				</div>
			</div>

			<div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-3 font-mono">
				<button
					type="button"
					onclick={onClose}
					class="border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase hover:bg-slate-100"
				>
					Cancelar
				</button>

				<button
					type="button"
					onclick={handleSubmit}
					disabled={enviando}
					class="border border-blue-900 bg-blue-900 px-5 py-2 text-xs font-bold tracking-wider text-white uppercase hover:bg-blue-950 disabled:opacity-50"
				>
					{enviando ? 'Enviando à Regulação...' : 'Enviar para Regulação SMS'}
				</button>
			</div>
		</div>
	{/if}
</Modal>
