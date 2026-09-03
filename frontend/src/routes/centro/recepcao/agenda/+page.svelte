<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import type { Encaminhamento, PrioridadeClinica, StatusAtendimentoCentro, EscalaMedicoCentro } from '$lib/api/types';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import {
		alocarVagaPorProfissionalEEscala,
		gerarSlotsTurno,
		type TipoCentro,
		type AgendamentoOcupado,
		type EscalaProfissionalCentro
	} from '$lib/domain/centro/alocadorInteligenteEscala';

	// Interfaces do Especialista com Escala Estruturada
	interface EspecialistaAgendaItem {
		id: string;
		nome: string;
		crm: string;
		especialidade: string;
		diasSemana: string[];
		diasSemanaNumeros: number[];
		diasSemanaFormatado: string;
		horarioInicio: string;
		horarioFim: string;
		duracaoMinutos: number;
		vagasPorTurno: number;
		consultorio: string;
		status: string;
	}

	let encaminhamentos = $state<Encaminhamento[]>([]);
	let todosEncaminhamentosMes = $state<Encaminhamento[]>([]);
	let escalasCarregadas = $state<EscalaMedicoCentro[]>([]);
	let carregando = $state(true);
	let erro = $state('');
	let mensagemSucesso = $state('');
	let timerMensagem: any = null;

	// Centro Ativo determinado pelo órgão / rota (CEM vs CEO)
	let centroAtivoAgenda = $derived<TipoCentro>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivoAgenda === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro Municipal de Especialidades Médicas (CEM)');
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');
	let rotuloProfissional = $derived(ehCeo ? 'Cirurgião-Dentista Especialista' : 'Médico Especialista');
	let rotuloRegistro = $derived(ehCeo ? 'CRO' : 'CRM');
	let rotuloEspaco = $derived(ehCeo ? 'Cadeira Odontológica' : 'Consultório Médico');

	// Modo de Visualização da Agenda (Calendário Mensal por Médico vs Grade de Horários vs Lista)
	let visaoModo = $state<'CALENDARIO' | 'GRADE' | 'LISTA'>('CALENDARIO');

	// Seletor de Especialista / Médico em foco (ID ou 'TODOS')
	let medicoSelecionadoId = $state<string>('');

	// Seletor de Data da Agenda
	let dataAgenda = $state(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD (hoje)
	let mesCalendario = $state(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')); // YYYY-MM

	// Filtros complementares
	let busca = $state('');

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

	// Modal de Comprovante de Agendamento Oficial
	let modalComprovanteAberto = $state(false);
	let comprovanteSelecionado = $state<Encaminhamento | null>(null);

	// Mapeamento de Dias da Semana
	const DIA_SEMANA_MAP: Record<string, number> = {
		DOM: 0, DOMINGO: 0,
		SEG: 1, SEGUNDA: 1,
		TER: 2, TERCA: 2, TERÇA: 2,
		QUA: 3, QUARTA: 3,
		QUI: 4, QUINTA: 4,
		SEX: 5, SEXTA: 5,
		SAB: 6, SABADO: 6, SÁBADO: 6
	};

	const NOMES_DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

	function formatarDiasSemana(dias: string[]): string {
		if (!dias || dias.length === 0) return 'Conforme agendamento';
		const formatados = dias.map(d => {
			const n = DIA_SEMANA_MAP[d.trim().toUpperCase()];
			return typeof n === 'number' ? NOMES_DIAS_SEMANA[n].replace('-feira', '') : d;
		});
		if (formatados.length === 1) return formatados[0] + 's';
		if (formatados.length === 2) return `${formatados[0]}s e ${formatados[1]}s`;
		return formatados.join(', ') + 's';
	}

	// Extrai horário da consulta formatado HH:MM
	function extrairHorario(nota: string | undefined): string {
		if (!nota) return '08:00';
		const match = nota.match(/(\d{2}:\d{2})/);
		return match ? match[1] : '08:00';
	}

	// Identifica o médico atribuído a um agendamento
	function extrairNomeMedicoAgendamento(enc: Encaminhamento): string {
		if (enc.profissionalAgendado) return enc.profissionalAgendado;
		if ((enc as any).profissionalAtribuido) return (enc as any).profissionalAtribuido;
		if (enc.observacoesRegulacao) {
			const m = enc.observacoesRegulacao.match(/(?:Médico|Dentista|Profissional|Especialista):\s*([^|,\n]+)/i);
			if (m && m[1]) return m[1].trim();
		}
		return '';
	}

	// Verifica se um agendamento pertence ao especialista fornecido
	function agendamentoPertenceAoMedico(enc: Encaminhamento, esp: EspecialistaAgendaItem): boolean {
		const medicoEnc = extrairNomeMedicoAgendamento(enc).toLowerCase();
		if (medicoEnc) {
			return medicoEnc.includes(esp.nome.toLowerCase()) || esp.nome.toLowerCase().includes(medicoEnc);
		}
		// Fallback por especialidade se nenhum médico estiver explicitamente citado
		if (enc.solicitacao?.especialidadeSolicitada) {
			return enc.solicitacao.especialidadeSolicitada.toLowerCase() === esp.especialidade.toLowerCase();
		}
		return false;
	}

	// Lista Consolidada de Especialistas com suas Escalas
	let listaEspecialistas = $derived.by<EspecialistaAgendaItem[]>(() => {
		const list: EspecialistaAgendaItem[] = [];
		const nomesAdicionados = new Set<string>();

		// 1. Escalas Oficiais cadastradas no Banco de Dados
		for (const esc of escalasCarregadas) {
			const nome = esc.medicoNome || 'Especialista';
			if (!nomesAdicionados.has(nome.toLowerCase())) {
				nomesAdicionados.add(nome.toLowerCase());
				const dias = Array.isArray(esc.diasSemana) ? esc.diasSemana : ['SEG', 'QUA'];
				const diasNums = Array.from(new Set(
					dias.map(d => DIA_SEMANA_MAP[d.trim().toUpperCase()]).filter(n => typeof n === 'number')
				));
				list.push({
					id: esc.id || esc.medicoId || nome.toLowerCase().replace(/\s+/g, '-'),
					nome,
					crm: esc.crm || (ehCeo ? 'CRO Ativo' : 'CRM Ativo'),
					especialidade: esc.especialidade || (ehCeo ? 'Odontologia Especializada' : 'Clínica Especializada'),
					diasSemana: dias,
					diasSemanaNumeros: diasNums,
					diasSemanaFormatado: formatarDiasSemana(dias),
					horarioInicio: esc.horarioInicio || '08:00',
					horarioFim: esc.horarioFim || '12:00',
					duracaoMinutos: esc.duracaoMinutos || (ehCeo ? 30 : 20),
					vagasPorTurno: esc.vagasPorTurno || 12,
					consultorio: (esc as any).consultorio || (ehCeo ? `Cadeira Odontológica 0${list.length + 1}` : `Consultório Médico 0${list.length + 1}`),
					status: esc.status || 'ATIVA'
				});
			}
		}

		// 2. Médicos identificados a partir dos agendamentos existentes (se não estiverem nas escalas)
		for (const enc of todosEncaminhamentosMes) {
			const nome = extrairNomeMedicoAgendamento(enc);
			if (nome && !nomesAdicionados.has(nome.toLowerCase())) {
				nomesAdicionados.add(nome.toLowerCase());
				const esp = enc.solicitacao?.especialidadeSolicitada || (ehCeo ? 'Odontologia' : 'Especialidade');
				list.push({
					id: nome.toLowerCase().replace(/\s+/g, '-'),
					nome,
					crm: (enc.solicitacao as any)?.crm || (ehCeo ? 'CRO Ativo' : 'CRM Ativo'),
					especialidade: esp,
					diasSemana: ['SEG', 'TER', 'QUA', 'QUI', 'SEX'],
					diasSemanaNumeros: [1, 2, 3, 4, 5],
					diasSemanaFormatado: 'Segunda a Sexta-feira',
					horarioInicio: '08:00',
					horarioFim: '12:00',
					duracaoMinutos: ehCeo ? 30 : 20,
					vagasPorTurno: 12,
					consultorio: ehCeo ? `Cadeira Odontológica 0${list.length + 1}` : `Consultório Médico 0${list.length + 1}`,
					status: 'ATIVA'
				});
			}
		}

		// 3. Fallback inteligente se a base estiver vazia
		if (list.length === 0) {
			if (ehCeo) {
				list.push(
					{
						id: 'dra-mariana-vasconcelos',
						nome: 'Dra. Mariana Vasconcelos',
						crm: 'CRO-PE 8940',
						especialidade: 'Endodontia',
						diasSemana: ['SEG', 'QUA'],
						diasSemanaNumeros: [1, 3],
						diasSemanaFormatado: 'Segundas e Quartas',
						horarioInicio: '08:00',
						horarioFim: '12:00',
						duracaoMinutos: 40,
						vagasPorTurno: 8,
						consultorio: 'Cadeira 01 (Endodontia Especializada)',
						status: 'ATIVA'
					},
					{
						id: 'dr-andre-santos',
						nome: 'Dr. André Santos',
						crm: 'CRO-PE 9120',
						especialidade: 'Cirurgia Bucomaxilofacial',
						diasSemana: ['TER', 'QUI'],
						diasSemanaNumeros: [2, 4],
						diasSemanaFormatado: 'Terças e Quintas',
						horarioInicio: '08:00',
						horarioFim: '12:00',
						duracaoMinutos: 30,
						vagasPorTurno: 10,
						consultorio: 'Cadeira 02 (Cirurgia & Trauma)',
						status: 'ATIVA'
					}
				);
			} else {
				list.push(
					{
						id: 'dr-roberto-medeiros',
						nome: 'Dr. Roberto Medeiros',
						crm: 'CRM-PE 14920',
						especialidade: 'Cardiologia',
						diasSemana: ['TER', 'QUI'],
						diasSemanaNumeros: [2, 4],
						diasSemanaFormatado: 'Terças e Quintas',
						horarioInicio: '08:00',
						horarioFim: '12:00',
						duracaoMinutos: 20,
						vagasPorTurno: 12,
						consultorio: 'Consultório 01 (Cardiologia)',
						status: 'ATIVA'
					},
					{
						id: 'dra-juliana-albuquerque',
						nome: 'Dra. Juliana Albuquerque',
						crm: 'CRM-PE 18230',
						especialidade: 'Neurologia',
						diasSemana: ['SEG', 'QUA'],
						diasSemanaNumeros: [1, 3],
						diasSemanaFormatado: 'Segundas e Quartas',
						horarioInicio: '13:00',
						horarioFim: '17:00',
						duracaoMinutos: 20,
						vagasPorTurno: 12,
						consultorio: 'Consultório 02 (Neurologia)',
						status: 'ATIVA'
					}
				);
			}
		}

		return list;
	});

	// Auto-seleciona o primeiro especialista se nenhum estiver selecionado
	$effect(() => {
		if (listaEspecialistas.length > 0 && !medicoSelecionadoId) {
			medicoSelecionadoId = listaEspecialistas[0].id;
		}
	});

	// Especialista ativo em foco
	let especialistaAtivo = $derived<EspecialistaAgendaItem | null>(
		listaEspecialistas.find(e => e.id === medicoSelecionadoId) || (listaEspecialistas[0] ?? null)
	);

	// Total de atendimentos do especialista selecionado no mês
	let totalAgendamentosMesEspecialista = $derived.by(() => {
		if (!especialistaAtivo) return todosEncaminhamentosMes.length;
		return todosEncaminhamentosMes.filter(e => {
			const d = e.agendamentoPrevisto?.substring(0, 7);
			return d === mesCalendario && agendamentoPertenceAoMedico(e, especialistaAtivo!);
		}).length;
	});

	async function carregarAgenda() {
		carregando = true;
		erro = '';
		try {
			const centroParam = ehCeo ? 'CENTRO_ODONTOLOGICO' : 'CENTRO_ESPECIALIDADES';
			const [resCentro, resTodos, resEscalas] = await Promise.all([
				api.centroRecepcao.listAgendaDia({ data: dataAgenda, centro: centroParam }).catch(() => null),
				api.encaminhamentos.list({ status: 'APROVADO', limit: 1000 }).catch(() => []),
				api.centroRecepcao.listEscalas({ centro: centroParam }).catch(() => [])
			]);

			escalasCarregadas = Array.isArray(resEscalas) ? resEscalas : [];

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
			erro = `Falha ao carregar agenda: ${e?.message || 'Erro no servidor'}`;
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

	// Pacientes agendados na data em foco
	let agendadosDaData = $derived(
		todosEncaminhamentosMes.filter(e => e.agendamentoPrevisto?.substring(0, 10) === dataAgenda)
	);

	// Pacientes da data filtrados pelo médico em foco
	let filtradosDoMedico = $derived.by(() => {
		if (!especialistaAtivo) return agendadosDaData;
		return agendadosDaData.filter(e => agendamentoPertenceAoMedico(e, especialistaAtivo!));
	});

	// Filtragem com busca textual
	let filtrados = $derived.by(() => {
		return filtradosDoMedico.filter(e => {
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
		const _ = [medicoSelecionadoId, busca, dataAgenda];
		paginaAtual = 1;
	});

	// Abertura do Modal de Realocação
	function abrirRealocacao(enc: Encaminhamento) {
		encaminhamentoParaRealocar = enc;
		novaDataRealocacao = enc.agendamentoPrevisto ? enc.agendamentoPrevisto.substring(0, 10) : dataAgenda;
		novoHorarioRealocacao = extrairHorario(enc.observacoesRegulacao);
		novoMedicoRealocacao = extrairNomeMedicoAgendamento(enc) || (especialistaAtivo?.nome ?? '');
		motivoRealocacao = 'Remanejamento de escala do especialista pelo Gestor';
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
				medicoNome: extrairNomeMedicoAgendamento(e)
			}));

		const escalasFormatadas: EscalaProfissionalCentro[] = listaEspecialistas.map(esp => ({
			medicoId: esp.id,
			nome: esp.nome,
			registro: esp.crm,
			centro: centroAtivoAgenda,
			especialidade: esp.especialidade,
			diasSemana: esp.diasSemana,
			horarioInicio: esp.horarioInicio,
			horarioFim: esp.horarioFim,
			duracaoMinutos: esp.duracaoMinutos,
			vagasPorTurno: esp.vagasPorTurno,
			consultorio: esp.consultorio,
			status: esp.status as any
		}));

		const otimizado = alocarVagaPorProfissionalEEscala({
			centro: centroAtivoAgenda,
			medicoNome: novoMedicoRealocacao || extrairNomeMedicoAgendamento(encaminhamentoParaRealocar),
			especialidade: encaminhamentoParaRealocar.solicitacao.especialidadeSolicitada,
			prioridade: encaminhamentoParaRealocar.solicitacao.prioridade,
			agendamentosExistentes: agendadosOcupados,
			escalasDisponiveis: escalasFormatadas,
			dataBase: new Date()
		});

		if (otimizado) {
			novaDataRealocacao = otimizado.data;
			novoHorarioRealocacao = otimizado.hora;
			if (otimizado.medicoNome) {
				novoMedicoRealocacao = otimizado.medicoNome;
			}
			motivoRealocacao = `[ALOCAÇÃO POR ESCALA ${otimizado.centro}] ${otimizado.justificativaEscala}`;
		}
	}

	async function executarRealocacao() {
		if (!encaminhamentoParaRealocar) return;
		if (!novaDataRealocacao) {
			erroModalRealocacao = 'Selecione uma nova data válida para o atendimento.';
			return;
		}

		realocandoProcessando = true;
		erroModalRealocacao = '';

		const notaAtualizada = `Profissional: ${novoMedicoRealocacao || 'Especialista'} às ${novoHorarioRealocacao} | [REALOCAÇÃO DE ESCALA] Motivo: ${motivoRealocacao.trim()}`;

		try {
			try {
				await api.centroRecepcao.desmarcarReagendar(encaminhamentoParaRealocar.id, {
					acao: 'REAGENDAR',
					novaData: novaDataRealocacao,
					novoHorario: novoHorarioRealocacao,
					unidadeDestino: nomeOrgao,
					motivo: notaAtualizada
				});
			} catch (errReag) {
				await api.centroRecepcao.remarcar(encaminhamentoParaRealocar.id, {
					novaData: novaDataRealocacao,
					novoHorario: novoHorarioRealocacao,
					unidadeDestino: nomeOrgao,
					motivo: notaAtualizada
				});
			}

			encaminhamentoParaRealocar.agendamentoPrevisto = novaDataRealocacao;
			encaminhamentoParaRealocar.observacoesRegulacao = notaAtualizada;
			(encaminhamentoParaRealocar as any).profissionalAgendado = novoMedicoRealocacao;

			mensagemSucesso = `✓ ATENDIMENTO REALOCADO COM SUCESSO!\nPaciente: ${encaminhamentoParaRealocar.paciente.nome}\nNova Data: ${formatarData(novaDataRealocacao)} às ${novoHorarioRealocacao}\nProfissional: ${novoMedicoRealocacao || 'Especialista'}`;
			modalRealocarAberto = false;

			if (timerMensagem) clearTimeout(timerMensagem);
			timerMensagem = setTimeout(() => { mensagemSucesso = ''; }, 6000);

			await carregarAgenda();
		} catch (err: any) {
			console.error(err);
			erroModalRealocacao = `Falha ao realocar: ${err?.message || 'Erro do servidor'}`;
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

	// CÁLCULO DINÂMICO DO CALENDÁRIO MENSAL BASEADO NO ESPECIALISTA SELECIONADO
	let diasDoMesCalendario = $derived.by(() => {
		const [anoStr, mesStr] = mesCalendario.split('-');
		const ano = parseInt(anoStr, 10);
		const mes = parseInt(mesStr, 10) - 1;

		const primeiroDia = new Date(ano, mes, 1);
		const ultimoDia = new Date(ano, mes + 1, 0);

		const diasNoMes = ultimoDia.getDate();
		const diaSemanaInicio = primeiroDia.getDay(); // 0 = Domingo, 1 = Segunda...

		const esp = especialistaAtivo;
		const diasSemanaEscala = esp ? esp.diasSemanaNumeros : [1, 2, 3, 4, 5];
		const vagasTurno = esp ? esp.vagasPorTurno : 12;

		const dias: Array<{
			numero: number;
			dataIso: string;
			mesAtual: boolean;
			isHoje: boolean;
			isSelecionado: boolean;
			temEscalaNoDia: boolean;
			totalAgendados: number;
			vagasLivres: number;
			capacidadePercent: number;
			urgentes: number;
			prioritarios: number;
			eletivos: number;
			pacientesPreview: Array<{ hora: string; nome: string; prioridade: PrioridadeClinica }>;
		}> = [];

		const hojeIso = new Date().toISOString().substring(0, 10);

		// Dias do mês anterior para completar o início da semana
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
				isHoje: dataIso === hojeIso,
				isSelecionado: dataIso === dataAgenda,
				temEscalaNoDia: false,
				totalAgendados: 0,
				vagasLivres: 0,
				capacidadePercent: 0,
				urgentes: 0,
				prioritarios: 0,
				eletivos: 0,
				pacientesPreview: []
			});
		}

		// Dias do mês atual
		for (let num = 1; num <= diasNoMes; num++) {
			const dataIso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(num).padStart(2, '0')}`;
			const dataObj = new Date(ano, mes, num);
			const diaSemanaNum = dataObj.getDay();
			const temEscalaNoDia = diasSemanaEscala.includes(diaSemanaNum);

			// Agendamentos deste médico específico nesta data
			const agendadosNesteDia = todosEncaminhamentosMes.filter(e => {
				const naData = e.agendamentoPrevisto?.substring(0, 10) === dataIso;
				if (!naData) return false;
				return esp ? agendamentoPertenceAoMedico(e, esp) : true;
			});

			const totalAgendados = agendadosNesteDia.length;
			const vagasLivres = temEscalaNoDia ? Math.max(0, vagasTurno - totalAgendados) : 0;
			const capacidadePercent = temEscalaNoDia && vagasTurno > 0 ? Math.min(100, Math.round((totalAgendados / vagasTurno) * 100)) : 0;

			let urg = 0;
			let prio = 0;
			let elet = 0;
			const preview: Array<{ hora: string; nome: string; prioridade: PrioridadeClinica }> = [];

			for (const a of agendadosNesteDia) {
				const p = a.solicitacao?.prioridade || 'ELETIVA';
				if (p === 'EMERGENCIA' || p === 'URGENTE') urg++;
				else if (p === 'PRIORITARIA') prio++;
				else elet++;

				if (preview.length < 3) {
					preview.push({
						hora: extrairHorario(a.observacoesRegulacao),
						nome: a.paciente?.nome?.split(' ')[0] || 'Paciente',
						prioridade: p
					});
				}
			}

			dias.push({
				numero: num,
				dataIso,
				mesAtual: true,
				isHoje: dataIso === hojeIso,
				isSelecionado: dataIso === dataAgenda,
				temEscalaNoDia,
				totalAgendados,
				vagasLivres,
				capacidadePercent,
				urgentes: urg,
				prioritarios: prio,
				eletivos: elet,
				pacientesPreview: preview
			});
		}

		// Completar dias para fechar as semanas do calendário (grade 7xN)
		const totalRestante = 7 - (dias.length % 7);
		if (totalRestante < 7) {
			const proxMes = mes + 2 > 12 ? 1 : mes + 2;
			const proxAno = mes + 2 > 12 ? ano + 1 : ano;
			for (let num = 1; num <= totalRestante; num++) {
				const dataIso = `${proxAno}-${String(proxMes).padStart(2, '0')}-${String(num).padStart(2, '0')}`;
				dias.push({
					numero: num,
					dataIso,
					mesAtual: false,
					isHoje: dataIso === hojeIso,
					isSelecionado: dataIso === dataAgenda,
					temEscalaNoDia: false,
					totalAgendados: 0,
					vagasLivres: 0,
					capacidadePercent: 0,
					urgentes: 0,
					prioritarios: 0,
					eletivos: 0,
					pacientesPreview: []
				});
			}
		}

		return dias;
	});

	// GRADE HORÁRIA DO ESPECIALISTA SELECIONADO NA DATA
	let gradeHorariosMapeada = $derived.by(() => {
		const esp = especialistaAtivo;
		const slots = esp
			? gerarSlotsTurno(esp.horarioInicio, esp.horarioFim, esp.duracaoMinutos)
			: ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

		return slots.map(hora => {
			const agendadosNesteHorario = ordenados.filter(e => extrairHorario(e.observacoesRegulacao) === hora);
			return {
				hora,
				agendados: agendadosNesteHorario,
				ocupado: agendadosNesteHorario.length > 0
			};
		});
	});

	// Verifica se a data atual é dia de escala do médico
	let dataAtualEhDiaDeEscala = $derived.by(() => {
		if (!especialistaAtivo) return true;
		const d = new Date(dataAgenda + 'T12:00:00');
		return especialistaAtivo.diasSemanaNumeros.includes(d.getDay());
	});
</script>

<svelte:head>
	<title>ERP {siglaOrgao} - Calendário por Especialista & Escalas | UniSISM</title>
</svelte:head>

<div class="flex flex-col gap-4 font-mono text-xs">
	<!-- Banner Sucesso Global -->
	{#if mensagemSucesso}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 font-bold text-emerald-900 shadow-sm flex flex-col gap-1 whitespace-pre-wrap">
			<div class="text-sm font-black flex items-center gap-2">
				<span class="bg-emerald-700 text-white px-2 py-0.5 text-xs font-mono">CONFIRMADO</span>
				<span>GESTÃO DE ESCALAS & AGENDA DO {siglaOrgao}</span>
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

	<!-- Header Principal com Navegação de Visões -->
	<section class="border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
		<div>
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				{nomeOrgao} · GESTÃO ASSISTENCIAL
			</div>
			<div class="text-lg font-bold text-slate-900 font-sans mt-0.5 flex items-center gap-2">
				<span>Calendário de Atendimentos por Especialista</span>
			</div>
			<div class="text-xs text-blue-900 font-bold mt-1 flex items-center gap-1.5 font-sans">
				<span>📅 Data Selecionada: <strong>{formatarData(dataAgenda)}</strong></span>
				<span class="text-slate-400">·</span>
				<span>({ordenados.length} consultas marcadas para o profissional)</span>
			</div>
		</div>

		<!-- Alternador de Modos de Visão -->
		<div class="flex items-center gap-2">
			<div class="flex border border-slate-300 bg-slate-100 p-0.5">
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
				<button
					type="button"
					onclick={() => visaoModo = 'LISTA'}
					class="px-3 py-1.5 font-bold uppercase text-xs transition-colors flex items-center gap-1.5 {visaoModo === 'LISTA' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'}"
				>
					<span>📋</span>
					<span>Lista de Pacientes</span>
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

	<!-- ========================================================================= -->
	<!-- SELETOR DE ESPECIALISTA / MÉDICO (BARRA DE PROFISSIONAIS EM ESCALA)       -->
	<!-- ========================================================================= -->
	<section class="border-2 border-slate-900 bg-white shadow-xs p-4 flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
			<div class="flex items-center gap-2">
				<span class="bg-blue-900 text-white px-2 py-0.5 text-[10px] font-bold uppercase">SELECIONE O PROFISSIONAL</span>
				<span class="text-xs font-bold text-slate-800 font-sans">Escalas de Atendimento & Calendário Individual</span>
			</div>
			<div class="text-[11px] text-slate-500 font-sans">
				Total de <strong>{listaEspecialistas.length}</strong> especialistas com escala cadastrada no {siglaOrgao}
			</div>
		</div>

		<!-- Carrossel / Cards de Seleção de Especialistas -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
			{#each listaEspecialistas as esp (esp.id)}
				<button
					type="button"
					onclick={() => medicoSelecionadoId = esp.id}
					class="text-left p-3 border transition-all flex flex-col justify-between gap-2 {medicoSelecionadoId === esp.id ? 'border-2 border-blue-900 bg-blue-50/70 shadow-xs ring-1 ring-blue-900' : 'border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300'}"
				>
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-2">
							<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-xs {medicoSelecionadoId === esp.id ? 'bg-blue-900 text-white' : 'bg-slate-200 text-slate-700'}">
								{esp.nome.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('')}
							</div>
							<div>
								<div class="font-bold font-sans text-xs text-slate-900 leading-tight">{esp.nome}</div>
								<div class="text-[10px] text-blue-900 font-bold font-mono">{esp.especialidade}</div>
							</div>
						</div>
						<span class="text-[9px] font-mono px-1.5 py-0.5 border {esp.status === 'ATIVA' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-amber-100 text-amber-900 border-amber-300'} font-bold">
							{esp.status}
						</span>
					</div>

					<div class="border-t border-slate-200/80 pt-1.5 flex flex-col gap-0.5 text-[10px] text-slate-600 font-sans">
						<div class="flex items-center justify-between">
							<span>🗓️ <strong>{esp.diasSemanaFormatado}</strong></span>
							<span class="font-mono text-slate-500">{esp.crm}</span>
						</div>
						<div class="flex items-center justify-between text-slate-500 text-[9px] font-mono">
							<span>⏰ {esp.horarioInicio} às {esp.horarioFim}</span>
							<span>{esp.duracaoMinutos}min/vaga ({esp.vagasPorTurno} vagas)</span>
						</div>
					</div>
				</button>
			{/each}
		</div>
	</section>

	<!-- ========================================================================= -->
	<!-- CARD DE INFORMAÇÕES DO ESPECIALISTA SELECIONADO                           -->
	<!-- ========================================================================= -->
	{#if especialistaAtivo}
		<section class="border border-blue-900 bg-blue-950 text-white p-4 shadow-sm">
			<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
				<div class="flex items-center gap-3.5">
					<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xs bg-white font-bold text-blue-950 text-lg shadow-xs">
						👨‍⚕️
					</div>
					<div>
						<div class="flex items-center gap-2 flex-wrap">
							<span class="text-base font-bold font-sans tracking-wide text-white">{especialistaAtivo.nome}</span>
							<span class="bg-blue-800 text-blue-200 px-2 py-0.5 text-[10px] font-mono font-bold uppercase">{especialistaAtivo.crm}</span>
							<span class="bg-emerald-700 text-white px-2 py-0.5 text-[10px] font-mono font-bold uppercase">{especialistaAtivo.especialidade}</span>
						</div>
						<div class="text-xs text-blue-200 font-sans mt-1 flex items-center gap-2 flex-wrap">
							<span>🏛️ {especialistaAtivo.consultorio}</span>
							<span>·</span>
							<span>🗓️ Dias de Atendimento: <strong>{especialistaAtivo.diasSemanaFormatado}</strong></span>
							<span>·</span>
							<span>⏰ Turno: <strong>{especialistaAtivo.horarioInicio} às {especialistaAtivo.horarioFim}</strong> ({especialistaAtivo.duracaoMinutos} min/consulta · {especialistaAtivo.vagasPorTurno} vagas/turno)</span>
						</div>
					</div>
				</div>

				<div class="flex items-center gap-3 border-t lg:border-t-0 lg:border-l border-blue-800 pt-3 lg:pt-0 lg:pl-4">
					<div class="flex flex-col text-right">
						<span class="text-[10px] text-blue-300 uppercase font-mono">Agendamentos no Mês</span>
						<span class="text-lg font-bold font-mono text-white">{totalAgendamentosMesEspecialista} pacientes</span>
					</div>
					<div class="h-8 w-px bg-blue-800"></div>
					<div class="flex flex-col text-right">
						<span class="text-[10px] text-blue-300 uppercase font-mono">Atendimentos em {formatarData(dataAgenda)}</span>
						<span class="text-lg font-bold font-mono text-emerald-400">{ordenados.length} / {especialistaAtivo.vagasPorTurno}</span>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- ========================================================================= -->
	<!-- VISÃO 1: CALENDÁRIO MENSAL INDIVIDUAL DO ESPECIALISTA                     -->
	<!-- ========================================================================= -->
	{#if visaoModo === 'CALENDARIO'}
		<section class="border-2 border-slate-900 bg-white shadow-md">
			<!-- Header do Calendário Mensal -->
			<div class="flex flex-wrap items-center justify-between border-b-2 border-slate-900 bg-slate-900 px-6 py-3 text-white gap-3">
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

				<!-- Legenda Clara das Cores da Escala -->
				<div class="flex items-center gap-4 text-xs font-sans">
					<div class="flex items-center gap-1.5">
						<span class="h-3 w-3 bg-emerald-100 border border-emerald-500"></span>
						<span>Dia de Atendimento da Escala</span>
					</div>
					<div class="flex items-center gap-1.5">
						<span class="h-3 w-3 bg-slate-100 border border-slate-300"></span>
						<span class="text-slate-300">Fora da Escala / Folga</span>
					</div>
					<div class="flex items-center gap-1.5">
						<span class="h-3 w-3 bg-blue-100 border-2 border-blue-900"></span>
						<span>Data em Foco</span>
					</div>
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

			<!-- Células do Calendário Mensal por Especialista -->
			<div class="grid grid-cols-7 border-collapse bg-slate-200 gap-px">
				{#each diasDoMesCalendario as dia (dia.dataIso)}
					<button
						type="button"
						onclick={() => selecionarDiaCalendario(dia.dataIso)}
						class="min-h-[120px] p-2 text-left transition-all flex flex-col justify-between {dia.isSelecionado ? 'bg-blue-50 ring-2 ring-blue-900 z-10' : dia.temEscalaNoDia ? 'bg-white hover:bg-emerald-50/40' : dia.mesAtual ? 'bg-slate-50/80 text-slate-400 hover:bg-slate-100' : 'bg-slate-100/50 text-slate-300'}"
					>
						<!-- Cabeçalho da Célula (Número do Dia + Badge da Escala) -->
						<div class="flex items-start justify-between">
							<span class="font-bold text-xs {dia.isHoje ? 'bg-blue-900 text-white px-1.5 py-0.5 rounded-xs' : dia.isSelecionado ? 'text-blue-900 text-sm font-black' : dia.temEscalaNoDia ? 'text-slate-900 font-black' : 'text-slate-400'}">
								{dia.numero}
							</span>

							{#if dia.temEscalaNoDia && dia.mesAtual}
								<span class="bg-emerald-100 text-emerald-950 font-bold px-1.5 py-0.5 text-[9px] border border-emerald-300 uppercase font-mono">
									ESCALA ATIVA
								</span>
							{:else if dia.totalAgendados > 0 && dia.mesAtual}
								<span class="bg-amber-100 text-amber-950 font-bold px-1 py-0.5 text-[8px] border border-amber-300 uppercase font-mono">
									ENCAIXE
								</span>
							{/if}
						</div>

						<!-- Corpo da Célula com Dados da Escala do Médico -->
						{#if dia.mesAtual}
							{#if dia.temEscalaNoDia}
								<div class="flex flex-col gap-1 my-1 font-sans">
									<!-- Contador de Vagas e Ocupação do Especialista -->
									<div class="flex items-center justify-between text-[10px]">
										<span class="font-bold font-mono text-slate-800">
											{dia.totalAgendados} / {especialistaAtivo?.vagasPorTurno || 12} agendados
										</span>
										{#if dia.vagasLivres > 0}
											<span class="text-emerald-700 font-bold text-[9px] bg-emerald-50 px-1 border border-emerald-200">
												{dia.vagasLivres} livres
											</span>
										{:else}
											<span class="text-rose-700 font-bold text-[9px] bg-rose-50 px-1 border border-rose-200">
												LOTADO
											</span>
										{/if}
									</div>

									<!-- Barra de Ocupação da Grade do Médico -->
									<div class="w-full bg-slate-200 h-1.5 overflow-hidden">
										<div
											class="h-full {dia.capacidadePercent >= 100 ? 'bg-rose-600' : dia.capacidadePercent >= 70 ? 'bg-amber-500' : 'bg-emerald-600'}"
											style="width: {dia.capacidadePercent}%"
										></div>
									</div>

									<!-- Prévia dos Primeiros Pacientes -->
									{#if dia.pacientesPreview.length > 0}
										<div class="flex flex-col gap-0.5 mt-0.5 text-[9px] text-slate-600 font-mono">
											{#each dia.pacientesPreview as p}
												<div class="truncate flex items-center gap-1">
													<span class="text-blue-900 font-bold">{p.hora}</span>
													<span class="truncate">{p.nome}</span>
												</div>
											{/each}
											{#if dia.totalAgendados > 3}
												<div class="text-[8px] text-slate-400 italic">
													+{dia.totalAgendados - 3} paciente(s)...
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{:else}
								<div class="my-auto text-center py-2">
									<div class="text-[10px] text-slate-400 font-sans italic">
										Sem escala
									</div>
									{#if dia.totalAgendados > 0}
										<div class="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1 mt-1">
											{dia.totalAgendados} paciente(s) marcado(s)
										</div>
									{/if}
								</div>
							{/if}
						{/if}

						<div class="text-[9px] text-slate-400 font-mono text-right">
							{dia.isSelecionado ? '▶ Selecionado' : ''}
						</div>
					</button>
				{/each}
			</div>

			<div class="border-t border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-700 font-sans">
				💡 <strong>Dica da Regulação:</strong> O calendário exibe os dias e vagas em conformidade com a escala do especialista <strong>{especialistaAtivo?.nome}</strong> ({especialistaAtivo?.diasSemanaFormatado}). Clique em qualquer dia para ver os horários detalhados.
			</div>
		</section>
	{/if}

	<!-- ========================================================================= -->
	<!-- VISÃO 2: GRADE HORÁRIA DO ESPECIALISTA SELECIONADO                        -->
	<!-- ========================================================================= -->
	{#if visaoModo === 'GRADE'}
		<section class="border border-slate-200 bg-white">
			<PanelHeader title={`Grade de Horários · ${especialistaAtivo?.nome} · ${formatarData(dataAgenda)}`} index="01">
				<div class="flex items-center gap-2">
					<input
						type="date"
						bind:value={dataAgenda}
						class="border border-slate-300 bg-white px-2 py-1 text-xs font-mono text-slate-900 font-bold outline-none"
					/>
				</div>
			</PanelHeader>

			<!-- Alerta se o dia selecionado for fora da escala do médico -->
			{#if !dataAtualEhDiaDeEscala}
				<div class="border-b border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between font-sans">
					<div>
						⚠️ <strong>Atenção:</strong> {formatarData(dataAgenda)} não é um dia habitual da escala de <strong>{especialistaAtivo?.nome}</strong> ({especialistaAtivo?.diasSemanaFormatado}).
					</div>
					<button
						type="button"
						onclick={() => visaoModo = 'CALENDARIO'}
						class="border border-amber-700 bg-amber-700 text-white px-2.5 py-1 text-[10px] font-bold uppercase font-mono"
					>
						Ver Dias Disponíveis no Calendário
					</button>
				</div>
			{/if}

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
										<div class="text-xs text-blue-950 font-bold mt-0.5 font-sans">
											{enc.solicitacao.especialidadeSolicitada} · Protocolo: {enc.protocolo} · Unidade Origem: {enc.unidadeOrigem || 'UBS'}
										</div>
										<div class="text-[11px] text-slate-600 font-sans">
											{enc.observacoesRegulacao || 'Consulta programada na escala do Centro'}
										</div>
									</div>
								{/each}
							{:else}
								<div>
									<div class="font-bold text-emerald-800 text-xs uppercase font-sans">Vaga Disponível na Escala do Especialista</div>
									<div class="text-[11px] text-slate-500 font-sans">Horário livre ({slot.hora}) para agendamento ou encaixe clínico</div>
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
										class="border border-emerald-700 bg-emerald-700 text-white px-2.5 py-1 text-xs font-bold uppercase hover:bg-emerald-800 font-mono"
									>
										✓ Confirmar Chegada
									</button>
									<button
										type="button"
										onclick={() => abrirRealocacao(enc)}
										class="border border-purple-900 bg-purple-900 text-white px-2.5 py-1 text-xs font-bold uppercase hover:bg-purple-950 font-mono"
									>
										🔄 Realocar Vaga
									</button>
									<button
										type="button"
										onclick={() => abrirComprovante(enc)}
										class="border border-slate-300 bg-white text-slate-700 px-2.5 py-1 text-xs font-bold uppercase hover:bg-slate-100 font-mono"
									>
										🖨️ Comprovante
									</button>
								{/each}
							{:else}
								<span class="text-emerald-800 font-bold text-xs bg-emerald-100 border border-emerald-300 px-2 py-1 font-mono">
									HORÁRIO LIVRE
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- ========================================================================= -->
	<!-- VISÃO 3: TABELA DETALHADA EM LISTA                                        -->
	<!-- ========================================================================= -->
	{#if visaoModo === 'LISTA'}
		<div class="border border-slate-200 bg-white shadow-xs">
			<PanelHeader title={`Pacientes Agendados · ${especialistaAtivo?.nome} · ${formatarData(dataAgenda)}`} index="02">
				<div class="flex items-center gap-2">
					<input
						type="date"
						bind:value={dataAgenda}
						class="border border-slate-300 bg-white px-2 py-0.5 text-xs font-mono font-bold text-slate-900 outline-none"
					/>
					<span class="border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600 uppercase">
						{ordenados.length} Agendados
					</span>
				</div>
			</PanelHeader>

			<!-- Busca de Paciente -->
			<div class="p-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
				<label for="busca-pac" class="font-bold text-slate-700 text-xs font-sans">Buscar:</label>
				<input
					id="busca-pac"
					type="text"
					bind:value={busca}
					placeholder="Buscar por nome do paciente, CPF ou número de protocolo..."
					class="border border-slate-300 bg-white p-1.5 text-xs font-sans w-full max-w-md outline-none focus:border-blue-900"
				/>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr class="border-b border-slate-200 bg-slate-100 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
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
									Nenhum paciente agendado para {especialistaAtivo?.nome} na data selecionada ({formatarData(dataAgenda)}).
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
											title="Realocar para outra data ou médico"
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
<!-- MODAL: REALOCAÇÃO E REMANEJAMENTO DE VAGA NA ESCALA DO ESPECIALISTA       -->
<!-- ========================================================================= -->
{#if modalRealocarAberto && encaminhamentoParaRealocar}
	<Modal
		isOpen={modalRealocarAberto}
		onClose={() => modalRealocarAberto = false}
		title="REALOCAÇÃO E REMANEJAMENTO NA ESCALA DO CENTRO"
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
					<div class="font-bold text-blue-900 uppercase text-[11px]">⚡ Alocação Automática na Escala SUS</div>
					<div class="text-[10px] text-blue-700 font-sans">Busca o próximo dia com vaga na escala do especialista conforme prioridade clínica.</div>
				</div>
				<button
					type="button"
					onclick={aplicarAlocacaoOtimizadaModal}
					class="border border-blue-900 bg-blue-900 text-white px-3 py-1.5 font-bold uppercase text-[10px] hover:bg-blue-950 shrink-0"
				>
					Calcular Vaga na Escala
				</button>
			</div>

			<!-- Atalhos Rápidos de Datas -->
			<div class="flex flex-col gap-1">
				<span class="font-bold text-slate-600 text-[10px] uppercase">Atalhos de Remanejamento:</span>
				<div class="flex flex-wrap gap-1.5">
					<button type="button" onclick={() => aplicarPresetDataRealocacao(0)} class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100">Hoje (+0d)</button>
					<button type="button" onclick={() => aplicarPresetDataRealocacao(1)} class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100">Amanhã (+1d)</button>
					<button type="button" onclick={() => aplicarPresetDataRealocacao(3)} class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100">+3 dias</button>
					<button type="button" onclick={() => aplicarPresetDataRealocacao(7)} class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100">+7 dias</button>
					<button type="button" onclick={() => aplicarPresetDataRealocacao(14)} class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100">+14 dias</button>
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
						{#each ['07:30', '08:00', '08:20', '08:30', '08:40', '09:00', '09:20', '09:30', '09:40', '10:00', '10:20', '10:30', '10:40', '11:00', '11:20', '11:30', '13:30', '14:00', '14:20', '14:30', '14:40', '15:00', '15:20', '15:30', '16:00', '16:30'] as h}
							<option value={h}>{h}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-3">
				<div class="flex flex-col gap-1">
					<label for="realoc-medico" class="font-bold text-slate-700 text-[11px]">Especialista Destino</label>
					<select id="realoc-medico" bind:value={novoMedicoRealocacao} class="border border-slate-300 p-2 text-xs bg-white font-bold">
						<option value="">Manter profissional atual ({extrairNomeMedicoAgendamento(encaminhamentoParaRealocar) || 'Especialista'})</option>
						{#each listaEspecialistas as med}
							<option value={med.nome}>{med.nome} — {med.especialidade} ({med.crm})</option>
						{/each}
					</select>
				</div>

				<div class="flex flex-col gap-1">
					<label for="realoc-motivo" class="font-bold text-slate-700 text-[11px]">Motivo da Realocação</label>
					<input
						id="realoc-motivo"
						type="text"
						bind:value={motivoRealocacao}
						placeholder="Ex.: Remanejamento de escala, antecipação clínica ou solicitação do paciente..."
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
					{realocandoProcessando ? 'Realocando...' : '✓ Confirmar Realocação'}
				</button>
			</div>
		</div>
	</Modal>
{/if}

<!-- ========================================================================= -->
<!-- MODAL: COMPROVANTE OFICIAL DE AGENDAMENTO (IMPRESSÃO NATIVA)              -->
<!-- ========================================================================= -->
{#if modalComprovanteAberto && comprovanteSelecionado}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 font-sans">
		<div class="w-full max-w-lg border-2 border-slate-900 bg-white p-6 shadow-[8px_8px_0_rgba(15,23,42,0.12)]">
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
					<span class="text-slate-500 uppercase">Especialista:</span>
					<span class="font-bold text-slate-900">{extrairNomeMedicoAgendamento(comprovanteSelecionado) || especialistaAtivo?.nome || 'Especialista do Centro'}</span>
				</div>
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Especialidade:</span>
					<span class="font-bold text-slate-900">{comprovanteSelecionado.solicitacao.especialidadeSolicitada}</span>
				</div>
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Local:</span>
					<span class="font-bold text-slate-900">{nomeOrgao}</span>
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
