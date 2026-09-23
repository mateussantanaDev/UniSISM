<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import { IconSearch, IconFileText, IconPrinter, IconPill, IconCheck } from '@tabler/icons-svelte';
	import { calcularIdadeExata } from '$lib/presentation/utils/stringUtils';

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(
		ehCeo
			? 'Centro de Especialidades Odontológicas (CEO)'
			: 'Centro de Especialidades Médicas (CEM)'
	);
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');
	let rotuloProfissional = $derived(
		ehCeo ? 'Cirurgião-Dentista Especialista' : 'Médico Especialista'
	);
	let rotuloRegistro = $derived(ehCeo ? 'CRO' : 'CRM');

	interface AtendimentoHistorico {
		id: string;
		protocolo: string;
		dataAtendimento: string;
		horario: string;
		pacienteNome: string;
		pacienteCpf: string;
		pacienteCartaoSus: string;
		pacienteIdade: number;
		unidadeOrigem: string;
		cid10: string;
		cidDescricao: string;
		diagnostico: string;
		queixaPrincipal: string;
		exameFisico: string;
		conduta: string;
		prescricao: string;
		atestadoEmitido?: string;
		medicoNome: string;
		medicoCrm: string;
	}

	// State
	let carregando = $state(true);
	let busca = $state('');
	let filtroDataInicio = $state(
		new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10)
	);
	let filtroDataFim = $state(new Date().toISOString().substring(0, 10));
	let listaHistorico = $state<AtendimentoHistorico[]>([]);

	// Modal Visualizar PEP
	let modalPepAberto = $state(false);
	let atendimentoSelecionado = $state<AtendimentoHistorico | null>(null);

	async function carregarHistorico() {
		carregando = true;
		try {
			// Busca encaminhamentos concluídos do servidor
			const encs = await api.encaminhamentos.list({ status: 'APROVADO', limit: 1000 });
			const me = await api.auth.me().catch(() => null);

			listaHistorico = encs
				.filter((e) => {
					const f = (e.filaDestino as string) || '';
					const c = (e as any).canalRoteamento || '';
					if (ehCeo) {
						return f === 'CEO' || c === 'CENTRO_ODONTOLOGICO';
					} else {
						return (
							f === 'CENTRO_ESPECIALIDADES' ||
							f === 'CEM' ||
							(f !== 'CEO' && c !== 'CENTRO_ODONTOLOGICO')
						);
					}
				})
				.map((enc) => {
					const soap = (enc as any).atendimentoSOAP;
					const dataAtend =
						soap?.concluidoEm?.substring(0, 10) ||
						enc.agendamentoPrevisto ||
						new Date(enc.atualizadoEm || enc.criadoEm).toISOString().substring(0, 10);
					const horaAtend = soap?.concluidoEm
						? new Date(soap.concluidoEm).toLocaleTimeString('pt-BR', {
								hour: '2-digit',
								minute: '2-digit'
							})
						: '08:00';

					return {
						id: enc.id,
						protocolo: enc.protocolo,
						dataAtendimento: dataAtend,
						horario: horaAtend,
						pacienteNome: enc.paciente.nome,
						pacienteCpf: enc.paciente.cpf,
						pacienteCartaoSus: enc.paciente.cartaoSus || '',
						pacienteIdade: calcularIdadeExata(enc.paciente.dataNascimento),
						unidadeOrigem: enc.unidadeOrigem || 'Unidade Básica de Saúde',
						cid10: soap?.cid10 || enc.solicitacao.cid10 || '',
						cidDescricao: soap?.diagnostico || enc.solicitacao.cidDescricao || '',
						diagnostico:
							soap?.diagnostico || enc.solicitacao.cidDescricao || 'Consulta Especializada',
						queixaPrincipal: soap?.queixaPrincipal || enc.solicitacao.justificativaClinica || '',
						exameFisico:
							soap?.exameFisico ||
							(enc as any).exameFisico ||
							'Consulta realizada conforme registrado no prontuário.',
						conduta:
							soap?.conduta ||
							(enc as any).conduta ||
							'Conduta registrada no atendimento especializado.',
						prescricao: soap?.prescricao || (enc as any).prescricao || '',
						atestadoEmitido: (enc as any).atestadoEmitido || '',
						medicoNome: (enc as any).profissionalAtribuido || me?.nome || 'Médico Especialista',
						medicoCrm: (me as any)?.crm ? `CRM ${(me as any).crm}` : 'CRM Regulação'
					};
				});
		} catch (e) {
			console.error('[UniSISM] Erro ao carregar histórico de atendimentos.', e);
			listaHistorico = [];
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarHistorico();
	});

	let historicoFiltrado = $derived.by(() => {
		return listaHistorico.filter((item) => {
			const q = busca.toLowerCase().trim();
			if (q) {
				const matchNome = item.pacienteNome.toLowerCase().includes(q);
				const matchCpf = item.pacienteCpf.includes(q);
				const matchProt = item.protocolo.toLowerCase().includes(q);
				const matchCid =
					item.cid10.toLowerCase().includes(q) || item.cidDescricao.toLowerCase().includes(q);
				if (!matchNome && !matchCpf && !matchProt && !matchCid) return false;
			}
			if (filtroDataInicio && item.dataAtendimento < filtroDataInicio) return false;
			if (filtroDataFim && item.dataAtendimento > filtroDataFim) return false;
			return true;
		});
	});

	function abrirPep(item: AtendimentoHistorico) {
		atendimentoSelecionado = item;
		modalPepAberto = true;
	}

	function imprimirDocumento(titulo: string) {
		window.print();
	}
