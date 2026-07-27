<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento, PrioridadeClinica, StatusAtendimentoCentro } from '$lib/api/types';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';

	let encaminhamentos = $state<Encaminhamento[]>([]);
	let carregando = $state(true);
	let erro = $state('');

	// Seletor de Data da Agenda
	let dataAgenda = $state(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD (hoje)

	// Filtros adicionais
	let busca = $state('');
	let filtroEspecialidade = $state('TODAS');

	// Paginação
	let paginaAtual = $state(1);
	let itensPorPagina = $state(20);

	// Estado de cancelamento
	let processandoDesmarcar = $state(false);

	async function carregarAgenda() {
		carregando = true;
		erro = '';
		try {
			// Tenta consumir endpoint v3.0.0 de agenda do dia do Centro (centro-doc-back.md)
			try {
				const resCentro = await api.centroRecepcao.listAgendaDia({
					data: dataAgenda
				});
				if (resCentro && Array.isArray(resCentro.agendamentos) && resCentro.agendamentos.length > 0) {
					encaminhamentos = resCentro.agendamentos as any[];
					return;
				}
			} catch (errAgenda) {
				console.info('[UniSISM] Endpoint /v1/centro/recepcao/agenda-dia em transição — usando fallback /v1/encaminhamentos', errAgenda);
			}

			// Fallback para API geral de encaminhamentos
			const res = await api.encaminhamentos.list({ status: 'APROVADO', limit: 1000 });
			encaminhamentos = res.filter(e => e.filaDestino === 'CENTRO_ESPECIALIDADES');
		} catch (e) {
			console.error(e);
			erro = 'Falha ao carregar agenda do dia.';
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarAgenda();
	});

	// Filtrar os agendados da data selecionada
	let agendadosDaData = $derived(
		encaminhamentos.filter(e => e.agendamentoPrevisto === dataAgenda)
	);

	// Lista de especialidades presentes na data para popular filtro
	let listaEspecialidades = $derived.by(() => {
		const sets = new Set(agendadosDaData.map(e => e.solicitacao.especialidadeSolicitada).filter(Boolean));
		return [...sets].sort();
	});

	// Filtragem local
	let filtrados = $derived.by(() => {
		return agendadosDaData.filter(e => {
			if (filtroEspecialidade !== 'TODAS' && e.solicitacao.especialidadeSolicitada !== filtroEspecialidade) {
				return false;
			}
			if (busca.trim()) {
				const q = busca.toLowerCase();
				return (
					e.paciente.nome.toLowerCase().includes(q) ||
					e.paciente.cpf.includes(q) ||
					e.protocolo.toLowerCase().includes(q) ||
					e.solicitacao.cid10.toLowerCase().includes(q)
				);
			}
			return true;
		});
	});

	// Ordenação por Horário da Consulta extraído da nota
	function extrairHorario(nota: string | undefined): string {
		if (!nota) return '00:00';
		// Busca padrões como HH:MM na nota
		const match = nota.match(/(\d{2}:\d{2})/);
		return match ? match[1] : '00:00';
	}

	let ordenados = $derived.by(() => {
		let res = [...filtrados];
		res.sort((a, b) => {
			const horaA = extrairHorario(a.observacoesRegulacao);
			const horaB = extrairHorario(b.observacoesRegulacao);
			return horaA.localeCompare(horaB);
		});
		return res;
	});

	// Paginação
	let totalPaginas = $derived(Math.ceil(ordenados.length / itensPorPagina));
	let paginaExibida = $derived(Math.min(paginaAtual, Math.max(1, totalPaginas)));
	let paginados = $derived(ordenados.slice((paginaExibida - 1) * itensPorPagina, paginaExibida * itensPorPagina));

	// Resetar página quando filtros mudam
	$effect(() => {
		const _ = [filtroEspecialidade, busca, dataAgenda];
		paginaAtual = 1;
	});

	// Desmarcar consulta (retornar para fila)
	async function desmarcarConsulta(enc: Encaminhamento) {
		if (!confirm(`Confirmar cancelamento do agendamento de ${enc.paciente.nome}? O paciente retornará para a fila de regulação.`)) {
			return;
		}

		processandoDesmarcar = true;
		try {
			try {
				await api.centroRecepcao.desmarcarReagendar(enc.id, {
					acao: 'DESMARCAR',
					motivo: 'Consulta desmarcada na recepção do Centro.'
				});
			} catch (errDesmarcar) {
				console.info('[UniSISM] Endpoint /v1/centro/recepcao/desmarcar-reagendar em transição — usando fallback aprovar', errDesmarcar);
				await api.encaminhamentos.aprovar(enc.id, {
					filaDestino: 'CENTRO_ESPECIALIDADES',
					agendamentoPrevisto: undefined,
					nota: 'Consulta desmarcada na recepção do Centro.'
				});
			}
			await carregarAgenda();
		} catch (e) {
			console.error(e);
			alert('Falha ao desmarcar consulta.');
		} finally {
			processandoDesmarcar = false;
		}
	}

	async function registrarPresencaRecepcao(enc: Encaminhamento, status: StatusAtendimentoCentro) {
		try {
			await api.centroRecepcao.confirmarPresenca(enc.id, {
				status,
				observacao: 'Status/Presença atualizada pela Recepção do Centro.'
			});
			await carregarAgenda();
		} catch (e) {
			console.error('Falha ao registrar presença:', e);
		}
	}

	function imprimirComprovante(enc: Encaminhamento) {
		alert(`Comprovante de Agendamento:\n\nProtocolo: ${enc.protocolo}\nPaciente: ${enc.paciente.nome}\nData: ${formatarData(enc.agendamentoPrevisto)}\nDetalhes: ${enc.observacoesRegulacao || 'Não informado'}\n\n[Impressão simulada]`);
	}

	function formatarData(isoStr: string | null | undefined) {
		if (!isoStr) return '—';
		const d = new Date(isoStr + 'T12:00:00');
		return d.toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	}

	// Métricas da agenda do dia
	let totalAgendados = $derived(agendadosDaData.length);
</script>

<div class="flex flex-col gap-4 font-mono text-xs">
	<!-- Métricas da Agenda -->
	<section class="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] tracking-widest text-slate-500 uppercase">Consultas Agendadas</div>
			<div class="mt-2 text-3xl font-bold text-slate-900">{carregando ? '—' : totalAgendados}</div>
			<div class="text-[11px] text-slate-600 mt-1">Pacientes programados para a data selecionada</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] tracking-widest text-slate-500 uppercase">Data da Agenda</div>
			<div class="mt-2 text-xl font-bold text-blue-900 flex items-center gap-2">
				<input
					type="date"
					bind:value={dataAgenda}
					class="border border-slate-350 bg-white px-2 py-1 outline-none text-sm text-slate-900 focus:border-blue-900"
				/>
			</div>
			<div class="text-[11px] text-slate-600 mt-1">Selecione o dia para consultar a demanda</div>
		</div>
	</section>

	<!-- Filtros da Agenda -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Filtros da Agenda Diária" index="01">
			<button 
				type="button" 
				onclick={carregarAgenda}
				disabled={carregando}
				class="border border-slate-300 bg-white px-2 py-0.5 font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 disabled:opacity-50"
			>
				{carregando ? 'Carregando...' : 'Atualizar Agenda'}
			</button>
		</PanelHeader>

		<div class="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
			<div class="flex flex-col gap-1">
				<label for="busca-paciente" class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Buscar Paciente
				</label>
				<input
					id="busca-paciente"
					type="text"
					bind:value={busca}
					placeholder="Nome, CPF, Protocolo..."
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-sans text-sm"
				/>
			</div>

			<div class="flex flex-col gap-1">
				<label for="filtro-esp" class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Especialidade
				</label>
				<select
					id="filtro-esp"
					bind:value={filtroEspecialidade}
					class="w-full border border-slate-300 bg-white px-2 py-1.5 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-sans"
				>
					<option value="TODAS">TODAS AS ESPECIALIDADES</option>
					{#each listaEspecialidades as esp}
						<option value={esp}>{esp.toUpperCase()}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<!-- Tabela de Pacientes Agendados -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Pacientes Agendados para o Dia" index="02">
			<span class="border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600 uppercase">
				{ordenados.length} Programados
			</span>
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
						<th class="border-r border-slate-200 px-3 py-2">Horário</th>
						<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
						<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
						<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
						<th class="border-r border-slate-200 px-3 py-2">Prioridade</th>
						<th class="border-r border-slate-200 px-3 py-2">Agenda / Especialista</th>
						<th class="px-3 py-2 text-center">Ações</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(6) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="7" class="px-3 py-3.5">
									<div class="h-3.5 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if paginados.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhuma consulta agendada para a data selecionada.
							</td>
						</tr>
					{:else}
						{#each paginados as enc (enc.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900 text-sm">
									{extrairHorario(enc.observacoesRegulacao)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{enc.protocolo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900">
									<div>{enc.paciente.nome}</div>
									<div class="font-mono text-[10px] text-slate-500">{enc.paciente.cpf}</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900 font-semibold">
									{enc.solicitacao.especialidadeSolicitada}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<StatusBadge prioridade={enc.solicitacao.prioridade} />
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-700 max-w-xs truncate" title={enc.observacoesRegulacao || ''}>
									{enc.observacoesRegulacao || '—'}
								</td>
								<td class="px-3 py-2 text-center flex items-center justify-center gap-1.5 whitespace-nowrap">
									<button
										type="button"
										onclick={() => imprimirComprovante(enc)}
										class="border border-slate-300 bg-white hover:bg-slate-50 px-2 py-1 font-bold text-[10px] uppercase font-mono tracking-wider"
									>
										Imprimir
									</button>
									<button
										type="button"
										disabled={processandoDesmarcar}
										onclick={() => desmarcarConsulta(enc)}
										class="border border-red-700 bg-white text-red-700 hover:bg-red-50 px-2 py-1 font-bold text-[10px] uppercase font-mono tracking-wider disabled:opacity-50"
									>
										Cancelar
									</button>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- Paginação -->
		{#if totalPaginas > 1}
			<div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-600">
				<div>
					Exibindo {(paginaExibida - 1) * itensPorPagina + 1} - {Math.min(paginaExibida * itensPorPagina, ordenados.length)} de {ordenados.length}
				</div>
				<div class="flex items-center gap-1">
					<button
						type="button"
						disabled={paginaExibida === 1}
						onclick={() => paginaAtual = paginaExibida - 1}
						class="border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
					>
						&larr; Ant
					</button>
					<span class="px-3 py-1 border border-slate-300 bg-white text-slate-900">
						{paginaExibida} / {totalPaginas}
					</span>
					<button
						type="button"
						disabled={paginaExibida >= totalPaginas}
						onclick={() => paginaAtual = paginaExibida + 1}
						class="border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
					>
						Próx &rarr;
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	select, input, button {
		border-radius: 0 !important;
	}
</style>
