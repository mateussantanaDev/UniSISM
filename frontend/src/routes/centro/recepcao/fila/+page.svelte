<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento, PrioridadeClinica } from '$lib/api/types';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';

	let encaminhamentos = $state<Encaminhamento[]>([]);
	let carregando = $state(true);
	let erro = $state('');

	// Filtros
	let busca = $state('');
	let filtroEspecialidade = $state('TODAS');
	let filtroPrioridade = $state('TODAS');
	let filtroStatusAgendamento = $state<'AGUARDANDO' | 'AGENDADO' | 'TODOS'>('AGUARDANDO');

	// Paginação
	let paginaAtual = $state(1);
	let itensPorPagina = $state(20);

	// Estado do modal de agendamento e remarcação
	let modalAgendamento = $state(false);
	let selecionado = $state<Encaminhamento | null>(null);
	let notaAgendamento = $state('');
	let modoSelecaoData = $state<'AUTO' | 'MANUAL'>('AUTO');
	let dataAgendamentoManual = $state(new Date().toISOString().substring(0, 10));
	let horaAgendamentoManual = $state('09:00');
	let processandoAgendamento = $state(false);
	let erroModal = $state('');

	// Dropdown de Médicos com Busca (carregados do servidor)
	let medicosEspecialistas = $state<{ nome: string, especialidade: string, registro: string }[]>([]);
	let buscaMedico = $state('');
	let dropdownAberto = $state(false);
	let medicoSelecionado = $state<{ nome: string, especialidade: string, registro: string } | null>(null);

	let medicosFiltrados = $derived(
		medicosEspecialistas.filter(m =>
			m.nome.toLowerCase().includes(buscaMedico.toLowerCase()) ||
			m.especialidade.toLowerCase().includes(buscaMedico.toLowerCase())
		)
	);

	function calcularMockDataOtimizada(prio: PrioridadeClinica): { data: string; hora: string } {
		const hoje = new Date();
		let dias = 15;
		if (prio === 'EMERGENCIA') dias = 1;
		else if (prio === 'URGENTE') dias = 3;
		else if (prio === 'PRIORITARIA') dias = 7;
		
		hoje.setDate(hoje.getDate() + dias);
		if (hoje.getDay() === 0) hoje.setDate(hoje.getDate() + 1);
		else if (hoje.getDay() === 6) hoje.setDate(hoje.getDate() + 2);

		const dataStr = hoje.toISOString().substring(0, 10);
		const horas = ['08:00', '09:15', '10:30', '13:00', '14:15', '15:30', '16:45'];
		const horaStr = horas[Math.floor(Math.random() * horas.length)];

		return { data: dataStr, hora: horaStr };
	}

	async function carregarFila() {
		carregando = true;
		erro = '';
		try {
			// Tenta consumir endpoint v3.0.0 de regulação do Centro (centro-doc-back.md)
			try {
				const resCentro = await api.centroRecepcao.listFilaEspera({
					centro: 'CENTRO_ESPECIALIDADES',
					status: 'APROVADO',
					agendado: false
				});
				if (resCentro && Array.isArray(resCentro.encaminhamentos) && resCentro.encaminhamentos.length > 0) {
					encaminhamentos = resCentro.encaminhamentos as any[];
					return;
				}
			} catch (errCentro) {
				console.info('[UniSISM] Endpoint /v1/centro/recepcao/fila-espera em transição — usando fallback /v1/encaminhamentos', errCentro);
			}

			// Carrega médicos do banco de dados para o seletor de agendamento
			try {
				const usuarios = await api.admin.listUsuarios();
				const medicos = usuarios.filter(u => (u as any).perfil === 'MEDICO' || (u as any).perfil === 'REGULADOR_SMS');
				medicosEspecialistas = medicos.map(m => ({
					nome: m.nome,
					especialidade: (m as any).especialidade || 'Especialista',
					registro: m.cpf ? `CRM/REG ${m.cpf.substring(0, 6)}` : 'CRM 10000'
				}));
			} catch (eMed) {
				console.info('[UniSISM] Não foi possível carregar lista de médicos do admin.', eMed);
			}

			// Fallback para API geral de encaminhamentos
			const res = await api.encaminhamentos.list({ status: 'APROVADO', limit: 1000 });
			encaminhamentos = res.filter(e => e.filaDestino === 'CENTRO_ESPECIALIDADES');
		} catch (e: any) {
			console.error(e);
			erro = `Falha ao carregar fila da regulação: ${e?.message || 'Erro no servidor'}`;
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarFila();
	});

	let listaEspecialidades = $derived.by(() => {
		const sets = new Set(encaminhamentos.map(e => e.solicitacao.especialidadeSolicitada).filter(Boolean));
		return [...sets].sort();
	});

	let filtrados = $derived.by(() => {
		return encaminhamentos.filter(e => {
			if (filtroStatusAgendamento === 'AGUARDANDO' && e.agendamentoPrevisto) return false;
			if (filtroStatusAgendamento === 'AGENDADO' && !e.agendamentoPrevisto) return false;

			if (filtroEspecialidade !== 'TODAS' && e.solicitacao.especialidadeSolicitada !== filtroEspecialidade) {
				return false;
			}
			if (filtroPrioridade !== 'TODAS' && e.solicitacao.prioridade !== filtroPrioridade) {
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

	const prioridadePeso: Record<PrioridadeClinica, number> = {
		EMERGENCIA: 4,
		URGENTE: 3,
		PRIORITARIA: 2,
		ELETIVA: 1
	};

	let ordenados = $derived.by(() => {
		let res = [...filtrados];
		res.sort((a, b) => {
			const pesoA = prioridadePeso[a.solicitacao.prioridade] ?? 0;
			const pesoB = prioridadePeso[b.solicitacao.prioridade] ?? 0;
			if (pesoA !== pesoB) {
				return pesoB - pesoA;
			}
			return new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
		});
		return res;
	});

	let totalPaginas = $derived(Math.ceil(ordenados.length / itensPorPagina));
	let paginaExibida = $derived(Math.min(paginaAtual, Math.max(1, totalPaginas)));
	let paginados = $derived(ordenados.slice((paginaExibida - 1) * itensPorPagina, paginaExibida * itensPorPagina));

	$effect(() => {
		const _ = [filtroEspecialidade, filtroPrioridade, busca];
		paginaAtual = 1;
	});

	function abrirAgendamento(enc: Encaminhamento) {
		selecionado = enc;
		notaAgendamento = (enc as any).nota || '';
		
		if (enc.agendamentoPrevisto) {
			modoSelecaoData = 'MANUAL';
			dataAgendamentoManual = enc.agendamentoPrevisto.substring(0, 10);
			horaAgendamentoManual = '09:00';
		} else {
			modoSelecaoData = 'AUTO';
			dataAgendamentoManual = new Date().toISOString().substring(0, 10);
			horaAgendamentoManual = '09:00';
		}

		medicoSelecionado = medicosEspecialistas.find(m => m.nome === (enc as any).profissionalAtribuido || m.especialidade === enc.solicitacao.especialidadeSolicitada) || null;
		buscaMedico = '';
		dropdownAberto = false;
		erroModal = '';
		modalAgendamento = true;
	}

	function fecharAgendamento() {
		modalAgendamento = false;
		selecionado = null;
	}

	async function salvarAgendamento() {
		if (!selecionado || !medicoSelecionado) {
			erroModal = 'Selecione um médico especialista para prosseguir.';
			return;
		}

		processandoAgendamento = true;
		erroModal = '';

		let dataCalculada = '';
		let horaCalculada = '';

		if (modoSelecaoData === 'MANUAL') {
			if (!dataAgendamentoManual) {
				erroModal = 'Selecione uma data válida para a remarcação/agendamento.';
				processandoAgendamento = false;
				return;
			}
			dataCalculada = dataAgendamentoManual;
			horaCalculada = horaAgendamentoManual || '09:00';
		} else {
			const otimizado = calcularMockDataOtimizada(selecionado.solicitacao.prioridade);
			dataCalculada = otimizado.data;
			horaCalculada = otimizado.hora;
		}

		const ehRemarcacao = !!selecionado.agendamentoPrevisto;
		const notaCompleta = `Médico: ${medicoSelecionado.nome} às ${horaCalculada} | ${ehRemarcacao ? '[REMARCAÇÃO DE CONSULTA]' : ''} Obs: ${notaAgendamento.trim() || 'Nenhuma'}`;

		try {
			try {
				await api.centroRecepcao.agendar(selecionado.id, {
					profissional: medicoSelecionado.nome,
					nota: notaCompleta,
					localAgendamento: 'Centro Municipal de Especialidades',
					agendamentoPrevisto: dataCalculada
				} as any);
			} catch (errAgendar) {
				console.info('[UniSISM] Endpoint /v1/centro/recepcao/agendar/:id em transição — usando fallback aprovar', errAgendar);
				await api.encaminhamentos.aprovar(selecionado.id, {
					filaDestino: 'CENTRO_ESPECIALIDADES',
					agendamentoPrevisto: dataCalculada,
					nota: notaCompleta
				});
			}

			// Atualiza estado local imediatamente para refletir a remarcação
			selecionado.agendamentoPrevisto = dataCalculada;
			(selecionado as any).profissionalAtribuido = medicoSelecionado.nome;
			
			fecharAgendamento();
			await carregarFila();
			
			const dtFmt = dataCalculada.split('-').reverse().join('/');
			alert(`✓ ${ehRemarcacao ? 'CONSULTA REMARCADA' : 'AGENDAMENTO CONCLUÍDO'} COM SUCESSO!\n\nPaciente: ${selecionado.paciente.nome}\nData Agendada: ${dtFmt} às ${horaCalculada}\nMédico Especialista: ${medicoSelecionado.nome}`);
		} catch (e) {
			console.error(e);
			if (e instanceof ApiError) {
				erroModal = e.message || 'Falha ao salvar agendamento.';
			} else {
				erroModal = 'Falha de conexão.';
			}
		} finally {
			processandoAgendamento = false;
		}
	}

	function formatarData(isoStr: string) {
		return new Date(isoStr).toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	}

	let totalFila = $derived(encaminhamentos.filter(e => !e.agendamentoPrevisto).length);
	let totalAgendados = $derived(encaminhamentos.filter(e => !!e.agendamentoPrevisto).length);
	let urgentesFila = $derived(encaminhamentos.filter(e => e.solicitacao.prioridade === 'URGENTE' || e.solicitacao.prioridade === 'EMERGENCIA').length);
</script>

<div class="flex flex-col gap-4 font-mono text-xs">
	<!-- Painel de Métricas -->
	<section class="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] tracking-widest text-slate-500 uppercase">Fila Aguardando</div>
			<div class="mt-2 text-3xl font-bold text-slate-900">{carregando ? '—' : totalFila}</div>
			<div class="text-[11px] text-slate-600 mt-1">Pacientes liberados sem data atribuída</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] tracking-widest text-slate-500 uppercase">Já Agendados (Remarcação)</div>
			<div class="mt-2 text-3xl font-bold text-blue-900">{carregando ? '—' : totalAgendados}</div>
			<div class="text-[11px] text-slate-600 mt-1">Consultas marcadas com opção de reagendamento</div>
		</div>

		<div class="border border-slate-200 bg-white p-4">
			<div class="text-[10px] tracking-widest text-slate-500 uppercase">Casos Urgentes</div>
			<div class="mt-2 text-3xl font-bold text-red-800">{carregando ? '—' : urgentesFila}</div>
			<div class="text-[11px] text-slate-600 mt-1">Pacientes com classificação de urgência</div>
		</div>
	</section>

	<!-- Filtros -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Filtros da Fila & Regulação" index="01">
			<button 
				type="button" 
				onclick={carregarFila}
				disabled={carregando}
				class="border border-slate-300 bg-white px-2 py-0.5 font-bold tracking-widest text-slate-700 uppercase hover:border-blue-900 disabled:opacity-50"
			>
				{carregando ? 'Carregando...' : 'Atualizar Fila'}
			</button>
		</PanelHeader>

		<div class="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
			<div class="flex flex-col gap-1">
				<label for="busca-paciente" class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Buscar Paciente
				</label>
				<input
					id="busca-paciente"
					type="text"
					bind:value={busca}
					placeholder="Nome, CPF ou Protocolo..."
					class="w-full border border-slate-300 bg-white px-2.5 py-1.5 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-sans text-sm"
				/>
			</div>

			<div class="flex flex-col gap-1">
				<label for="filtro-status-ag" class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Status na Regulação
				</label>
				<select
					id="filtro-status-ag"
					bind:value={filtroStatusAgendamento}
					class="w-full border border-slate-300 bg-white px-2 py-1.5 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-mono font-bold"
				>
					<option value="AGUARDANDO">⏳ AGUARDANDO AGENDAMENTO ({totalFila})</option>
					<option value="AGENDADO">📅 JÁ AGENDADOS / REMARCAR ({totalAgendados})</option>
					<option value="TODOS">📋 TODOS OS REGISTROS ({encaminhamentos.length})</option>
				</select>
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

			<div class="flex flex-col gap-1">
				<label for="filtro-prio" class="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Prioridade
				</label>
				<select
					id="filtro-prio"
					bind:value={filtroPrioridade}
					class="w-full border border-slate-300 bg-white px-2 py-1.5 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 font-sans"
				>
					<option value="TODAS">TODAS AS PRIORIDADES</option>
					<option value="EMERGENCIA">EMERGÊNCIA</option>
					<option value="URGENTE">URGENTE</option>
					<option value="PRIORITARIA">PRIORITÁRIA</option>
					<option value="ELETIVA">ELETIVA</option>
				</select>
			</div>
		</div>
	</div>

	<!-- Tabela da Fila -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Pacientes da Regulação Aprovados" index="02">
			<span class="border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600 uppercase">
				{ordenados.length} Aguardando
			</span>
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
						<th class="border-r border-slate-200 px-3 py-2">Ingressou em</th>
						<th class="border-r border-slate-200 px-3 py-2">Protocolo</th>
						<th class="border-r border-slate-200 px-3 py-2">Paciente</th>
						<th class="border-r border-slate-200 px-3 py-2">Especialidade</th>
						<th class="border-r border-slate-200 px-3 py-2">CID-10</th>
						<th class="border-r border-slate-200 px-3 py-2">Prioridade</th>
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
								Nenhum paciente aguardando agendamento na fila.
							</td>
						</tr>
					{:else}
						{#each paginados as enc (enc.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
								<td class="border-r border-slate-100 px-3 py-2 text-slate-600">
									{formatarData(enc.criadoEm)}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-blue-900">
									{enc.protocolo}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans font-semibold text-slate-900">
									<div>{enc.paciente.nome}</div>
									<div class="font-mono text-[10px] text-slate-500">{enc.paciente.cpf}</div>
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-sans text-slate-900 font-semibold">
									{enc.solicitacao.especialidadeSolicitada}
								</td>
								<td class="border-r border-slate-100 px-3 py-2 font-bold text-slate-700">
									{enc.solicitacao.cid10}
								</td>
								<td class="border-r border-slate-100 px-3 py-2">
									<StatusBadge prioridade={enc.solicitacao.prioridade} />
								</td>
								<td class="px-3 py-2 text-center whitespace-nowrap">
									<button
										type="button"
										onclick={() => abrirAgendamento(enc)}
										class="{enc.agendamentoPrevisto ? 'bg-purple-900 border-purple-900 hover:bg-purple-950' : 'bg-blue-900 border-blue-900 hover:bg-blue-950'} text-white border px-2.5 py-1 font-bold text-[10px] uppercase font-mono tracking-wider"
									>
										{enc.agendamentoPrevisto ? '🔄 Remarcar' : 'Agendar'}
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

<!-- Modal de Agendamento (B2G Brutalist Heavy) -->
{#if modalAgendamento && selecionado}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 font-mono">
		<div class="w-full max-w-md border-2 border-slate-900 bg-white p-6 shadow-[8px_8px_0_rgba(15,23,42,0.15)] rounded-none">
			<div class="mb-4 border-b border-slate-200 pb-3 flex items-center justify-between">
				<h2 class="text-base font-bold text-slate-900 uppercase">
					Otimizar e Agendar Consulta
				</h2>
				<button type="button" onclick={fecharAgendamento} class="text-slate-400 hover:text-slate-900 font-bold">
					[X] CLOSE
				</button>
			</div>

			<div class="flex flex-col gap-4 text-xs">
				<div class="border border-slate-200 bg-slate-50 p-3 leading-tight font-sans text-slate-800">
					<div class="font-mono text-[9px] text-slate-500 font-bold tracking-widest uppercase">Paciente em Fila</div>
					<div class="text-sm font-bold text-slate-900 mt-0.5">{selecionado.paciente.nome}</div>
					<div class="font-mono text-[10px] text-slate-600 mt-1">CPF · {selecionado.paciente.cpf}</div>
					{#if selecionado.paciente.nomeMae}
						<div class="font-mono text-[10px] text-slate-600">Mãe · {selecionado.paciente.nomeMae}</div>
					{/if}
					{#if selecionado.paciente.racaCor}
						<div class="font-mono text-[10px] text-slate-600">Etnia · {selecionado.paciente.racaCor}</div>
					{/if}
					<div class="font-mono text-[10px] text-slate-600">Especialidade · {selecionado.solicitacao.especialidadeSolicitada}</div>
				</div>



				<!-- Modo de Atribuição de Data (Automático vs Remarcação / Manual) -->
				<div class="flex flex-col gap-2 border border-slate-200 bg-slate-50 p-2.5">
					<span class="text-[9px] font-bold tracking-widest text-slate-700 uppercase">
						Modo de Atribuição de Data
					</span>
					<div class="grid grid-cols-2 gap-2">
						<button
							type="button"
							onclick={() => modoSelecaoData = 'AUTO'}
							class="px-2 py-1.5 font-bold uppercase text-[11px] border transition-colors {modoSelecaoData === 'AUTO' ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-white text-slate-700'}"
						>
							⚡ Auto (Algoritmo)
						</button>
						<button
							type="button"
							onclick={() => modoSelecaoData = 'MANUAL'}
							class="px-2 py-1.5 font-bold uppercase text-[11px] border transition-colors {modoSelecaoData === 'MANUAL' ? 'border-purple-900 bg-purple-900 text-white' : 'border-slate-300 bg-white text-slate-700'}"
						>
							📅 Remarcar / Data Manual
						</button>
					</div>

					{#if modoSelecaoData === 'MANUAL'}
						<div class="grid grid-cols-2 gap-2 border-t border-slate-300 pt-2 mt-1">
							<div class="flex flex-col gap-1">
								<label for="man-data" class="text-[9px] font-bold text-slate-700 uppercase">Nova Data *</label>
								<input
									id="man-data"
									type="date"
									bind:value={dataAgendamentoManual}
									class="border border-purple-400 bg-white px-2 py-1 outline-none text-xs font-bold font-mono"
								/>
							</div>
							<div class="flex flex-col gap-1">
								<label for="man-hora" class="text-[9px] font-bold text-slate-700 uppercase">Horário *</label>
								<input
									id="man-hora"
									type="time"
									bind:value={horaAgendamentoManual}
									class="border border-purple-400 bg-white px-2 py-1 outline-none text-xs font-bold font-mono"
								/>
							</div>
						</div>
					{/if}
				</div>

				<!-- Médico especialista dropdown com busca -->
				<div class="flex flex-col gap-1 relative">
					<label for="medico-search" class="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">
						Médico Especialista <span class="text-red-700">*</span>
					</label>
					
					<button
						id="medico-search"
						type="button"
						onclick={() => dropdownAberto = !dropdownAberto}
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-left font-sans text-sm text-slate-900 outline-none flex justify-between items-center"
					>
						<span>{medicoSelecionado ? `${medicoSelecionado.nome} (${medicoSelecionado.especialidade})` : 'Selecione um Médico Especialista...'}</span>
						<span class="text-slate-400 font-bold text-[9px]">{dropdownAberto ? '▲' : '▼'}</span>
					</button>

					{#if dropdownAberto}
						<div class="absolute z-10 left-0 right-0 top-full mt-1 border-2 border-slate-900 bg-white shadow-[4px_4px_0_rgba(15,23,42,0.15)] max-h-48 overflow-y-auto">
							<div class="p-2 border-b border-slate-200 bg-slate-50 sticky top-0">
								<input
									type="text"
									bind:value={buscaMedico}
									placeholder="🔍 Digite para pesquisar..."
									class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs"
									onclick={(e) => e.stopPropagation()}
								/>
							</div>
							<div class="flex flex-col">
								{#each medicosFiltrados as med}
									<button
										type="button"
										onclick={() => {
											medicoSelecionado = med;
											dropdownAberto = false;
											buscaMedico = '';
										}}
										class="w-full text-left px-3 py-2 hover:bg-blue-50 hover:text-blue-900 border-b border-slate-100 last:border-b-0 text-xs font-mono flex justify-between"
									>
										<span class="font-bold">{med.nome}</span>
										<span class="text-slate-500 text-[10px] uppercase font-semibold">{med.especialidade}</span>
									</button>
								{:else}
									<div class="px-3 py-3 text-center text-slate-500 text-xs font-sans">
										Nenhum médico encontrado.
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<!-- Notas adicionais -->
				<div class="flex flex-col gap-1">
					<label for="nota-agendamento" class="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">
						Recomendações e Observações (Opcional)
					</label>
					<textarea
						id="nota-agendamento"
						rows="3"
						bind:value={notaAgendamento}
						disabled={processandoAgendamento}
						placeholder="Ex: Trazer comprovante de residência e exames cardíacos."
						class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 resize-none"
					></textarea>
				</div>

				{#if erroModal}
					<div class="border border-red-700 bg-red-50 px-3 py-2 text-red-800 font-bold">
						{erroModal}
					</div>
				{/if}

				<div class="flex justify-end gap-2 border-t border-slate-200 pt-4 mt-2">
					<button
						type="button"
						onclick={fecharAgendamento}
						disabled={processandoAgendamento}
						class="border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:border-slate-500 uppercase"
					>
						Cancelar
					</button>
					<button
						type="button"
						onclick={salvarAgendamento}
						disabled={processandoAgendamento}
						class="{selecionado?.agendamentoPrevisto ? 'bg-purple-900 border-purple-900 hover:bg-purple-950' : 'bg-blue-900 border-blue-900 hover:bg-blue-950'} text-white border px-4 py-2 font-bold uppercase"
					>
						{processandoAgendamento ? 'Salvando...' : (selecionado?.agendamentoPrevisto ? '🔄 Confirmar Remarcação' : 'Confirmar e Agendar')}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	select, input, textarea, button {
		border-radius: 0 !important;
	}
</style>