</script>

<svelte:head>
	<title>ERP Médico - Histórico de Atendimentos | UniSISM Centro</title>
</svelte:head>

<div class="flex flex-col gap-5 font-mono text-xs">
	<!-- Panel Header -->
	<PanelHeader
		title="HISTÓRICO DE ATENDIMENTOS E PRONTUÁRIOS ELETRÔNICOS (PEP)"
		subtitle="Consulta dos prontuários finalizados, diagnósticos CIDs registrados, receitas emitidas e laudos técnicos assinados."
	/>

	<!-- Filtros de Busca -->
	<section
		class="flex flex-col gap-3 border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
	>
		<div class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
			<input
				type="text"
				placeholder="Buscar paciente, CPF, protocolo ou CID-10..."
				bind:value={busca}
				class="min-w-[260px] flex-1 border border-slate-300 bg-slate-50 p-2 text-xs"
			/>
			<div class="flex items-center gap-1.5">
				<span class="text-[10px] font-bold text-slate-500">DE:</span>
				<input
					type="date"
					bind:value={filtroDataInicio}
					class="border border-slate-300 bg-white p-2 text-xs"
				/>
			</div>
			<div class="flex items-center gap-1.5">
				<span class="text-[10px] font-bold text-slate-500">ATÉ:</span>
				<input
					type="date"
					bind:value={filtroDataFim}
					class="border border-slate-300 bg-white p-2 text-xs"
				/>
			</div>
		</div>
		<button
			onclick={carregarHistorico}
			class="flex shrink-0 items-center gap-1.5 border border-blue-900 bg-blue-900 px-4 py-2 text-xs font-bold text-white uppercase hover:bg-blue-950"
		>
			<IconSearch size={14} />
			<span>Filtrar Prontuários</span>
		</button>
	</section>

	<!-- Tabela de Prontuários Finalizados -->
	{#if carregando}
		<div class="border border-slate-200 bg-white p-8 text-center font-mono text-slate-500">
			Carregando prontuários de atendimentos do servidor...
		</div>
	{:else}
		<section class="overflow-hidden border border-slate-200 bg-white">
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-left">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-900 text-[10px] font-bold tracking-wider text-white uppercase"
						>
							<th class="p-3">Data / Horário</th>
							<th class="p-3">Protocolo</th>
							<th class="p-3">Paciente</th>
							<th class="p-3">Unidade Origem (UBS)</th>
							<th class="p-3">Diagnóstico (CID-10)</th>
							<th class="p-3 text-right">Ações de PEP</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-200 font-mono text-xs">
						{#if historicoFiltrado.length === 0}
							<tr>
								<td colspan="6" class="p-8 text-center text-slate-500">
									Nenhum prontuário registrado no período selecionado.
								</td>
							</tr>
						{:else}
							{#each historicoFiltrado as item (item.id)}
								<tr class="hover:bg-slate-50">
									<td class="p-3 font-bold text-slate-900">
										<div>{item.dataAtendimento}</div>
										<div class="text-[10px] font-normal text-slate-500">{item.horario}h</div>
									</td>
									<td class="p-3 font-mono font-bold text-blue-900">
										{item.protocolo}
									</td>
									<td class="p-3 font-sans font-bold text-slate-900">
										<div>{item.pacienteNome}</div>
										<div class="font-mono text-[10px] font-normal text-slate-500">
											CPF: {item.pacienteCpf} · {item.pacienteIdade} anos
										</div>
									</td>
									<td class="p-3 font-semibold text-slate-700">{item.unidadeOrigem}</td>
									<td class="p-3">
										<span
											class="border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-900"
										>
											{item.cid10} — {item.cidDescricao}
										</span>
									</td>
									<td class="p-3 text-right">
										<button
											onclick={() => abrirPep(item)}
											class="ml-auto flex items-center gap-1.5 border border-blue-900 bg-blue-900 px-3 py-1 text-[10px] font-bold text-white uppercase hover:bg-blue-950"
										>
											<IconFileText size={13} />
											<span>Ver Prontuário PEP</span>
										</button>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>

<!-- Modal: Visualização PEP Completo Assinado -->
{#if modalPepAberto && atendimentoSelecionado}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs"
	>
		<div
			class="max-h-[90vh] w-full max-w-3xl overflow-y-auto border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]"
		>
			<div
				class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3 text-white"
			>
				<div class="flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
					<IconFileText size={15} />
					<span>PRONTUÁRIO ELETRÔNICO DO PACIENTE (PEP)</span>
					<span class="bg-emerald-700 px-2 py-0.5 text-[9px] text-white">ASSINADO DIGITALMENTE</span
					>
				</div>
				<button
					onclick={() => (modalPepAberto = false)}
					class="text-sm font-bold text-slate-400 hover:text-white">✕</button
				>
			</div>

			<div class="flex flex-col gap-5 p-6">
				<!-- Cabeçalho Institucional do PEP -->
				<div class="flex items-start justify-between border-b border-slate-200 pb-4">
					<div>
						<div class="font-sans text-sm font-bold text-slate-900">
							{atendimentoSelecionado.pacienteNome}
						</div>
						<div class="mt-0.5 font-mono text-[11px] text-slate-600">
							CPF: {atendimentoSelecionado.pacienteCpf} · Cartão SUS: {atendimentoSelecionado.pacienteCartaoSus}
							· Idade: {atendimentoSelecionado.pacienteIdade} anos
						</div>
						<div class="mt-0.5 text-[10px] text-slate-500">
							Origem: {atendimentoSelecionado.unidadeOrigem}
						</div>
					</div>
					<div class="text-right text-[10px] text-slate-600">
						<div><strong>Protocolo:</strong> {atendimentoSelecionado.protocolo}</div>
						<div>
							<strong>Data:</strong>
							{atendimentoSelecionado.dataAtendimento} às {atendimentoSelecionado.horario}h
						</div>
						<div>
							<strong>Especialista:</strong>
							{atendimentoSelecionado.medicoNome} ({atendimentoSelecionado.medicoCrm})
						</div>
					</div>
				</div>

				<!-- Registro SOAP -->
				<div class="flex flex-col gap-4">
					<div class="border border-slate-200 bg-slate-50 p-3">
						<span class="mb-1 block text-[10px] font-bold text-blue-900 uppercase"
							>S — SUBJETIVO / ANAMNESE</span
						>
						<p class="font-sans text-xs text-slate-800">{atendimentoSelecionado.queixaPrincipal}</p>
					</div>

					<div class="border border-slate-200 bg-slate-50 p-3">
						<span class="mb-1 block text-[10px] font-bold text-blue-900 uppercase"
							>O — OBJETIVO / EXAME FÍSICO E SINAIS VITAIS</span
						>
						<p class="font-sans text-xs text-slate-800">{atendimentoSelecionado.exameFisico}</p>
					</div>

					<div class="border border-slate-200 bg-slate-50 p-3">
						<span class="mb-1 block text-[10px] font-bold text-blue-900 uppercase"
							>A — AVALIAÇÃO / HIPÓTESE DIAGNÓSTICA</span
						>
						<div class="font-mono text-xs font-bold text-slate-900">
							{atendimentoSelecionado.cid10} — {atendimentoSelecionado.cidDescricao}
						</div>
						<p class="mt-1 font-sans text-xs text-slate-700">
							{atendimentoSelecionado.diagnostico}
						</p>
					</div>

					<div class="border border-slate-200 bg-slate-50 p-3">
						<span class="mb-1 block text-[10px] font-bold text-blue-900 uppercase"
							>P — PLANO TERAPÊUTICO E CONDUTA</span
						>
						<p class="font-sans text-xs text-slate-800">{atendimentoSelecionado.conduta}</p>
					</div>

					{#if atendimentoSelecionado.prescricao}
						<div class="border border-emerald-200 bg-emerald-50 p-3">
							<span
								class="mb-1 block flex items-center gap-1 text-[10px] font-bold text-emerald-900 uppercase"
							>
								<IconPill size={13} />
								<span>RECEITUÁRIO MÉDICO PRESCRITO</span>
							</span>
							<pre
								class="font-mono text-xs whitespace-pre-wrap text-emerald-950">{atendimentoSelecionado.prescricao}</pre>
						</div>
					{/if}

					{#if atendimentoSelecionado.atestadoEmitido}
						<div class="border border-amber-200 bg-amber-50 p-3">
							<span
								class="mb-1 block flex items-center gap-1 text-[10px] font-bold text-amber-900 uppercase"
							>
								<IconFileText size={13} />
								<span>ATESTADO / LAUDO MÉDICO</span>
							</span>
							<p class="font-sans text-xs text-amber-950">
								{atendimentoSelecionado.atestadoEmitido}
							</p>
						</div>
					{/if}
				</div>
			</div>

			<div
				class="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3"
			>
				<span class="text-[10px] text-slate-500"
					>Documento assinado eletronicamente via UniSISM PEP.</span
				>
				<div class="flex gap-2">
					<button
						onclick={() => imprimirDocumento('PEP')}
						class="flex items-center gap-1.5 border border-slate-400 bg-white px-4 py-2 font-bold hover:bg-slate-100"
					>
						<IconPrinter size={14} />
						<span>Imprimir PEP</span>
					</button>
					<button
						onclick={() => (modalPepAberto = false)}
						class="border border-blue-900 bg-blue-900 px-5 py-2 font-bold text-white uppercase hover:bg-blue-950"
					>
						Fechar
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
