<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import MetricCard from '$lib/presentation/components/MetricCard.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import { api, ApiError } from '$lib/api';
	import type { AtendimentoUbsItem, PrioridadeUbs, StatusAtendimentoUbs } from '$lib/api/types';
	import {
		PRIORIDADE_LABEL,
		TIPO_ATENDIMENTO_LABEL
	} from '$lib/api/types';
	import { onMount } from 'svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();

	let itens = $state<AtendimentoUbsItem[]>([]);
	let carregando = $state(true);
	let erro = $state('');
	let sucesso = $state('');

	let meuConsultorio = $state('Consultório 01');

	// Contadores
	let total = $state(0);
	let aguardando = $state(0);
	let chamados = $state(0);
	let emAtendimento = $state(0);
	let concluidos = $state(0);

	// Modal de Atendimento SOAP Rápido
	let modalSoapAberto = $state(false);
	let pacienteAtendimentoAtual = $state<AtendimentoUbsItem | null>(null);
	let soapSubjetivo = $state('');
	let soapObjetivo = $state('');
	let soapAvaliacaoCid = $state('');
	let soapPlanoConduta = $state('');
	let salvandoSoap = $state(false);

	const prioridadeCores: Record<PrioridadeUbs, { badge: string; border: string }> = {
		URGENCIA: {
			badge: 'bg-red-600 text-white font-bold animate-pulse',
			border: 'border-l-4 border-l-red-600'
		},
		SUPER_PRIORIDADE_80: {
			badge: 'bg-purple-700 text-white font-bold',
			border: 'border-l-4 border-l-purple-700'
		},
		GESTANTE_LACTANTE: {
			badge: 'bg-pink-600 text-white font-semibold',
			border: 'border-l-4 border-l-pink-600'
		},
		PCD: {
			badge: 'bg-indigo-600 text-white font-semibold',
			border: 'border-l-4 border-l-indigo-600'
		},
		TEA: {
			badge: 'bg-teal-600 text-white font-semibold',
			border: 'border-l-4 border-l-teal-600'
		},
		IDOSO_60: {
			badge: 'bg-amber-600 text-white font-semibold',
			border: 'border-l-4 border-l-amber-600'
		},
		NORMAL: {
			badge: 'bg-slate-100 text-slate-700 border border-slate-300',
			border: 'border-l-4 border-l-slate-300'
		}
	};

	async function carregarFilaMedico() {
		carregando = true;
		erro = '';
		try {
			const res = await api.ubs.listarFila({
				medicoId: auth.me?.id || undefined
			});
			itens = res.itens;
			total = res.total;
			aguardando = res.aguardando;
			chamados = res.chamados;
			emAtendimento = res.emAtendimento;
			concluidos = res.concluidos;
		} catch (e) {
			erro = 'Falha ao carregar atendimentos do consultório.';
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarFilaMedico();

		const timer = setInterval(() => {
			if (!modalSoapAberto) {
				carregarFilaMedico();
			}
		}, 5000);

		return () => clearInterval(timer);
	});

	let proximoPaciente = $derived(
		itens.find((i) => i.status === 'AGUARDANDO') ?? null
	);

	let pacienteChamadoAtual = $derived(
		itens.find((i) => i.status === 'CHAMADO' || i.status === 'EM_ATENDIMENTO') ?? null
	);

	async function chamarPaciente(item: AtendimentoUbsItem) {
		erro = '';
		try {
			await api.ubs.chamarPaciente(item.id, {
				consultorio: meuConsultorio
			});
			sucesso = `Chamada acionada no Painel de TV: ${item.pacienteNome} → ${meuConsultorio}`;
			setTimeout(() => (sucesso = ''), 5000);
			await carregarFilaMedico();
		} catch (e) {
			erro = 'Falha ao chamar paciente no painel de TV.';
		}
	}

	async function iniciarConsulta(item: AtendimentoUbsItem) {
		erro = '';
		try {
			await api.ubs.atualizarStatus(item.id, {
				status: 'EM_ATENDIMENTO',
				consultorio: meuConsultorio
			});
			pacienteAtendimentoAtual = item;
			soapSubjetivo = item.queixaBreve ? `Queixa informada na recepção: ${item.queixaBreve}` : '';
			soapObjetivo = '';
			soapAvaliacaoCid = '';
			soapPlanoConduta = '';
			modalSoapAberto = true;
			await carregarFilaMedico();
		} catch (e) {
			erro = 'Falha ao iniciar consulta.';
		}
	}

	async function registrarFalta(item: AtendimentoUbsItem) {
		if (!confirm(`Confirmar ausência / falta do paciente ${item.pacienteNome}?`)) return;
		try {
			await api.ubs.atualizarStatus(item.id, {
				status: 'FALTOU'
			});
			sucesso = `Falta registrada para ${item.pacienteNome}.`;
			setTimeout(() => (sucesso = ''), 4000);
			await carregarFilaMedico();
		} catch (e) {
			erro = 'Falha ao registrar falta.';
		}
	}

	async function finalizarConsultaSoap() {
		if (!pacienteAtendimentoAtual) return;
		salvandoSoap = true;
		erro = '';
		try {
			await api.ubs.atualizarStatus(pacienteAtendimentoAtual.id, {
				status: 'CONCLUIDO',
				observacao: soapPlanoConduta || undefined
			});
			modalSoapAberto = false;
			sucesso = `Atendimento de ${pacienteAtendimentoAtual.pacienteNome} concluído com sucesso!`;
			pacienteAtendimentoAtual = null;
			setTimeout(() => (sucesso = ''), 4000);
			await carregarFilaMedico();
		} catch (e) {
			erro = 'Falha ao concluir atendimento no sistema.';
		} finally {
			salvandoSoap = false;
		}
	}
