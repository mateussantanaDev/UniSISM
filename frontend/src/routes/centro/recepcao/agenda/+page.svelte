<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento, PrioridadeClinica, StatusAtendimentoCentro } from '$lib/api/types';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import {
		alocarVagaPorProfissionalEEscala,
		ESCALAS_PADRAO_CEM,
		ESCALAS_PADRAO_CEO,
		type TipoCentro,
		type AgendamentoOcupado
	} from '$lib/domain/centro/alocadorInteligenteEscala';

	let encaminhamentos = $state<Encaminhamento[]>([]);
	let todosEncaminhamentosMes = $state<Encaminhamento[]>([]);
	let carregando = $state(true);
	let erro = $state('');
	let mensagemSucesso = $state('');
	let timerMensagem: any = null;

	// Centro Ativo determinado 100% pelo órgão / rota (CEM vs CEO)
	let centroAtivoAgenda = $derived<TipoCentro>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivoAgenda === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro Municipal de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');

	// Modo de Visualização da Agenda (Lista vs Calendário Mensal vs Grade de Horários)
	let visaoModo = $state<'LISTA' | 'CALENDARIO' | 'GRADE'>('LISTA');

	// Seletor de Data da Agenda
	let dataAgenda = $state(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD (hoje)
	let mesCalendario = $state(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')); // YYYY-MM

	// Filtros adicionais
	let busca = $state('');
	let filtroEspecialidade = $state('TODAS');
	let filtroPrioridade = $state('TODAS');

	// Paginação para modo Lista
	let paginaAtual = $state(1);
	let itensPorPagina = $state(15);

	// Estado de cancelamento e realocação
	let processandoDesmarcar = $state(false);
	let realocandoProcessando = $state(false);

	// Modal de Realocação / Remanejamento pelo Gestor
	let modalRealocarAberto = $state(false);
	let encaminhamentoParaRealocar = $state<Encaminhamento | null>(null);
	let novaDataRealocacao = $state(new Date().toISOString().substring(0, 10));
	let novoHorarioRealocacao = $state('08:30');
	let novoMedicoRealocacao = $state('');
	let motivoRealocacao = $state('Remanejamento de escala do especialista');
	let erroModalRealocacao = $state('');

	// Dropdown de Médicos/Dentistas Especialistas do Órgão
	let medicosEspecialistas = $state<{ nome: string; especialidade: string; registro: string }[]>([]);

	// Modal de Comprovante de Agendamento Oficial
	let modalComprovanteAberto = $state(false);
	let comprovanteSelecionado = $state<Encaminhamento | null>(null);

	// Slots horários padrão da grade de atendimento
	const slotsHorarios = [
		'07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
		'13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
	];

	/**
	 * ALGORITMO DETERMINÍSTICO DE ALOCAÇÃO AUTOMÁTICA DE VAGAS COM BASE NA PRIORIDADE SUS
	 * Segue diretrizes da Portaria de Regulação do Ministério da Saúde / SUS.
	 */
	export function calcularAlocacaoPrioridadeSUS(
		prio: PrioridadeClinica,
		especialidade: string,
		dataReferencia?: Date
	): { data: string; hora: string; prazoDescricao: string; fundamentacao: string } {
		const base = dataReferencia ? new Date(dataReferencia) : new Date();
		let diasSoma = 15;
		let horaSugerida = '09:30';
		let prazoDesc = 'Até 30 dias corridos';
		let fundamentacao = 'Portaria SUS: Demanda clínica eletiva com fila regular';

		switch (prio) {
			case 'EMERGENCIA':
				diasSoma = 0; // Imediato / Mesmo dia
				horaSugerida = '08:00';
				prazoDesc = 'Imediato (Até 24 horas)';
				fundamentacao = 'Portaria SUS: Risco iminente de agravo severo / Atendimento Imediato';
				break;
			case 'URGENTE':
				diasSoma = 2; // Em até 72 horas úteis
				horaSugerida = '08:30';
				prazoDesc = 'Até 72 horas úteis';
				fundamentacao = 'Portaria SUS: Demanda com risco de cronificação ou descompensação';
				break;
			case 'PRIORITARIA':
				diasSoma = 7; // Até 7 a 10 dias
				horaSugerida = '09:00';
				prazoDesc = 'Até 7 a 10 dias';
				fundamentacao = 'Portaria SUS: Idoso, gestante, oncologia inicial ou vulnerabilidade';
				break;
			case 'ELETIVA':
			default:
				diasSoma = 15; // 15 a 30 dias
				horaSugerida = '10:00';
				prazoDesc = '15 a 30 dias úteis';
				fundamentacao = 'Portaria SUS: Acompanhamento ambulatorial programado';
				break;
		}

		base.setDate(base.getDate() + diasSoma);

		// Pula fins de semana (Sábado -> Segunda, Domingo -> Segunda)
		if (base.getDay() === 6) {
			base.setDate(base.getDate() + 2);
		} else if (base.getDay() === 0) {
			base.setDate(base.getDate() + 1);
		}

		const dataStr = base.toISOString().substring(0, 10);
		return {
			data: dataStr,
			hora: horaSugerida,
			prazoDescricao: prazoDesc,
			fundamentacao
		};
	}

	async function carregarAgenda() {
		carregando = true;
		erro = '';
		try {
			const centroParam = ehCeo ? 'CENTRO_ODONTOLOGICO' : 'CENTRO_ESPECIALIDADES';
			const [resCentro, resTodos] = await Promise.all([
				api.centroRecepcao.listAgendaDia({ data: dataAgenda, centro: centroParam }).catch(() => null),
				api.encaminhamentos.list({ status: 'APROVADO', limit: 1000 }).catch(() => [])
			]);

			// Carrega escalas oficiais exclusivas do órgão
			const escalasBase = ehCeo ? ESCALAS_PADRAO_CEO : ESCALAS_PADRAO_CEM;
			medicosEspecialistas = escalasBase.map(e => ({
				nome: e.nome,
				especialidade: e.especialidade,
				registro: e.registro
			}));

			todosEncaminhamentosMes = resTodos.filter(e => {
				const f = (e.filaDestino as string) || '';
				const c = (e as any).canalRoteamento || '';
				if (ehCeo) {
					return f === 'CEO' || c === 'CENTRO_ODONTOLOGICO';
				} else {
					return f === 'CENTRO_ESPECIALIDADES' || f === 'CEM' || (f !== 'CEO' && c !== 'CENTRO_ODONTOLOGICO');
				}
			});

			if (resCentro && Array.isArray(resCentro.agendamentos)) {
				encaminhamentos = resCentro.agendamentos as any[];
			} else {
				encaminhamentos = todosEncaminhamentosMes.filter(
					e => e.agendamentoPrevisto?.substring(0, 10) === dataAgenda
				);
			}
		} catch (e: any) {
			console.error(e);
			erro = `Falha ao carregar agenda do dia: ${e?.message || 'Erro no servidor'}`;
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarAgenda();
	});

	onDestroy(() => {
		if (timerMensagem) clearTimeout(timerMensagem);
	});

	// Filtrar os agendados da data selecionada
	let agendadosDaData = $derived(
		todosEncaminhamentosMes.filter(e => e.agendamentoPrevisto?.substring(0, 10) === dataAgenda)
	);

	// Lista de especialidades presentes na data para popular filtro
	let listaEspecialidades = $derived.by(() => {
		const sets = new Set(todosEncaminhamentosMes.map(e => e.solicitacao?.especialidadeSolicitada).filter(Boolean));
		return [...sets].sort();
	});

	// Extrai horário da consulta formatado HH:MM
	function extrairHorario(nota: string | undefined): string {
		if (!nota) return '08:00';
		const match = nota.match(/(\d{2}:\d{2})/);
		return match ? match[1] : '08:00';
	}

	// Filtragem local dos agendados da data
	let filtrados = $derived.by(() => {
		return agendadosDaData.filter(e => {
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

	// Ordenados por Horário
	let ordenados = $derived.by(() => {
		let res = [...filtrados];
		res.sort((a, b) => {
			const horaA = extrairHorario(a.observacoesRegulacao);
			const horaB = extrairHorario(b.observacoesRegulacao);
			return horaA.localeCompare(horaB);
		});
		return res;
	});

	// Paginação da lista
	let totalPaginas = $derived(Math.ceil(ordenados.length / itensPorPagina));
	let paginaExibida = $derived(Math.min(paginaAtual, Math.max(1, totalPaginas)));
	let paginados = $derived(ordenados.slice((paginaExibida - 1) * itensPorPagina, paginaExibida * itensPorPagina));

	// Resetar página quando filtros mudam
	$effect(() => {
		const _ = [filtroEspecialidade, filtroPrioridade, busca, dataAgenda];
		paginaAtual = 1;
	});

	// Abertura do Modal de Realocação
	function abrirRealocacao(enc: Encaminhamento) {
		encaminhamentoParaRealocar = enc;
		novaDataRealocacao = enc.agendamentoPrevisto ? enc.agendamentoPrevisto.substring(0, 10) : dataAgenda;
		novoHorarioRealocacao = extrairHorario(enc.observacoesRegulacao);
		novoMedicoRealocacao = (enc as any).profissionalAtribuido || (medicosEspecialistas[0]?.nome ?? '');
		motivoRealocacao = 'Remanejamento de escala médica pelo Gestor do Centro';
		erroModalRealocacao = '';
		modalRealocarAberto = true;
	}

	function aplicarPresetDataRealocacao(dias: number) {
		const d = new Date();
		d.setDate(d.getDate() + dias);
		if (d.getDay() === 6) d.setDate(d.getDate() + 2);
		else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
		novaDataRealocacao = d.toISOString().substring(0, 10);
	}

	function aplicarAlocacaoOtimizadaModal() {
		if (!encaminhamentoParaRealocar) return;
		const agendadosOcupados: AgendamentoOcupado[] = todosEncaminhamentosMes
			.filter(e => e.agendamentoPrevisto && e.id !== encaminhamentoParaRealocar!.id)
			.map(e => ({
				data: e.agendamentoPrevisto!.substring(0, 10),
				hora: extrairHorario(e.observacoesRegulacao),
				medicoNome: (e as any).profissionalAtribuido
			}));

		const otimizado = alocarVagaPorProfissionalEEscala({
			centro: centroAtivoAgenda,
			medicoNome: novoMedicoRealocacao || (encaminhamentoParaRealocar as any).profissionalAtribuido,
			especialidade: encaminhamentoParaRealocar.solicitacao.especialidadeSolicitada,
			prioridade: encaminhamentoParaRealocar.solicitacao.prioridade,
			agendamentosExistentes: agendadosOcupados,
			dataBase: new Date()
		});

		novaDataRealocacao = otimizado.data;
		novoHorarioRealocacao = otimizado.hora;
		if (otimizado.medicoNome) {
			novoMedicoRealocacao = otimizado.medicoNome;
		}
		motivoRealocacao = `[ALOCAÇÃO DETERMINÍSTICA ${otimizado.centro}] ${otimizado.justificativaEscala}`;
	}

	async function executarRealocacao() {
		if (!encaminhamentoParaRealocar) return;
		if (!novaDataRealocacao) {
			erroModalRealocacao = 'Selecione uma nova data válida para o atendimento.';
			return;
		}

		realocandoProcessando = true;
		erroModalRealocacao = '';

		const notaAtualizada = `Médico: ${novoMedicoRealocacao || 'Especialista'} às ${novoHorarioRealocacao} | [REALOCAÇÃO REALIZADA PELO GESTOR] Motivo: ${motivoRealocacao.trim()}`;

		try {
			try {
				await api.centroRecepcao.desmarcarReagendar(encaminhamentoParaRealocar.id, {
					acao: 'REAGENDAR',
					novaData: novaDataRealocacao,
					novoHorario: novoHorarioRealocacao,
					unidadeDestino: 'Centro Municipal de Especialidades',
					motivo: notaAtualizada
				});
			} catch (errReag) {
				console.info('[UniSISM] Endpoint desmarcarReagendar em transição — usando fallback remarcar', errReag);
				await api.centroRecepcao.remarcar(encaminhamentoParaRealocar.id, {
					novaData: novaDataRealocacao,
					novoHorario: novoHorarioRealocacao,
					unidadeDestino: 'Centro Municipal de Especialidades',
					motivo: notaAtualizada
				});
			}

			// Atualiza localmente
			encaminhamentoParaRealocar.agendamentoPrevisto = novaDataRealocacao;
			encaminhamentoParaRealocar.observacoesRegulacao = notaAtualizada;
			(encaminhamentoParaRealocar as any).profissionalAtribuido = novoMedicoRealocacao;

			mensagemSucesso = `✓ ATENDIMENTO REALOCADO COM SUCESSO!\nPaciente: ${encaminhamentoParaRealocar.paciente.nome}\nNova Data: ${formatarData(novaDataRealocacao)} às ${novoHorarioRealocacao}\nProfissional: ${novoMedicoRealocacao || 'Especialista'}`;
			modalRealocarAberto = false;

			if (timerMensagem) clearTimeout(timerMensagem);
			timerMensagem = setTimeout(() => { mensagemSucesso = ''; }, 6000);

			await carregarAgenda();
		} catch (err: any) {
			console.error(err);
			erroModalRealocacao = `Falha ao realocar atendimento: ${err?.message || 'Erro do servidor'}`;
		} finally {
			realocandoProcessando = false;
		}
	}

	// Desmarcar consulta
	async function desmarcarConsulta(enc: Encaminhamento) {
		if (!confirm(`Confirmar cancelamento do agendamento de ${enc.paciente.nome}? O paciente retornará para a fila de regulação.`)) {
			return;
		}

		processandoDesmarcar = true;
		try {
			await api.centroRecepcao.desmarcarReagendar(enc.id, {
				acao: 'DESMARCAR',
				motivo: 'Consulta desmarcada na recepção do Centro.'
			});
			mensagemSucesso = `✓ Consulta do paciente ${enc.paciente.nome} cancelada e retornada para a fila com sucesso.`;
			if (timerMensagem) clearTimeout(timerMensagem);
			timerMensagem = setTimeout(() => { mensagemSucesso = ''; }, 5000);
			await carregarAgenda();
		} catch (e: any) {
			console.error(e);
			erro = `Falha ao desmarcar consulta: ${e?.message || 'Erro no servidor'}`;
		} finally {
			processandoDesmarcar = false;
		}
	}

	async function registrarPresencaRecepcao(enc: Encaminhamento, status: StatusAtendimentoCentro) {
		try {
			await api.centroRecepcao.confirmarPresenca(enc.id, {
				status,
				observacao: 'Presença confirmada pela Recepção do Centro.'
			});
			(enc as any).statusAtendimentoCentro = status;
			mensagemSucesso = `✓ Presença do paciente ${enc.paciente.nome} confirmada! Paciente aguarda atendimento na recepção.`;
			if (timerMensagem) clearTimeout(timerMensagem);
			timerMensagem = setTimeout(() => { mensagemSucesso = ''; }, 4000);
			await carregarAgenda();
		} catch (e: any) {
			console.error('Falha ao registrar presença:', e);
			erro = `Falha ao confirmar presença: ${e?.message || 'Erro no servidor'}`;
		}
	}

	function abrirComprovante(enc: Encaminhamento) {
		comprovanteSelecionado = enc;
		modalComprovanteAberto = true;
	}

	function acionarImpressao() {
		window.print();
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

	// Funções de Cálculo do Calendário Mensal
	let diasDoMesCalendario = $derived.by(() => {
		const [anoStr, mesStr] = mesCalendario.split('-');
		const ano = parseInt(anoStr, 10);
		const mes = parseInt(mesStr, 10) - 1;

		const primeiroDia = new Date(ano, mes, 1);
		const ultimoDia = new Date(ano, mes + 1, 0);

		const diasNoMes = ultimoDia.getDate();
		const diaSemanaInicio = primeiroDia.getDay(); // 0 = Domingo, 1 = Segunda...

		const dias: Array<{
			numero: number;
			dataIso: string;
			mesAtual: boolean;
			isHoje: boolean;
			isSelecionado: boolean;
			totalAgendados: number;
			urgentes: number;
			prioritarios: number;
			eletivos: number;
			capacidadePercent: number;
		}> = [];

		// Dias do mês anterior para completar a semana
		const ultimoDiaMesAnterior = new Date(ano, mes, 0).getDate();
		for (let i = diaSemanaInicio - 1; i >= 0; i--) {
			const num = ultimoDiaMesAnterior - i;
			const mesAnt = mes === 0 ? 12 : mes;
			const anoAnt = mes === 0 ? ano - 1 : ano;
			const dataIso = `${anoAnt}-${String(mesAnt).padStart(2, '0')}-${String(num).padStart(2, '0')}`;
			dias.push({
				numero: num,
				dataIso,
				mesAtual: false,
				isHoje: false,
				isSelecionado: dataIso === dataAgenda,
				totalAgendados: 0,
				urgentes: 0,
				prioritarios: 0,
				eletivos: 0,
				capacidadePercent: 0
			});
		}

		const hojeIso = new Date().toISOString().substring(0, 10);

		// Dias do mês corrente
		for (let d = 1; d <= diasNoMes; d++) {
			const dataIso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const agendamentosNesteDia = todosEncaminhamentosMes.filter(e => e.agendamentoPrevisto?.substring(0, 10) === dataIso);

			let urg = 0;
			let prio = 0;
			let ele = 0;
			agendamentosNesteDia.forEach(e => {
				if (e.solicitacao?.prioridade === 'EMERGENCIA' || e.solicitacao?.prioridade === 'URGENTE') urg++;
				else if (e.solicitacao?.prioridade === 'PRIORITARIA') prio++;
				else ele++;
			});

			const capacidadeTotalEstimada = 20; // Capacidade padrão do turno
			const percent = Math.min(100, Math.round((agendamentosNesteDia.length / capacidadeTotalEstimada) * 100));

			dias.push({
				numero: d,
				dataIso,
				mesAtual: true,
				isHoje: dataIso === hojeIso,
				isSelecionado: dataIso === dataAgenda,
				totalAgendados: agendamentosNesteDia.length,
				urgentes: urg,
				prioritarios: prio,
				eletivos: ele,
				capacidadePercent: percent
			});
		}

		// Preenche restante da última semana até fechar múltiplo de 7
		const resto = 7 - (dias.length % 7);
		if (resto < 7) {
			for (let p = 1; p <= resto; p++) {
				const mesProx = mes === 11 ? 1 : mes + 2;
				const anoProx = mes === 11 ? ano + 1 : ano;
				const dataIso = `${anoProx}-${String(mesProx).padStart(2, '0')}-${String(p).padStart(2, '0')}`;
				dias.push({
					numero: p,
					dataIso,
					mesAtual: false,
					isHoje: false,
					isSelecionado: dataIso === dataAgenda,
					totalAgendados: 0,
					urgentes: 0,
					prioritarios: 0,
					eletivos: 0,
					capacidadePercent: 0
				});
			}
		}

		return dias;
	});

	function navegarMes(direcao: number) {
		const [anoStr, mesStr] = mesCalendario.split('-');
		let ano = parseInt(anoStr, 10);
		let mes = parseInt(mesStr, 10) + direcao;
		if (mes < 1) {
			mes = 12;
			ano--;
		} else if (mes > 12) {
			mes = 1;
			ano++;
		}
		mesCalendario = `${ano}-${String(mes).padStart(2, '0')}`;
	}

	function irParaHoje() {
		const hoje = new Date().toISOString().substring(0, 10);
		dataAgenda = hoje;
		mesCalendario = hoje.substring(0, 7);
	}

	function selecionarDiaCalendario(dataIso: string) {
		dataAgenda = dataIso;
		mesCalendario = dataIso.substring(0, 7);
	}

	// Mapeamento de Grade Horária para a data atual
	let gradeHorariosMapeada = $derived.by(() => {
		return slotsHorarios.map(hora => {
			const agendadosNesteHorario = ordenados.filter(e => extrairHorario(e.observacoesRegulacao) === hora);
			return {
				hora,
				agendados: agendadosNesteHorario,
				ocupado: agendadosNesteHorario.length > 0
			};
		});
	});
</script>

<svelte:head>
	<title>ERP Centro - Agenda de Atendimentos & Alocação de Vagas | UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-4 font-mono text-xs">
	<!-- Banner Sucesso Global -->
	{#if mensagemSucesso}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 font-bold text-emerald-900 shadow-sm flex flex-col gap-1 whitespace-pre-wrap">
			<div class="text-sm font-black flex items-center gap-2">
				<span class="bg-emerald-700 text-white px-2 py-0.5 text-xs font-mono">CONFIRMADO</span>
				<span>GESTÃO DE VAGAS & AGENDA DO CENTRO</span>
			</div>
			<div class="font-mono text-xs font-normal mt-0.5">{mensagemSucesso}</div>
		</div>
	{/if}

	<!-- Banner Erro Global -->
	{#if erro}
		<div class="border border-rose-600 bg-rose-50 p-3 font-semibold text-rose-900">
			⚠ {erro}
		</div>
	{/if}

	<!-- Header com Navegação e Alternador de Visões (Design System SUS) -->
	<section class="border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
		<div>
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				CENTRO DE ESPECIALIDADES · REGULAÇÃO ASSISTENCIAL
			</div>
			<div class="text-lg font-bold text-slate-900 font-sans mt-0.5 flex items-center gap-2">
				<span>Agenda de Consultas e Alocação de Especialidades</span>
			</div>
			<div class="text-xs text-blue-900 font-bold mt-1 flex items-center gap-1.5">
				<span>📅 Data em Foco: <strong>{formatarData(dataAgenda)}</strong></span>
				<span class="text-slate-400">·</span>
				<span>({ordenados.length} atendimentos programados)</span>
			</div>
		</div>

		<!-- Alternador de Modos de Visão -->
		<div class="flex items-center gap-2">
			<div class="flex border border-slate-300 bg-slate-100 p-0.5">
				<button
					type="button"
					onclick={() => visaoModo = 'LISTA'}
					class="px-3 py-1.5 font-bold uppercase text-xs transition-colors flex items-center gap-1.5 {visaoModo === 'LISTA' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'}"
				>
					<span>📋</span>
					<span>Lista</span>
				</button>
				<button
					type="button"
					onclick={() => visaoModo = 'CALENDARIO'}
					class="px-3 py-1.5 font-bold uppercase text-xs transition-colors flex items-center gap-1.5 {visaoModo === 'CALENDARIO' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'}"
				>
					<span>📅</span>
					<span>Calendário Mensal</span>
				</button>
				<button
					type="button"
					onclick={() => visaoModo = 'GRADE'}
					class="px-3 py-1.5 font-bold uppercase text-xs transition-colors flex items-center gap-1.5 {visaoModo === 'GRADE' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'}"
				>
					<span>⏱️</span>
					<span>Grade de Horários</span>
				</button>
			</div>

			<button
				type="button"
				onclick={irParaHoje}
				class="border border-blue-900 bg-white hover:bg-blue-50 px-3 py-1.5 font-bold text-xs uppercase tracking-wider text-blue-900"
			>
				Hoje
			</button>
		</div>
	</section>

	<!-- Filtros da Agenda -->
	<section class="border border-slate-200 bg-white p-4 grid grid-cols-1 gap-3 md:grid-cols-4 font-sans text-xs">
		<div class="flex flex-col gap-1 md:col-span-2">
			<label for="busca-agenda" class="font-mono text-[10px] font-bold uppercase text-slate-600">Buscar Paciente / CPF / Protocolo</label>
			<input
				id="busca-agenda"
				type="text"
				bind:value={busca}
				placeholder="Digite o nome do paciente, CPF ou número do protocolo..."
				class="border border-slate-300 p-2 font-sans text-xs outline-none focus:border-blue-900"
			/>
		</div>

		<div class="flex flex-col gap-1">
			<label for="filtro-esp" class="font-mono text-[10px] font-bold uppercase text-slate-600">Especialidade</label>
			<select id="filtro-esp" bind:value={filtroEspecialidade} class="border border-slate-300 p-2 text-xs bg-white font-bold font-mono">
				<option value="TODAS">TODAS AS ESPECIALIDADES</option>
				{#each listaEspecialidades as esp}
					<option value={esp}>{esp.toUpperCase()}</option>
				{/each}
			</select>
		</div>

		<div class="flex flex-col gap-1">
			<label for="filtro-prio" class="font-mono text-[10px] font-bold uppercase text-slate-600">Prioridade SUS</label>
			<select id="filtro-prio" bind:value={filtroPrioridade} class="border border-slate-300 p-2 text-xs bg-white font-bold font-mono">
				<option value="TODAS">TODAS AS PRIORIDADES</option>
				<option value="EMERGENCIA">🔴 EMERGÊNCIA (Até 24h)</option>
				<option value="URGENTE">🟠 URGENTE (Até 72h)</option>
				<option value="PRIORITARIA">🔵 PRIORITÁRIA (Até 7-10d)</option>
				<option value="ELETIVA">🟢 ELETIVA (Até 30d)</option>
			</select>
		</div>
	</section>

	<!-- ========================================================================= -->
	<!-- VISÃO 1: CALENDÁRIO MENSAL INTERATIVO (DESIGN SYSTEM CLÍNICO)             -->
	<!-- ========================================================================= -->
	{#if visaoModo === 'CALENDARIO'}
		<section class="border-2 border-slate-900 bg-white shadow-md">
			<!-- Header do Calendário Mensal -->
			<div class="flex items-center justify-between border-b-2 border-slate-900 bg-slate-900 px-6 py-3 text-white">
				<div class="flex items-center gap-3">
					<button
						type="button"
						onclick={() => navegarMes(-1)}
						class="border border-slate-700 bg-slate-800 px-3 py-1 font-bold text-xs uppercase hover:bg-slate-700"
						title="Mês Anterior"
					>
						◀ Mês Anterior
					</button>

					<span class="text-base font-bold tracking-wider font-sans uppercase">
						{new Date(parseInt(mesCalendario.split('-')[0]), parseInt(mesCalendario.split('-')[1]) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
					</span>

					<button
						type="button"
						onclick={() => navegarMes(1)}
						class="border border-slate-700 bg-slate-800 px-3 py-1 font-bold text-xs uppercase hover:bg-slate-700"
						title="Próximo Mês"
					>
						Próximo Mês ▶
					</button>
				</div>

				<div class="flex items-center gap-4 text-xs">
					<div class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-rose-600"></span> Urgência / Emergência</div>
					<div class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-blue-600"></span> Prioritária</div>
					<div class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-emerald-600"></span> Eletiva</div>
				</div>
			</div>

			<!-- Grid dos 7 Dias da Semana -->
			<div class="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center font-mono text-[11px] font-bold text-slate-700 uppercase">
				<div class="py-2.5 border-r border-slate-200 text-rose-700">DOMINGO</div>
				<div class="py-2.5 border-r border-slate-200">SEGUNDA</div>
				<div class="py-2.5 border-r border-slate-200">TERÇA</div>
				<div class="py-2.5 border-r border-slate-200">QUARTA</div>
				<div class="py-2.5 border-r border-slate-200">QUINTA</div>
				<div class="py-2.5 border-r border-slate-200">SEXTA</div>
				<div class="py-2.5 text-rose-700">SÁBADO</div>
			</div>

			<!-- Células do Calendário Mensal -->
			<div class="grid grid-cols-7 border-collapse bg-slate-200 gap-px">
				{#each diasDoMesCalendario as dia (dia.dataIso)}
					<button
						type="button"
						onclick={() => selecionarDiaCalendario(dia.dataIso)}
						class="min-h-[110px] p-2 text-left transition-all flex flex-col justify-between {dia.isSelecionado ? 'bg-blue-50 ring-2 ring-blue-900 z-10' : dia.mesAtual ? 'bg-white hover:bg-slate-50' : 'bg-slate-100/60 text-slate-400'}"
					>
						<div class="flex items-center justify-between">
							<span class="font-bold text-xs {dia.isHoje ? 'bg-blue-900 text-white px-1.5 py-0.5 rounded-xs' : dia.isSelecionado ? 'text-blue-900 text-sm font-black' : 'text-slate-700'}">
								{dia.numero}
							</span>

							{#if dia.totalAgendados > 0}
								<span class="bg-blue-100 text-blue-950 font-bold px-1.5 py-0.5 text-[10px] border border-blue-300">
									{dia.totalAgendados} agendado{dia.totalAgendados > 1 ? 's' : ''}
								</span>
							{/if}
						</div>

						<!-- Tags de Prioridade e Barra de Ocupação -->
						{#if dia.totalAgendados > 0}
							<div class="flex flex-col gap-1 my-1">
								<div class="flex items-center gap-1 flex-wrap">
									{#if dia.urgentes > 0}
										<span class="bg-rose-100 text-rose-900 border border-rose-300 font-bold text-[9px] px-1">
											🔴 {dia.urgentes} urg
										</span>
									{/if}
									{#if dia.prioritarios > 0}
										<span class="bg-blue-100 text-blue-900 border border-blue-300 font-bold text-[9px] px-1">
											🔵 {dia.prioritarios} prio
										</span>
									{/if}
									{#if dia.eletivos > 0}
										<span class="bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[9px] px-1">
											🟢 {dia.eletivos} elet
										</span>
									{/if}
								</div>

								<!-- Barra de Ocupação da Capacidade -->
								<div class="w-full bg-slate-200 h-1.5 overflow-hidden mt-1">
									<div
										class="h-full {dia.capacidadePercent >= 90 ? 'bg-rose-600' : dia.capacidadePercent >= 60 ? 'bg-amber-500' : 'bg-emerald-600'}"
										style="width: {dia.capacidadePercent}%"
									></div>
								</div>
								<span class="text-[9px] text-slate-500 font-mono text-right">{dia.capacidadePercent}% ocupado</span>
							</div>
						{:else if dia.mesAtual}
							<div class="text-[10px] text-slate-400 italic">Vagas livres</div>
						{/if}
					</button>
				{/each}
			</div>

			<div class="border-t border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-700">
				💡 Clique em qualquer dia para carregar e gerenciar os pacientes programados para aquela data.
			</div>
		</section>
	{/if}

	<!-- ========================================================================= -->
	<!-- VISÃO 2: GRADE HORÁRIA POR SLOTS (07:30 às 17:00)                         -->
	<!-- ========================================================================= -->
	{#if visaoModo === 'GRADE'}
		<section class="border border-slate-200 bg-white">
			<PanelHeader title={`Grade Horária do Dia · ${formatarData(dataAgenda)}`} index="01">
				<div class="flex items-center gap-2">
					<input
						type="date"
						bind:value={dataAgenda}
						class="border border-slate-300 bg-white px-2 py-1 text-xs font-mono text-slate-900 font-bold outline-none"
					/>
				</div>
			</PanelHeader>

			<div class="p-4 flex flex-col gap-3">
				{#each gradeHorariosMapeada as slot (slot.hora)}
					<div class="border {slot.ocupado ? 'border-blue-900 bg-blue-50/40' : 'border-slate-200 bg-slate-50'} p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors">
						<div class="flex items-center gap-4">
							<div class="flex h-12 w-20 shrink-0 items-center justify-center font-bold text-base {slot.ocupado ? 'bg-blue-900 text-white' : 'bg-slate-200 text-slate-600'}">
								{slot.hora}
							</div>

							{#if slot.ocupado}
								{#each slot.agendados as enc}
									<div class="flex flex-col">
										<div class="flex items-center gap-2">
											<span class="font-bold text-slate-900 text-sm font-sans">{enc.paciente.nome}</span>
											<span class="font-mono text-xs text-slate-500">(CPF: {enc.paciente.cpf})</span>
											<StatusBadge prioridade={enc.solicitacao.prioridade} />
										</div>
										<div class="text-xs text-blue-950 font-bold mt-0.5">
											{enc.solicitacao.especialidadeSolicitada} · Protocolo: {enc.protocolo}
										</div>
										<div class="text-[11px] text-slate-600">
											{enc.observacoesRegulacao || 'Consulta programada no Centro'}
										</div>
									</div>
								{/each}
							{:else}
								<div>
									<div class="font-bold text-slate-600 text-xs uppercase">Horário Livre / Disponível</div>
									<div class="text-[11px] text-slate-400">Espaço disponível para encaixe ou realocação de pacientes</div>
								</div>
							{/if}
						</div>

						<!-- Ações do Slot -->
						<div class="flex items-center gap-2 justify-end">
							{#if slot.ocupado}
								{#each slot.agendados as enc}
									<button
										type="button"
										onclick={() => registrarPresencaRecepcao(enc, 'AGUARDANDO_ATENDIMENTO')}
										class="border border-emerald-700 bg-emerald-700 text-white px-2.5 py-1 text-xs font-bold uppercase hover:bg-emerald-800"
									>
										✓ Confirmar Chegada
									</button>
									<button
										type="button"
										onclick={() => abrirRealocacao(enc)}
										class="border border-purple-900 bg-purple-900 text-white px-2.5 py-1 text-xs font-bold uppercase hover:bg-purple-950"
									>
										🔄 Realocar Vaga
									</button>
									<button
										type="button"
										onclick={() => abrirComprovante(enc)}
										class="border border-slate-300 bg-white text-slate-700 px-2.5 py-1 text-xs font-bold uppercase hover:bg-slate-100"
									>
										🖨️ Comprovante
									</button>
								{/each}
							{:else}
								<span class="text-emerald-800 font-bold text-xs bg-emerald-100 border border-emerald-300 px-2 py-1">
									VAGA DISPONÍVEL
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- ========================================================================= -->
	<!-- VISÃO 3: TABELA DETALHADA EM LISTA (COMPLETA COM REALOCAÇÃO)              -->
	<!-- ========================================================================= -->
	{#if visaoModo === 'LISTA'}
		<div class="border border-slate-200 bg-white shadow-xs">
			<PanelHeader title={`Pacientes Agendados para o Dia · ${formatarData(dataAgenda)}`} index="02">
				<div class="flex items-center gap-2">
					<input
						type="date"
						bind:value={dataAgenda}
						class="border border-slate-300 bg-white px-2 py-0.5 text-xs font-mono font-bold text-slate-900 outline-none"
					/>
					<span class="border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600 uppercase">
						{ordenados.length} Programados
					</span>
				</div>
			</PanelHeader>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
							<th class="border-r border-slate-200 px-3 py-2.5">Horário</th>
							<th class="border-r border-slate-200 px-3 py-2.5">Protocolo</th>
							<th class="border-r border-slate-200 px-3 py-2.5">Paciente / CPF</th>
							<th class="border-r border-slate-200 px-3 py-2.5">Especialidade</th>
							<th class="border-r border-slate-200 px-3 py-2.5">Prioridade</th>
							<th class="border-r border-slate-200 px-3 py-2.5">Observações da Escala</th>
							<th class="px-3 py-2.5 text-center">Ações Assistenciais</th>
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
									Nenhuma consulta agendada para a data selecionada ({formatarData(dataAgenda)}).
								</td>
							</tr>
						{:else}
							{#each paginados as enc (enc.id)}
								<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
									<td class="border-r border-slate-100 px-3 py-2.5 font-bold text-blue-900 text-sm">
										{extrairHorario(enc.observacoesRegulacao)}
									</td>
									<td class="border-r border-slate-100 px-3 py-2.5 text-slate-600">
										{enc.protocolo}
									</td>
									<td class="border-r border-slate-100 px-3 py-2.5 font-sans font-semibold text-slate-900">
										<div>{enc.paciente.nome}</div>
										<div class="font-mono text-[10px] text-slate-500">{enc.paciente.cpf}</div>
									</td>
									<td class="border-r border-slate-100 px-3 py-2.5 font-sans text-slate-900 font-semibold">
										{enc.solicitacao.especialidadeSolicitada}
									</td>
									<td class="border-r border-slate-100 px-3 py-2.5">
										<StatusBadge prioridade={enc.solicitacao.prioridade} />
									</td>
									<td class="border-r border-slate-100 px-3 py-2.5 font-sans text-slate-700 max-w-xs truncate" title={enc.observacoesRegulacao || ''}>
										{enc.observacoesRegulacao || '—'}
									</td>
									<td class="px-3 py-2.5 text-center flex items-center justify-center gap-1.5 whitespace-nowrap">
										<button
											type="button"
											onclick={() => registrarPresencaRecepcao(enc, 'AGUARDANDO_ATENDIMENTO')}
											class="border border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 px-2 py-1 font-bold text-[10px] uppercase font-mono tracking-wider"
											title="Confirmar chegada do paciente"
										>
											✓ Chegada
										</button>
										<button
											type="button"
											onclick={() => abrirRealocacao(enc)}
											class="border border-purple-900 bg-purple-900 text-white hover:bg-purple-950 px-2 py-1 font-bold text-[10px] uppercase font-mono tracking-wider"
											title="Realocar / Remanejar para outra data ou médico"
										>
											🔄 Realocar
										</button>
										<button
											type="button"
											onclick={() => abrirComprovante(enc)}
											class="border border-slate-300 bg-white hover:bg-slate-50 px-2 py-1 font-bold text-[10px] uppercase font-mono tracking-wider text-blue-900"
										>
											🖨️ Comprovante
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
						<span class="px-3 py-1 border border-slate-300 bg-white text-slate-900 font-bold">
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
	{/if}
</div>

<!-- ========================================================================= -->
<!-- MODAL: REALOCAÇÃO E REMANEJAMENTO DE VAGA PELO GESTOR DO CENTRO           -->
<!-- ========================================================================= -->
{#if modalRealocarAberto && encaminhamentoParaRealocar}
	<Modal
		isOpen={modalRealocarAberto}
		onClose={() => modalRealocarAberto = false}
		title="REALOCAÇÃO E REMANEJAMENTO DE ATENDIMENTO"
		subtitle={`Protocolo: ${encaminhamentoParaRealocar.protocolo} · Paciente: ${encaminhamentoParaRealocar.paciente.nome}`}
		maxWidth="lg"
	>
		<div class="flex flex-col gap-4 font-mono text-xs">
			{#if erroModalRealocacao}
				<div class="border border-rose-300 bg-rose-50 p-2.5 text-rose-900 font-bold">
					⚠ {erroModalRealocacao}
				</div>
			{/if}

			<!-- Card com Dados do Paciente e Vaga Atual -->
			<div class="border border-purple-200 bg-purple-50 p-3.5 flex flex-col gap-1 font-sans">
				<div class="flex justify-between items-center">
					<div class="font-bold text-purple-950 text-sm">{encaminhamentoParaRealocar.paciente.nome}</div>
					<StatusBadge prioridade={encaminhamentoParaRealocar.solicitacao.prioridade} />
				</div>
				<div class="text-xs text-purple-900 font-mono">
					CPF: {encaminhamentoParaRealocar.paciente.cpf} · Especialidade: <strong>{encaminhamentoParaRealocar.solicitacao.especialidadeSolicitada}</strong>
				</div>
				<div class="text-[11px] text-purple-800 mt-1 border-t border-purple-200 pt-1">
					Data Atual Agendada: <strong>{formatarData(encaminhamentoParaRealocar.agendamentoPrevisto)}</strong> às <strong>{extrairHorario(encaminhamentoParaRealocar.observacoesRegulacao)}</strong>
				</div>
			</div>

			<!-- Botão de Otimização Automática SUS -->
			<div class="border border-blue-200 bg-blue-50 p-3 flex items-center justify-between gap-3">
				<div>
					<div class="font-bold text-blue-900 uppercase text-[11px]">⚡ Alocação Automática por Prioridade SUS</div>
					<div class="text-[10px] text-blue-700 font-sans">Calcula a data e horário ideal conforme a gravidade clínica do paciente.</div>
				</div>
				<button
					type="button"
					onclick={aplicarAlocacaoOtimizadaModal}
					class="border border-blue-900 bg-blue-900 text-white px-3 py-1.5 font-bold uppercase text-[10px] hover:bg-blue-950 shrink-0"
				>
					Calcular Vaga SUS
				</button>
			</div>

			<!-- Atalhos Rápidos de Datas -->
			<div class="flex flex-col gap-1">
				<span class="font-bold text-slate-600 text-[10px] uppercase">Atalhos de Remanejamento Rápido:</span>
				<div class="flex flex-wrap gap-1.5">
					<button type="button" onclick={() => aplicarPresetDataRealocacao(0)} class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100">Hoje (+0d)</button>
					<button type="button" onclick={() => aplicarPresetDataRealocacao(1)} class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100">Amanhã (+1d)</button>
					<button type="button" onclick={() => aplicarPresetDataRealocacao(3)} class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100">+3 dias (Urgência)</button>
					<button type="button" onclick={() => aplicarPresetDataRealocacao(7)} class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100">+7 dias (Prioritária)</button>
					<button type="button" onclick={() => aplicarPresetDataRealocacao(15)} class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100">+15 dias (Eletiva)</button>
				</div>
			</div>

			<!-- Formulário de Nova Data e Horário -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-200 pt-3">
				<div class="flex flex-col gap-1">
					<label for="realoc-data" class="font-bold text-slate-700 text-[11px]">Nova Data da Consulta *</label>
					<input id="realoc-data" type="date" bind:value={novaDataRealocacao} class="border border-slate-300 p-2 text-xs font-bold" />
				</div>

				<div class="flex flex-col gap-1">
					<label for="realoc-hora" class="font-bold text-slate-700 text-[11px]">Novo Horário *</label>
					<select id="realoc-hora" bind:value={novoHorarioRealocacao} class="border border-slate-300 p-2 text-xs bg-white font-bold font-mono">
						{#each slotsHorarios as h}
							<option value={h}>{h}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-3">
				<div class="flex flex-col gap-1">
					<label for="realoc-medico" class="font-bold text-slate-700 text-[11px]">Novo Médico Especialista / Escala</label>
					<select id="realoc-medico" bind:value={novoMedicoRealocacao} class="border border-slate-300 p-2 text-xs bg-white font-bold">
						<option value="">Manter escala do especialista atual</option>
						{#each medicosEspecialistas as med}
							<option value={med.nome}>{med.nome} — {med.especialidade} ({med.registro})</option>
						{/each}
					</select>
				</div>

				<div class="flex flex-col gap-1">
					<label for="realoc-motivo" class="font-bold text-slate-700 text-[11px]">Motivo / Justificativa da Realocação</label>
					<input
						id="realoc-motivo"
						type="text"
						bind:value={motivoRealocacao}
						placeholder="Ex.: Antecipação a pedido médico, ausência justificada ou remanejamento de cota..."
						class="border border-slate-300 p-2 text-xs font-sans"
					/>
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 -mx-6 -mb-6 mt-2">
				<button
					type="button"
					onclick={() => modalRealocarAberto = false}
					class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100"
				>
					Cancelar
				</button>
				<button
					type="button"
					disabled={realocandoProcessando}
					onclick={executarRealocacao}
					class="border border-purple-900 bg-purple-900 text-white px-5 py-2 font-bold uppercase hover:bg-purple-950 disabled:opacity-50"
				>
					{realocandoProcessando ? 'Realocando...' : '✓ Confirmar Realocação de Vaga'}
				</button>
			</div>
		</div>
	</Modal>
{/if}

<!-- ========================================================================= -->
<!-- MODAL: COMPROVANTE OFICIAL DE AGENDAMENTO (IMPRESSÃO NATIVA)              -->
<!-- ========================================================================= -->
{#if modalComprovanteAberto && comprovanteSelecionado}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs font-sans">
		<div class="w-full max-w-lg border border-slate-300 bg-white p-6 shadow-2xl">
			<div class="flex items-center justify-between border-b-2 border-slate-900 pb-3">
				<div class="flex items-center gap-2">
					<div class="bg-blue-900 px-2 py-0.5 font-mono text-xs font-bold text-white uppercase">UNISISM</div>
					<div class="font-mono text-xs font-bold text-slate-900 uppercase">Comprovante de Agendamento</div>
				</div>
				<button
					type="button"
					onclick={() => modalComprovanteAberto = false}
					class="font-mono text-xs font-bold text-slate-500 hover:text-slate-900"
				>
					✕ FECHAR
				</button>
			</div>

			<div class="mt-4 border border-slate-200 bg-slate-50 p-4 font-mono text-xs space-y-2">
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Protocolo:</span>
					<span class="font-bold text-blue-900">{comprovanteSelecionado.protocolo}</span>
				</div>
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Paciente:</span>
					<span class="font-bold text-slate-900">{comprovanteSelecionado.paciente.nome}</span>
				</div>
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">CPF:</span>
					<span class="font-bold text-slate-900">{comprovanteSelecionado.paciente.cpf}</span>
				</div>
				{#if comprovanteSelecionado.paciente.cartaoSus}
					<div class="flex justify-between border-b border-slate-200 pb-1">
						<span class="text-slate-500 uppercase">Cartão SUS:</span>
						<span class="font-bold text-slate-900">{comprovanteSelecionado.paciente.cartaoSus}</span>
					</div>
				{/if}
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Data Agendada:</span>
					<span class="font-bold text-emerald-800 text-sm">{formatarData(comprovanteSelecionado.agendamentoPrevisto)}</span>
				</div>
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Especialidade:</span>
					<span class="font-bold text-slate-900">{comprovanteSelecionado.solicitacao.especialidadeSolicitada}</span>
				</div>
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Local:</span>
					<span class="font-bold text-slate-900">Centro Municipal de Especialidades</span>
				</div>
				{#if comprovanteSelecionado.observacoesRegulacao}
					<div class="pt-1">
						<span class="text-slate-500 uppercase block mb-0.5">Orientações:</span>
						<p class="font-sans text-slate-800 text-[11px] bg-white p-2 border border-slate-200">
							{comprovanteSelecionado.observacoesRegulacao}
						</p>
					</div>
				{/if}
			</div>

			<div class="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
				<button
					type="button"
					onclick={() => modalComprovanteAberto = false}
					class="border border-slate-300 bg-white px-4 py-2 font-mono text-xs font-bold text-slate-700 uppercase hover:bg-slate-100"
				>
					Fechar
				</button>
				<button
					type="button"
					onclick={acionarImpressao}
					class="border border-blue-900 bg-blue-900 px-5 py-2 font-mono text-xs font-bold text-white uppercase hover:bg-blue-950 flex items-center gap-1.5"
				>
					🖨️ Imprimir Comprovante
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	select, input, button {
		border-radius: 0 !important;
	}
</style>
