<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento, FilaDestino, PrioridadeClinica } from '$lib/api/types';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import { goto } from '$app/navigation';

	// ─────────── Estado dos dados ───────────
	let encaminhamentos = $state<Encaminhamento[]>([]);
	let carregando = $state(true);
	let _erro = $state('');

	// ─────────── Estado dos filtros ───────────
	let filtroEspecialidade = $state('TODAS');
	let filtroUbs = $state('TODAS');
	let filtroPrioridade = $state('TODAS');
	let filtroStatus = $state('AGUARDANDO_REGULACAO'); // Padrão: recebidos aguardando
	let filtroData = $state(''); // YYYY-MM-DD da chegada

	// Opções de ordenação
	let criterioOrdenacao = $state<
		'clinico' | 'chegada-antigo' | 'chegada-recente' | 'prioridade-so'
	>('clinico');

	// ─────────── Seleção para lote ───────────
	let selecionados = $state<Record<string, boolean>>({});

	// ─────────── Paginação ───────────
	let paginaAtual = $state(1);
	let itensPorPagina = $state(50);

	// ─────────── Processamento em lote ───────────
	let modalAprovacaoLote = $state(false);
	let filaDestinoLote = $state<FilaDestino>('SUS');
	let notaLote = $state('');
	let agendamentoLote = $state('');
	let processandoLote = $state(false);
	let progressoLote = $state({ atual: 0, total: 0 });
	let logsLote = $state<{ protocolo: string; status: 'ok' | 'erro'; erro?: string }[]>([]);
	let resultadoLoteVisivel = $state(false);

	// Carregar dados na montagem
	async function carregarEncaminhamentos() {
		carregando = true;
		_erro = '';
		selecionados = {};
		try {
			// Carrega até 100 encaminhamentos para permitir filtragem local densa de alta performance
			encaminhamentos = await api.encaminhamentos.list({ limit: 100 });
		} catch (e) {
			console.error(e);
			_erro = 'Falha ao carregar fila de regulação. Verifique sua conexão.';
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarEncaminhamentos();
	});

	// Extrair listas únicas dos dados para popular filtros automaticamente
	let listaEspecialidades = $derived.by(() => {
		const sets = new Set(
			encaminhamentos.map((e) => e.solicitacao.especialidadeSolicitada).filter(Boolean)
		);
		return [...sets].sort();
	});

	let listaUbs = $derived.by(() => {
		const sets = new Set(encaminhamentos.map((e) => e.unidadeOrigem).filter(Boolean));
		return [...sets].sort();
	});

	// Função de filtragem
	let filtrados = $derived.by(() => {
		return encaminhamentos.filter((e) => {
			// Filtro de Especialidade
			if (
				filtroEspecialidade !== 'TODAS' &&
				e.solicitacao.especialidadeSolicitada !== filtroEspecialidade
			) {
				return false;
			}
			// Filtro de UBS
			if (filtroUbs !== 'TODAS' && e.unidadeOrigem !== filtroUbs) {
				return false;
			}
			// Filtro de Prioridade
			if (filtroPrioridade !== 'TODAS' && e.solicitacao.prioridade !== filtroPrioridade) {
				return false;
			}
			// Filtro de Status
			if (filtroStatus !== 'TODAS' && e.status !== filtroStatus) {
				return false;
			}
			// Filtro de Data de chegada (comparando ano, mês e dia da string ISO)
			if (filtroData) {
				const dataCriado = e.criadoEm.substring(0, 10); // YYYY-MM-DD
				if (dataCriado !== filtroData) {
					return false;
				}
			}
			return true;
		});
	});

	// Prioridade clínica para pesos numéricos
	const prioridadePeso: Record<PrioridadeClinica, number> = {
		EMERGENCIA: 4,
		URGENTE: 3,
		PRIORITARIA: 2,
		ELETIVA: 1
	};

	function obterDataDia(isoStr: string): string {
		return isoStr.substring(0, 10);
	}

	// Ordenação final
	let ordenados = $derived.by(() => {
		let res = [...filtrados];
		if (criterioOrdenacao === 'clinico') {
			res.sort((a, b) => {
				// 1. Por dia de chegada (mais antigo primeiro para não gerar backlog infinito)
				const diaA = obterDataDia(a.criadoEm);
				const diaB = obterDataDia(b.criadoEm);
				if (diaA !== diaB) {
					return diaA.localeCompare(diaB);
				}
				// 2. Por prioridade clínica (mais críticos primeiro)
				const pesoA = prioridadePeso[a.solicitacao.prioridade] ?? 0;
				const pesoB = prioridadePeso[b.solicitacao.prioridade] ?? 0;
				if (pesoA !== pesoB) {
					return pesoB - pesoA;
				}
				// 3. Por hora de chegada exata (FIFO dentro do mesmo bloco)
				return new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
			});
		} else if (criterioOrdenacao === 'chegada-antigo') {
			res.sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime());
		} else if (criterioOrdenacao === 'chegada-recente') {
			res.sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
		} else if (criterioOrdenacao === 'prioridade-so') {
			res.sort((a, b) => {
				const pesoA = prioridadePeso[a.solicitacao.prioridade] ?? 0;
				const pesoB = prioridadePeso[b.solicitacao.prioridade] ?? 0;
				if (pesoA !== pesoB) {
					return pesoB - pesoA;
				}
				return new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
			});
		}
		return res;
	});

	let totalPaginas = $derived(Math.ceil(ordenados.length / itensPorPagina));
	let paginaExibida = $derived(Math.min(paginaAtual, Math.max(1, totalPaginas)));
	let paginados = $derived(
		ordenados.slice((paginaExibida - 1) * itensPorPagina, paginaExibida * itensPorPagina)
	);

	// Resetar para a primeira página quando os filtros mudam
	$effect(() => {
		// Registra dependências nos filtros
		const _ = [
			filtroEspecialidade,
			filtroUbs,
			filtroPrioridade,
			filtroStatus,
			filtroData,
			criterioOrdenacao
		];
		paginaAtual = 1;
	});

	// IDs atualmente selecionados
	let idsSelecionados = $derived(
		Object.keys(selecionados).filter((id) => selecionados[id] && ordenados.some((e) => e.id === id))
	);

	// Selecionar / Deselecionar tudo
	let todosSelecionados = $derived(
		ordenados.length > 0 && ordenados.every((e) => selecionados[e.id])
	);

	function toggleSelecionarTodos() {
		if (todosSelecionados) {
			ordenados.forEach((e) => {
				selecionados[e.id] = false;
			});
		} else {
			ordenados.forEach((e) => {
				selecionados[e.id] = true;
			});
		}
	}

	function limparSelecao() {
		selecionados = {};
	}

	// Abrir modal de aprovação em lote
	function abrirModalLote() {
		if (idsSelecionados.length === 0) return;

		// Sugere CEO se a maioria for odonto
		const qtdOdonto = idsSelecionados.filter((id) => {
			const enc = encaminhamentos.find((e) => e.id === id);
			return enc?.solicitacao.especialidadeSolicitada?.toUpperCase().includes('ODONTO') || false;
		}).length;

		filaDestinoLote = qtdOdonto > idsSelecionados.length / 2 ? 'CEO' : 'SUS';
		notaLote = '';
		agendamentoLote = '';
		logsLote = [];
		modalAprovacaoLote = true;
		resultadoLoteVisivel = false;
	}

	// Executar aprovação em lote
	async function executarAprovacaoLote() {
		processandoLote = true;
		progressoLote = { atual: 0, total: idsSelecionados.length };
		logsLote = [];

		for (const id of idsSelecionados) {
			const enc = encaminhamentos.find((e) => e.id === id);
			if (!enc) continue;

			try {
				await api.encaminhamentos.aprovar(id, {
					filaDestino: filaDestinoLote,
					nota: notaLote.trim() || undefined,
					agendamentoPrevisto: filaDestinoLote === 'SUS' ? agendamentoLote || undefined : undefined
				});
				logsLote = [...logsLote, { protocolo: enc.protocolo, status: 'ok' }];
			} catch (err) {
				let msg = 'Erro desconhecido';
				if (err instanceof ApiError) {
					msg = err.message || err.code;
				}
				logsLote = [...logsLote, { protocolo: enc.protocolo, status: 'erro', erro: msg }];
			}
			progressoLote = { ...progressoLote, atual: progressoLote.atual + 1 };
		}

		processandoLote = false;
		resultadoLoteVisivel = true;
		// Recarregar os dados para atualizar a fila e sumir com os já aprovados
		await carregarEncaminhamentos();
	}

	function fecharModalLote() {
		modalAprovacaoLote = false;
		resultadoLoteVisivel = false;
	}

	// Helpers de formatação
	function formatarDataHora(isoStr: string) {
		const d = new Date(isoStr);
		return d.toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function limparFiltroData() {
		filtroData = '';
	}
</script>

<div class="flex flex-col gap-4">
	<!-- Painel de Filtros Globais -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Filtros de Regulação" index="01">
			<button
				type="button"
				onclick={carregarEncaminhamentos}
				disabled={carregando}
				class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 hover:bg-slate-50 disabled:opacity-50"
			>
				{carregando ? 'CARREGANDO...' : 'ATUALIZAR FILA [U]'}
			</button>
		</PanelHeader>

		<div class="grid grid-cols-1 gap-3 p-4 font-mono text-xs md:grid-cols-5">
			<!-- Especialidade -->
			<div class="flex flex-col gap-1">
				<label
					for="filtro-esp"
					class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
				>
					Especialidade
				</label>
				<select
					id="filtro-esp"
					bind:value={filtroEspecialidade}
					class="w-full border border-slate-300 bg-white px-2 py-1.5 font-sans outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="TODAS">TODAS AS ESPECIALIDADES</option>
					{#each listaEspecialidades as esp (esp)}
						<option value={esp}>{esp.toUpperCase()}</option>
					{/each}
				</select>
			</div>

			<!-- Unidade de Origem (UBS) -->
			<div class="flex flex-col gap-1">
				<label
					for="filtro-ubs"
					class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
				>
					Posto / UBS de Origem
				</label>
				<select
					id="filtro-ubs"
					bind:value={filtroUbs}
					class="w-full border border-slate-300 bg-white px-2 py-1.5 font-sans outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="TODAS">TODOS OS POSTOS</option>
					{#each listaUbs as ubs (ubs)}
						<option value={ubs}>{ubs.toUpperCase()}</option>
					{/each}
				</select>
			</div>

			<!-- Data de Chegada -->
			<div class="flex flex-col gap-1">
				<label
					for="filtro-data"
					class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
				>
					Data de Chegada
				</label>
				<div class="flex gap-1">
					<input
						id="filtro-data"
						type="date"
						bind:value={filtroData}
						class="flex-1 border border-slate-300 bg-white px-2 py-1 font-mono outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					/>
					{#if filtroData}
						<button
							type="button"
							onclick={limparFiltroData}
							class="border border-slate-300 bg-white px-2 font-bold text-slate-600 hover:border-red-700 hover:text-red-700"
							title="Limpar data"
						>
							X
						</button>
					{/if}
				</div>
			</div>

			<!-- Prioridade -->
			<div class="flex flex-col gap-1">
				<label
					for="filtro-prio"
					class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
				>
					Prioridade
				</label>
				<select
					id="filtro-prio"
					bind:value={filtroPrioridade}
					class="w-full border border-slate-300 bg-white px-2 py-1.5 font-sans outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="TODAS">TODAS AS PRIORIDADES</option>
					<option value="EMERGENCIA">EMERGÊNCIA</option>
					<option value="URGENTE">URGENTE</option>
					<option value="PRIORITARIA">PRIORITÁRIA</option>
					<option value="ELETIVA">ELETIVA</option>
				</select>
			</div>

			<!-- Status -->
			<div class="flex flex-col gap-1">
				<label
					for="filtro-status"
					class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
				>
					Status Fila
				</label>
				<select
					id="filtro-status"
					bind:value={filtroStatus}
					class="w-full border border-slate-300 bg-white px-2 py-1.5 font-sans outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					<option value="TODAS">TODOS OS STATUS</option>
					<option value="AGUARDANDO_REGULACAO">AGUARDANDO REGULAÇÃO</option>
					<option value="PENDENCIA_DOCUMENTO">PENDÊNCIA DOCUMENTO</option>
					<option value="APROVADO">APROVADO</option>
					<option value="REJEITADO">REJEITADO</option>
				</select>
			</div>
		</div>
	</div>

	<!-- Barra de Ações em Lote (floating/alinhada) -->
	{#if idsSelecionados.length > 0}
		<div
			class="flex flex-col items-start justify-between gap-4 border-2 border-blue-900 bg-blue-50 p-4 font-mono text-xs md:flex-row md:items-center"
		>
			<div class="flex items-center gap-3">
				<span class="inline-block bg-blue-900 px-2.5 py-1 text-sm font-bold text-white">
					{idsSelecionados.length}
				</span>
				<div class="leading-tight">
					<div class="font-bold text-blue-900 uppercase">Selecionados para Decisão</div>
					<div class="text-[11px] text-slate-600">
						Aprovação em lote ativa para os itens marcados na tabela.
					</div>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={limparSelecao}
					class="border border-slate-300 bg-white px-3 py-2 font-bold text-slate-700 uppercase hover:border-slate-500 hover:bg-slate-100"
				>
					Cancelar Seleção [ESC]
				</button>
				<button
					type="button"
					onclick={abrirModalLote}
					class="border border-blue-900 bg-blue-900 px-4 py-2 font-bold text-white uppercase hover:bg-blue-950"
				>
					Aprovar em Lote [A]
				</button>
			</div>
		</div>
	{/if}

	<!-- Tabela de Encaminhamentos -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Fila Unificada de Regulação" index="02">
			<!-- Configuração de Ordenação -->
			<div class="flex items-center gap-2 font-mono text-xs">
				<label for="select-ordem" class="text-[10px] font-semibold text-slate-500 uppercase">
					Ordenado por:
				</label>
				<select
					id="select-ordem"
					bind:value={criterioOrdenacao}
					class="border border-slate-300 bg-white px-2 py-0.5 text-slate-700 outline-none focus:border-blue-900"
				>
					<option value="clinico">Fila Clínica (Dia + Prioridade)</option>
					<option value="chegada-antigo">Data de Envio (Antigos primeiro)</option>
					<option value="chegada-recente">Data de Envio (Recentes primeiro)</option>
					<option value="prioridade-so">Apenas Prioridade (Críticos primeiro)</option>
				</select>
				<span
					class="border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600 uppercase"
				>
					{ordenados.length} Registros
				</span>
			</div>
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
					>
						<!-- Checkbox para lote -->
						<th class="w-10 border-r border-slate-200 px-3 py-2.5 text-center">
							<input
								type="checkbox"
								checked={todosSelecionados}
								onchange={toggleSelecionarTodos}
								class="border-slate-300 text-blue-900 focus:ring-blue-900"
								aria-label="Selecionar todos os registros filtrados"
							/>
						</th>
						<th class="border-r border-slate-200 px-3 py-2">Data de Envio</th>
						<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
						<th class="border-r border-slate-200 px-3 py-2">UBS / Posto de Origem</th>
						<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
						<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
						<th class="border-r border-slate-200 px-3 py-2">CID-10</th>
						<th class="border-r border-slate-200 px-3 py-2">Prioridade</th>
						<th class="border-r border-slate-200 px-3 py-2">Status</th>
						<th class="px-3 py-2">Ação</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(8) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="10" class="px-3 py-3.5">
									<div class="h-3.5 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if ordenados.length === 0}
						<tr>
							<td colspan="10" class="px-3 py-16 text-center font-sans text-sm text-slate-500">
								Nenhum encaminhamento recebido atende aos filtros atuais.
							</td>
						</tr>
					{:else}
						{#each paginados as enc (enc.id)}
							{@const selecionado = !!selecionados[enc.id]}
							<tr
								class="border-b border-slate-100 transition-colors hover:bg-slate-50 {selecionado
									? 'bg-blue-50/30'
									: ''}"
							>
								<!-- Checkbox -->
								<td class="border-r border-slate-100 px-3 py-2.5 text-center">
									<input
										type="checkbox"
										bind:checked={selecionados[enc.id]}
										class="border-slate-300 text-blue-900 focus:ring-blue-900"
										aria-label="Selecionar protocolo {enc.protocolo}"
									/>
								</td>

								<!-- Data de Envio -->
								<td class="border-r border-slate-100 px-3 py-2 whitespace-nowrap text-slate-600">
									{formatarDataHora(enc.criadoEm)}
								</td>

								<!-- Protocolo -->
								<td
									class="border-r border-slate-100 px-3 py-2 font-bold whitespace-nowrap text-blue-900 underline decoration-blue-900/30 underline-offset-2"
								>
									<a href="/sms/encaminhamento/{enc.id}">{enc.protocolo}</a>
								</td>

								<!-- UBS / Posto -->
								<td
									class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-800"
								>
									{enc.unidadeOrigem}
								</td>

								<!-- Paciente -->
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
									<div class="font-semibold">{enc.paciente.nome}</div>
									<div class="font-mono text-[10px] text-slate-500">{enc.paciente.cpf}</div>
								</td>

								<!-- Especialidade -->
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900">
									{enc.solicitacao.especialidadeSolicitada}
								</td>

								<!-- CID-10 -->
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-700">
									{enc.solicitacao.cid10}
								</td>

								<!-- Prioridade -->
								<td class="border-r border-slate-100 px-3 py-2 whitespace-nowrap">
									<StatusBadge prioridade={enc.solicitacao.prioridade} />
								</td>

								<!-- Status -->
								<td class="border-r border-slate-100 px-3 py-2 whitespace-nowrap">
									<StatusBadge status={enc.status} />
								</td>

								<!-- Ação individual -->
								<td class="px-3 py-2 text-center whitespace-nowrap">
									<button
										type="button"
										onclick={() => goto(`/sms/encaminhamento/${enc.id}`)}
										class="border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 uppercase hover:border-blue-900 hover:text-blue-900"
									>
										Analisar
									</button>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- Rodapé com Paginação -->
		{#if totalPaginas > 1}
			<div
				class="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-600 sm:flex-row"
			>
				<div class="flex items-center gap-2">
					<span>Exibindo de</span>
					<span class="font-bold text-slate-900">{(paginaExibida - 1) * itensPorPagina + 1}</span>
					<span>a</span>
					<span class="font-bold text-slate-900"
						>{Math.min(paginaExibida * itensPorPagina, ordenados.length)}</span
					>
					<span>de</span>
					<span class="font-bold text-slate-900">{ordenados.length}</span>
					<span>registros</span>
				</div>

				<div class="flex items-center gap-2">
					<label
						for="select-limite"
						class="font-mono text-[10px] font-semibold text-slate-500 uppercase"
					>
						Por página:
					</label>
					<select
						id="select-limite"
						bind:value={itensPorPagina}
						class="border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-blue-900"
					>
						<option value={20}>20</option>
						<option value={50}>50</option>
						<option value={100}>100</option>
						<option value={200}>200</option>
					</select>

					<div class="ml-4 flex items-center gap-1">
						<button
							type="button"
							disabled={paginaExibida === 1}
							onclick={() => (paginaAtual = paginaExibida - 1)}
							class="border border-slate-300 bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-slate-700 uppercase hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-white"
						>
							&larr; Ant
						</button>
						<span
							class="border border-slate-300 bg-white px-3 py-1 font-mono text-[11px] text-slate-900"
						>
							{paginaExibida} / {totalPaginas}
						</span>
						<button
							type="button"
							disabled={paginaExibida >= totalPaginas}
							onclick={() => (paginaAtual = paginaExibida + 1)}
							class="border border-slate-300 bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-slate-700 uppercase hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-white"
						>
							Próx &rarr;
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Modal de Aprovação em Lote (B2G Brutalist Heavy Layout) -->
{#if modalAprovacaoLote}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 font-mono">
		<div
			class="w-full max-w-lg rounded-none border-2 border-slate-900 bg-white p-6 shadow-[8px_8px_0_rgba(15,23,42,0.15)]"
		>
			<div class="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
				<h2 class="text-base font-bold text-slate-900 uppercase">
					Decisão em Lote · {idsSelecionados.length} itens
				</h2>
				{#if !processandoLote && !resultadoLoteVisivel}
					<button
						type="button"
						onclick={fecharModalLote}
						class="font-bold text-slate-400 hover:text-slate-900"
					>
						[X] FECHAR
					</button>
				{/if}
			</div>

			{#if !resultadoLoteVisivel}
				<!-- Formulário de Aprovação -->
				<div class="flex flex-col gap-4 text-xs">
					<!-- Destinação -->
					<div class="flex flex-col gap-1.5">
						<label
							for="lote-fila"
							class="text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Encaminhar vaga para:
						</label>
						<select
							id="lote-fila"
							bind:value={filaDestinoLote}
							disabled={processandoLote}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-slate-900 outline-none focus:border-blue-900"
						>
							<option value="CENTRO_ESPECIALIDADES">CEM — Centro de Especialidades Médicas</option>
							<option value="CEO">CEO — Centro de Especialidades Odontológicas</option>
							<option value="SUS">Fila SUS Regional (Regulação Estadual)</option>
						</select>
						{#if filaDestinoLote === 'CENTRO_ESPECIALIDADES' || filaDestinoLote === 'CEO'}
							<div class="mt-1 text-[10px] font-bold text-emerald-800 uppercase">
								✓ FLUXO INTERNO: Aprovados serão direcionados diretamente ao Centro.
							</div>
						{:else}
							<div class="mt-1 text-[10px] text-slate-500 uppercase">
								FLUXO REGIONAL: Encaminhados aguardarão alocação na Central SUS.
							</div>
						{/if}
					</div>

					<!-- Agendamento previsto (se for SUS) -->
					{#if filaDestinoLote === 'SUS'}
						<div class="flex flex-col gap-1.5">
							<label
								for="lote-agendamento"
								class="text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
							>
								Previsão de Atendimento (Opcional)
							</label>
							<input
								id="lote-agendamento"
								type="date"
								bind:value={agendamentoLote}
								disabled={processandoLote}
								class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-slate-900 outline-none focus:border-blue-900"
							/>
						</div>
					{/if}

					<!-- Observação / Nota de Regulação -->
					<div class="flex flex-col gap-1.5">
						<label
							for="lote-nota"
							class="text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Nota da Regulação (Opcional, gravada em todos)
						</label>
						<textarea
							id="lote-nota"
							rows="3"
							bind:value={notaLote}
							disabled={processandoLote}
							placeholder="Ex: Aprovação consolidada em lote por campanha municipal."
							class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans outline-none focus:border-blue-900"
						></textarea>
					</div>

					<!-- Indicador de progresso se estiver rodando -->
					{#if processandoLote}
						<div class="mt-4 border border-blue-200 bg-blue-50 p-3">
							<div class="mb-1 flex justify-between font-bold text-blue-900">
								<span>PROCESSANDO LOTE...</span>
								<span>{progressoLote.atual} / {progressoLote.total}</span>
							</div>
							<div class="h-2 w-full bg-slate-200">
								<div
									class="h-full bg-blue-900 transition-all duration-200"
									style="width: {(progressoLote.atual / progressoLote.total) * 100}%"
								></div>
							</div>
						</div>
					{/if}

					<!-- Botões de ação -->
					<div class="mt-2 flex justify-end gap-2 border-t border-slate-200 pt-4">
						{#if !processandoLote}
							<button
								type="button"
								onclick={fecharModalLote}
								class="border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 uppercase hover:border-slate-500"
							>
								Cancelar
							</button>
							<button
								type="button"
								onclick={executarAprovacaoLote}
								class="border border-blue-900 bg-blue-900 px-4 py-2 font-bold text-white uppercase hover:bg-blue-950"
							>
								Confirmar Aprovação em Lote
							</button>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Resultado do Processamento em Lote -->
				<div class="flex flex-col gap-4 text-xs">
					<div class="border border-slate-200 bg-slate-50 p-3">
						<div class="mb-2 font-bold text-slate-900 uppercase">Relatório do Processamento:</div>
						<ul class="max-h-48 divide-y divide-slate-200 overflow-y-auto font-mono text-[11px]">
							{#each logsLote as log (log.protocolo)}
								<li class="flex items-center justify-between py-1.5">
									<span class="font-bold text-blue-900">{log.protocolo}</span>
									{#if log.status === 'ok'}
										<span class="font-bold text-emerald-700">✓ APROVADO</span>
									{:else}
										<span class="font-bold text-red-700" title={log.erro}>✗ ERRO: {log.erro}</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>

					<div class="mt-2 flex justify-end">
						<button
							type="button"
							onclick={fecharModalLote}
							class="border border-blue-900 bg-blue-900 px-5 py-2 font-bold text-white uppercase hover:bg-blue-950"
						>
							Concluir e Fechar [ENTER]
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Força reset brutalista de cantos retos em seletores padrão */
	select,
	input,
	textarea,
	button {
		border-radius: 0 !important;
	}
</style>