</script>

<div class="flex flex-col gap-5 font-mono">
	{#if erro}
		<div class="border border-red-700 bg-red-50 p-3 text-xs font-bold text-red-900">
			⚠ {erro}
		</div>
	{/if}

	{#if sucesso}
		<div class="border border-emerald-700 bg-emerald-50 p-3 text-xs font-bold text-emerald-900">
			✓ {sucesso}
		</div>
	{/if}

	<!-- Barra do Consultório do Médico -->
	<div
		class="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-gradient-to-r from-blue-900 to-slate-900 p-4 text-white shadow-sm"
	>
		<div>
			<div class="text-[11px] font-bold tracking-widest text-blue-200 uppercase">
				Consultório Digital · UBS Atenção Primária
			</div>
			<div class="text-base font-black tracking-wide">
				{auth.me?.nome ?? 'Médico da UBS'}
				<span class="text-xs font-normal text-blue-200">· {auth.me?.cargo ?? 'Corpo Clínico'}</span>
			</div>
		</div>

		<div class="flex items-center gap-3">
			<div class="flex items-center gap-2 bg-blue-950/60 px-3 py-1.5 border border-blue-800">
				<span class="text-[10px] font-bold tracking-wider text-blue-300 uppercase">Meu Local:</span>
				<select
					bind:value={meuConsultorio}
					class="bg-blue-900 text-xs font-bold text-white border-0 focus:outline-none cursor-pointer"
				>
					<option value="Consultório 01">Consultório 01</option>
					<option value="Consultório 02">Consultório 02</option>
					<option value="Consultório 03">Consultório 03</option>
					<option value="Sala de Triagem">Sala de Triagem</option>
					<option value="Consultório Odontológico">Consultório Odontológico</option>
				</select>
			</div>

			<a
				href="/ubs/recepcao/painel"
				target="_blank"
				class="border border-white/40 bg-white/10 px-3 py-1.5 text-xs font-bold text-white uppercase hover:bg-white/20 transition"
			>
				📺 Painel TV
			</a>
		</div>
	</div>

	<!-- Métricas do Dia -->
	<section class="grid grid-cols-2 gap-3 md:grid-cols-5">
		<MetricCard label="Total Designado" value={total} sublabel="Atendimentos hoje" />
		<MetricCard
			label="Na Fila"
			value={aguardando}
			sublabel="Aguardando chamada"
			accent="warning"
		/>
		<MetricCard label="Chamado Agora" value={chamados} sublabel="Em deslocamento" accent="warning" />
		<MetricCard
			label="Em Consulta"
			value={emAtendimento}
			sublabel="No consultório"
			accent="success"
		/>
		<MetricCard label="Concluídos" value={concluidos} sublabel="Atendidos hoje" />
	</section>

	<!-- Bloco de Destaque: Chamada do Próximo Paciente -->
	{#if pacienteChamadoAtual}
		<div class="border-2 border-blue-900 bg-blue-50/70 p-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<span
						class="inline-block bg-blue-900 px-2 py-0.5 text-[10px] font-black text-white uppercase tracking-wider"
					>
						{pacienteChamadoAtual.status === 'EM_ATENDIMENTO'
							? 'EM CONSULTA ATUALMENTE'
							: 'PACIENTE CHAMADO · AGUARDANDO ENTRADA'}
					</span>
					<div class="mt-1 text-lg font-black text-slate-900">
						{pacienteChamadoAtual.senha} · {pacienteChamadoAtual.pacienteNome}
					</div>
					<div class="text-xs text-slate-600">
						CPF: {pacienteChamadoAtual.pacienteCpf} · {TIPO_ATENDIMENTO_LABEL[pacienteChamadoAtual.tipoAtendimento]} · {PRIORIDADE_LABEL[pacienteChamadoAtual.prioridade]}
					</div>
				</div>

				<div class="flex items-center gap-2">
					{#if pacienteChamadoAtual.status === 'CHAMADO'}
						<button
							type="button"
							onclick={() => chamarPaciente(pacienteChamadoAtual!)}
							class="border border-blue-900 bg-white px-3 py-2 text-xs font-bold text-blue-900 uppercase hover:bg-blue-100"
						>
							📢 Re-chamar TV
						</button>
						<button
							type="button"
							onclick={() => iniciarConsulta(pacienteChamadoAtual!)}
							class="border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-bold text-white uppercase hover:bg-emerald-800"
						>
							▶ Iniciar Consulta / PEC
						</button>
					{:else}
						<button
							type="button"
							onclick={() => {
								pacienteAtendimentoAtual = pacienteChamadoAtual;
								modalSoapAberto = true;
							}}
							class="border border-blue-900 bg-blue-900 px-4 py-2 text-xs font-bold text-white uppercase hover:bg-blue-800"
						>
							📋 Continuar Registro SOAP
						</button>
					{/if}

					<button
						type="button"
						onclick={() => registrarFalta(pacienteChamadoAtual!)}
						class="border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 uppercase hover:bg-red-50"
					>
						✕ Ausência
					</button>
				</div>
			</div>
		</div>
	{:else if proximoPaciente}
		<div class="border border-amber-400 bg-amber-50/60 p-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<span
						class="inline-block bg-amber-600 px-2 py-0.5 text-[10px] font-black text-white uppercase tracking-wider"
					>
						PRÓXIMO NA FILA DE ESPERA (RECOMENDADO)
					</span>
					<div class="mt-1 text-base font-black text-slate-900">
						{proximoPaciente.senha} · {proximoPaciente.pacienteNome}
					</div>
					<div class="text-xs text-slate-700">
						Prioridade: <strong>{PRIORIDADE_LABEL[proximoPaciente.prioridade]}</strong> ·
						Chegada: {new Date(proximoPaciente.horarioChegada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
						{#if proximoPaciente.queixaBreve}
							· Queixa: "{proximoPaciente.queixaBreve}"
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={() => chamarPaciente(proximoPaciente!)}
						class="border-2 border-blue-900 bg-blue-900 px-5 py-2.5 text-xs font-black text-white uppercase tracking-wider hover:bg-blue-800 shadow-sm"
					>
						📢 Chamar Paciente Agora
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Lista Completa da Fila do Consultório -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Fila de Espera do Seu Consultório"
			subtitle="Ordenação Inteligente SUS (Urgência > 80+ > Prioritários > Demanda Geral)"
			index="01"
		>
			<button
				type="button"
				onclick={carregarFilaMedico}
				class="border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 uppercase"
			>
				↻ Atualizar Fila
			</button>
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-left text-xs">
				<thead>
					<tr class="border-b border-slate-200 bg-slate-100 text-[10px] tracking-wider text-slate-600 uppercase">
						<th class="px-3 py-2.5">Posição & Senha</th>
						<th class="px-3 py-2.5">Prioridade</th>
						<th class="px-3 py-2.5">Paciente</th>
						<th class="px-3 py-2.5">Chegada</th>
						<th class="px-3 py-2.5">Serviço / Queixa</th>
						<th class="px-3 py-2.5 text-center">Status</th>
						<th class="px-3 py-2.5 text-right">Ação Rápida</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#if carregando && itens.length === 0}
						<tr>
							<td colspan="7" class="p-8 text-center text-slate-500">
								Carregando lista de atendimentos do consultório...
							</td>
						</tr>
					{:else if itens.length === 0}
						<tr>
							<td colspan="7" class="p-8 text-center text-slate-500">
								Nenhum atendimento na fila do consultório no momento.
							</td>
						</tr>
					{:else}
						{#each itens as item, idx (item.id)}
							<tr
								class="hover:bg-blue-50/40 transition-colors {prioridadeCores[item.prioridade].border}"
							>
								<!-- Senha & Posição -->
								<td class="px-3 py-2.5">
									<div class="font-mono text-sm font-black text-slate-900">
										#{idx + 1} · {item.senha}
									</div>
								</td>

								<!-- Prioridade -->
								<td class="px-3 py-2.5">
									<span
										class="inline-block px-2 py-0.5 text-[10px] uppercase {prioridadeCores[item.prioridade].badge}"
									>
										{PRIORIDADE_LABEL[item.prioridade]}
									</span>
								</td>

								<!-- Paciente -->
								<td class="px-3 py-2.5">
									<div class="font-bold text-slate-900">{item.pacienteNome}</div>
									<div class="text-[10px] text-slate-500">
										CPF: {item.pacienteCpf}
										{#if item.pacienteCartaoSus}
											· CNS: {item.pacienteCartaoSus}
										{/if}
									</div>
								</td>

								<!-- Horário Chegada -->
								<td class="px-3 py-2.5 text-slate-700">
									{new Date(item.horarioChegada).toLocaleTimeString('pt-BR', {
										hour: '2-digit',
										minute: '2-digit'
									})}
								</td>

								<!-- Queixa / Serviço -->
								<td class="px-3 py-2.5">
									<div class="font-medium text-slate-800">
										{TIPO_ATENDIMENTO_LABEL[item.tipoAtendimento]}
									</div>
									{#if item.queixaBreve}
										<div class="truncate text-[10px] text-slate-500 italic max-w-xs">
											"{item.queixaBreve}"
										</div>
									{/if}
								</td>

								<!-- Status -->
								<td class="px-3 py-2.5 text-center">
									<span
										class="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider
										{item.status === 'AGUARDANDO' ? 'bg-amber-100 text-amber-900' : ''}
										{item.status === 'CHAMADO' ? 'bg-blue-600 text-white font-black' : ''}
										{item.status === 'EM_ATENDIMENTO' ? 'bg-emerald-700 text-white font-black' : ''}
										{item.status === 'CONCLUIDO' ? 'bg-slate-100 text-slate-700' : ''}
										{item.status === 'FALTOU' ? 'bg-red-50 text-red-800' : ''}"
									>
										{item.status}
									</span>
								</td>

								<!-- Ações -->
								<td class="px-3 py-2.5 text-right">
									<div class="flex items-center justify-end gap-1.5">
										{#if item.status === 'AGUARDANDO'}
											<button
												type="button"
												onclick={() => chamarPaciente(item)}
												class="border border-blue-900 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-900 hover:bg-blue-900 hover:text-white transition"
											>
												📢 Chamar TV
											</button>
										{/if}

										{#if item.status === 'CHAMADO'}
											<button
												type="button"
												onclick={() => iniciarConsulta(item)}
												class="border border-emerald-700 bg-emerald-700 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-800 transition"
											>
												▶ Atender
											</button>
										{/if}

										{#if item.status === 'EM_ATENDIMENTO'}
											<button
												type="button"
												onclick={() => {
													pacienteAtendimentoAtual = item;
													modalSoapAberto = true;
												}}
												class="border border-blue-900 bg-blue-900 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-blue-800 transition"
											>
												📋 SOAP
											</button>
										{/if}

										<a
											href="/ubs/pacientes/{item.pacienteId}"
											target="_blank"
											title="Abrir Prontuário PEC Completo do Cidadão"
											class="border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
										>
											📂 PEC
										</a>
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Modal Prontuário Clínico SOAP -->
{#if modalSoapAberto && !!pacienteAtendimentoAtual}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-mono text-xs">
		<div class="w-full max-w-2xl border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
				<div class="font-bold uppercase tracking-wider text-xs">Prontuário de Atendimento Clínico (SOAP) · UBS</div>
				<button onclick={() => (modalSoapAberto = false)} class="text-slate-400 hover:text-white font-bold text-sm">✕</button>
			</div>

			<div class="p-5">
				<form onsubmit={(e) => { e.preventDefault(); finalizarConsultaSoap(); }} class="flex flex-col gap-4 font-mono text-xs">
					<div class="border border-blue-300 bg-blue-50/60 p-3">
						<div class="text-sm font-black text-slate-900">
							{pacienteAtendimentoAtual.pacienteNome}
						</div>
						<div class="text-[11px] text-slate-600">
							CPF: {pacienteAtendimentoAtual.pacienteCpf} · Senha: {pacienteAtendimentoAtual.senha} · {TIPO_ATENDIMENTO_LABEL[pacienteAtendimentoAtual.tipoAtendimento]}
						</div>
					</div>

					<!-- Registro Estruturado SOAP -->
					<div>
						<label for="f-subjetivo" class="mb-1 block text-[10px] font-bold text-slate-700 uppercase">
							S · Subjetivo (Queixa Principal, Anamnese e História Atual)
						</label>
						<textarea
							id="f-subjetivo"
							bind:value={soapSubjetivo}
							rows="3"
							placeholder="Relato do paciente, início dos sintomas, queixa principal..."
							class="w-full border border-slate-300 p-2 text-xs focus:border-blue-900 focus:outline-none"
						></textarea>
					</div>

					<div>
						<label for="f-objetivo" class="mb-1 block text-[10px] font-bold text-slate-700 uppercase">
							O · Objetivo (Exame Físico, Sinais Vitais, PA, FC, Ausculta)
						</label>
						<textarea
							id="f-objetivo"
							bind:value={soapObjetivo}
							rows="3"
							placeholder="PA: 120/80 mmHg, FC: 75 bpm, Estado geral bom, acianótico..."
							class="w-full border border-slate-300 p-2 text-xs focus:border-blue-900 focus:outline-none"
						></textarea>
					</div>

					<div>
						<label for="f-cid" class="mb-1 block text-[10px] font-bold text-slate-700 uppercase">
							A · Avaliação / Hipótese Diagnóstica (CID-10)
						</label>
						<input
							id="f-cid"
							type="text"
							bind:value={soapAvaliacaoCid}
							placeholder="Ex: I10 - Hipertensão essencial (primária) ou J00 - Rinofaringite aguda"
							class="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
						/>
					</div>

					<div>
						<label for="f-plano" class="mb-1 block text-[10px] font-bold text-slate-700 uppercase">
							P · Plano / Conduta Médica (Prescrição, Orientações e Encaminhamentos)
						</label>
						<textarea
							id="f-plano"
							bind:value={soapPlanoConduta}
							rows="3"
							placeholder="Prescrição de medicamentos, exames solicitados, orientações gerais..."
							class="w-full border border-slate-300 p-2 text-xs focus:border-blue-900 focus:outline-none"
						></textarea>
					</div>

					<div class="flex items-center justify-between border-t border-slate-200 pt-3">
						<a
							href="/ubs/novo-encaminhamento"
							target="_blank"
							class="border border-purple-700 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-900 hover:bg-purple-100"
						>
							↗ Solicitar Encaminhamento Especializado
						</a>

						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => (modalSoapAberto = false)}
								class="border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 uppercase hover:bg-slate-100"
							>
								Salvar Rascunho
							</button>
							<button
								type="submit"
								disabled={salvandoSoap}
								class="border border-emerald-700 bg-emerald-700 px-5 py-2 text-xs font-bold text-white uppercase hover:bg-emerald-800 disabled:opacity-50"
							>
								{salvandoSoap ? 'Finalizando...' : '✓ Concluir Atendimento'}
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
