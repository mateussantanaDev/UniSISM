<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import type {
		Encaminhamento,
		PrioridadeClinica,
		StatusAtendimentoCentro,
		EscalaMedicoCentro
	} from '$lib/api/types';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import {
		IconCalendar,
		IconClock,
		IconList,
		IconUser,
		IconBuildingHospital,
		IconPrinter,
		IconAlertTriangle,
		IconInfoCircle,
		IconCheck,
		IconChevronLeft,
		IconChevronRight,
		IconSearch,
		IconRefresh,
		IconBolt,
		IconX
	} from '@tabler/icons-svelte';
	import {
		alocarVagaPorProfissionalEEscala,
		gerarSlotsTurno,
		pertenceAoOrgaoCentro,
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
	let profissionaisDoCentro = $state<
		Array<{
			id: string;
			nome: string;
			registroProfissional: string;
			conselho: string;
			especialidade: string;
		}>
	>([]);
	let carregando = $state(true);
	let erro = $state('');
	let mensagemSucesso = $state('');
	let timerMensagem: any = null;

	// Centro Ativo determinado pelo órgão / rota (CEM vs CEO)
	let centroAtivoAgenda: TipoCentro = $derived(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivoAgenda === 'CEO');
	let nomeOrgao = $derived(
		ehCeo
			? 'Centro de Especialidades Odontológicas (CEO)'
			: 'Centro Municipal de Especialidades Médicas (CEM)'
	);
	let siglaOrgao = $derived(ehCeo ? 'CEO' : 'CEM');
	let rotuloProfissional = $derived(
		ehCeo ? 'Cirurgião-Dentista Especialista' : 'Médico Especialista'
	);
	let rotuloRegistro = $derived(ehCeo ? 'CRO' : 'CRM');
	let rotuloEspaco = $derived(ehCeo ? 'Cadeira Odontológica' : 'Consultório Médico');

	// Modo de Visualização da Agenda (Calendário Mensal por Médico vs Grade de Horários vs Lista)
	let visaoModo = $state<'CALENDARIO' | 'GRADE' | 'LISTA'>(
		(page.url.searchParams.get('modo') as any) || 'CALENDARIO'
	);

	// Seletor de Especialista / Médico em foco (ID ou 'TODOS')
	let medicoSelecionadoId = $state<string>('');

	// Seletor de Data da Agenda
	let dataAgenda = $state(
		page.url.searchParams.get('data') || new Date().toISOString().substring(0, 10)
	); // YYYY-MM-DD (hoje)
	let mesCalendario = $state(
		page.url.searchParams.get('data')?.substring(0, 7) ||
			new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')
	); // YYYY-MM

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
		DOM: 0,
		DOMINGO: 0,
		SEG: 1,
		SEGUNDA: 1,
		TER: 2,
		TERCA: 2,
		TERÇA: 2,
		QUA: 3,
		QUARTA: 3,
		QUI: 4,
		QUINTA: 4,
		SEX: 5,
		SEXTA: 5,
		SAB: 6,
		SABADO: 6,
		SÁBADO: 6
	};

	const NOMES_DIAS_SEMANA = [
		'Domingo',
		'Segunda-feira',
		'Terça-feira',
		'Quarta-feira',
		'Quinta-feira',
		'Sexta-feira',
		'Sábado'
	];

	function formatarDiasSemana(dias: string[]): string {
		if (!dias || dias.length === 0) return 'Conforme agendamento';
		const formatados = dias.map((d) => {
			const n = DIA_SEMANA_MAP[d.trim().toUpperCase()];
			return typeof n === 'number' ? NOMES_DIAS_SEMANA[n].replace('-feira', '') : d;
		});
		if (formatados.length === 1) return formatados[0] + 's';
		if (formatados.length === 2) return `${formatados[0]}s e ${formatados[1]}s`;
		return formatados.join(', ') + 's';
	}

	// Extrai horário da consulta formatado HH:MM a partir do encaminhamento, agendamentoPrevisto ou nota
	function extrairHorario(encOuNota: any): string {
		if (!encOuNota) return '08:00';
		if (typeof encOuNota === 'object') {
			const enc = encOuNota;
			// 1. Extrai de agendamentoPrevisto se presente (formato ISO "YYYY-MM-DDTHH:mm:ss")
			if (enc.agendamentoPrevisto) {
				const matchIso = enc.agendamentoPrevisto.match(/T(\d{2}:\d{2})/);
				if (matchIso) return matchIso[1];
				try {
					const d = new Date(enc.agendamentoPrevisto);
					const h = String(d.getHours()).padStart(2, '0');
					const m = String(d.getMinutes()).padStart(2, '0');
					if (h !== '00' || m !== '00') return `${h}:${m}`;
				} catch {}
			}
			// 2. Extrai de observacoesRegulacao
			if (enc.observacoesRegulacao) {
				const match = enc.observacoesRegulacao.match(/(\d{2}:\d{2})/);
				if (match) return match[1];
			}
			return '08:00';
		}
		const str = String(encOuNota);
		const matchIso = str.match(/T(\d{2}:\d{2})/);
		if (matchIso) return matchIso[1];
		const match = str.match(/(\d{2}:\d{2})/);
		return match ? match[1] : '08:00';
	}

	// Identifica o médico atribuído a um agendamento
	function extrairNomeMedicoAgendamento(enc: Encaminhamento): string {
		if (enc.profissionalAgendado) return enc.profissionalAgendado;
		if ((enc as any).profissionalAtribuido) return (enc as any).profissionalAtribuido;
		if (enc.observacoesRegulacao) {
			const m = enc.observacoesRegulacao.match(
				/(?:Médico|Dentista|Profissional|Especialista):\s*([^|,\n]+)/i
			);
			if (m && m[1]) return m[1].trim();
		}
		return '';
	}

	// Verifica se um agendamento pertence ao especialista fornecido
	function agendamentoPertenceAoMedico(enc: Encaminhamento, esp: EspecialistaAgendaItem): boolean {
		const medicoEnc = extrairNomeMedicoAgendamento(enc).toLowerCase();
		if (medicoEnc) {
			if (
				medicoEnc.includes(esp.nome.toLowerCase()) ||
				esp.nome.toLowerCase().includes(medicoEnc)
			) {
				return true;
			}
			// Se tiver CRM/CRO no texto ou no especialista
			if (
				esp.crm &&
				enc.solicitacao?.crm &&
				esp.crm.replace(/\D/g, '') === enc.solicitacao.crm.replace(/\D/g, '')
			) {
				return true;
			}
			const espPrimeiroNome = esp.nome.split(' ')[0].toLowerCase();
			if (espPrimeiroNome.length > 2 && medicoEnc.includes(espPrimeiroNome)) {
				return true;
			}
		}
		// Fallback por especialidade se nenhum médico estiver explicitamente citado
		if (enc.solicitacao?.especialidadeSolicitada) {
			const espEnc = enc.solicitacao.especialidadeSolicitada.toLowerCase();
			const espMed = esp.especialidade.toLowerCase();
			return espEnc.includes(espMed) || espMed.includes(espEnc);
		}
		return false;
	}

	// Lista Consolidada de Especialistas com suas Escalas (100% Real - Cadastradas no Banco)
	let listaEspecialistas: EspecialistaAgendaItem[] = $derived.by(() => {
		const list: EspecialistaAgendaItem[] = [];
		const nomesAdicionados = new Set<string>();

		// A agenda só lista quem POSSUI ESCALA CADASTRADA pelo gestor no Centro
		for (const esc of escalasCarregadas) {
			const nome = esc.medicoNome;
			if (nome && !nomesAdicionados.has(nome.toLowerCase())) {
				nomesAdicionados.add(nome.toLowerCase());
				const prof = profissionaisDoCentro.find(
					(p) =>
						(esc.medicoId && p.id === esc.medicoId) ||
						(p.nome && p.nome.toLowerCase() === nome.toLowerCase())
				);
				const dias =
					Array.isArray(esc.diasSemana) && esc.diasSemana.length > 0
						? esc.diasSemana
						: ['SEG', 'QUA'];
				const diasNums = Array.from(
					new Set(
						dias
							.map((d) => DIA_SEMANA_MAP[d.trim().toUpperCase()])
							.filter((n) => typeof n === 'number')
					)
				);
				list.push({
					id: esc.id || esc.medicoId || prof?.id || nome.toLowerCase().replace(/\s+/g, '-'),
					nome,
					crm:
						esc.crm ||
						(prof?.registroProfissional
							? `${prof.conselho} ${prof.registroProfissional}`
							: ehCeo
								? 'CRO Ativo'
								: 'CRM Ativo'),
					especialidade:
						esc.especialidade ||
						prof?.especialidade ||
						(ehCeo ? 'Odontologia Especializada' : 'Clínica Especializada'),
					diasSemana: dias,
					diasSemanaNumeros: diasNums,
					diasSemanaFormatado: formatarDiasSemana(dias),
					horarioInicio: esc.horarioInicio || '08:00',
					horarioFim: esc.horarioFim || '12:00',
					duracaoMinutos: esc.duracaoMinutos || (ehCeo ? 30 : 20),
					vagasPorTurno: esc.vagasPorTurno || 12,
					consultorio:
						(esc as any).consultorio ||
						(ehCeo
							? `Cadeira Odontológica 0${list.length + 1}`
							: `Consultório 0${list.length + 1}`),
					status: esc.status || 'ATIVA'
				});
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
	let especialistaAtivo: EspecialistaAgendaItem | null = $derived(
		listaEspecialistas.find((e) => e.id === medicoSelecionadoId) || (listaEspecialistas[0] ?? null)
	);

	// Total de atendimentos do especialista selecionado no mês
	let totalAgendamentosMesEspecialista = $derived.by(() => {
		if (!especialistaAtivo) return todosEncaminhamentosMes.length;
		return todosEncaminhamentosMes.filter((e) => {
			const d = e.agendamentoPrevisto?.substring(0, 7);
			return d === mesCalendario && agendamentoPertenceAoMedico(e, especialistaAtivo!);
		}).length;
	});

	async function carregarAgenda() {
		carregando = true;
		erro = '';
		try {
			const centroParam = ehCeo ? 'CENTRO_ODONTOLOGICO' : 'CENTRO_ESPECIALIDADES';
			const [resCentro, resTodos, resEscalas, resProfissionais] = await Promise.all([
				api.centroRecepcao
					.listAgendaDia({ data: dataAgenda, centro: centroParam })
					.catch(() => null),
				api.encaminhamentos.list({ status: 'APROVADO', limit: 1000 }).catch(() => []),
				api.centroGestao.listEscalas({ centro: siglaOrgao }).catch(() => []),
				api.centroGestao.listProfissionais({ centro: siglaOrgao }).catch(() => [])
			]);

			escalasCarregadas = Array.isArray(resEscalas) ? resEscalas : [];
			profissionaisDoCentro = Array.isArray(resProfissionais) ? resProfissionais : [];

			todosEncaminhamentosMes = resTodos.filter((e) =>
				pertenceAoOrgaoCentro(e, siglaOrgao as TipoCentro)
			);

			if (resCentro && Array.isArray(resCentro.agendamentos)) {
				encaminhamentos = (resCentro.agendamentos as any[]).filter((e) =>
					pertenceAoOrgaoCentro(e, siglaOrgao as TipoCentro)
				);
			} else {
				encaminhamentos = todosEncaminhamentosMes.filter(
					(e) => e.agendamentoPrevisto?.substring(0, 10) === dataAgenda
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
		todosEncaminhamentosMes.filter((e) => e.agendamentoPrevisto?.substring(0, 10) === dataAgenda)
	);

	// Pacientes da data filtrados pelo médico em foco
	let filtradosDoMedico = $derived.by(() => {
		if (!especialistaAtivo) return agendadosDaData;
		return agendadosDaData.filter((e) => agendamentoPertenceAoMedico(e, especialistaAtivo!));
	});

	// Filtragem com busca textual
	let filtrados = $derived.by(() => {
		return filtradosDoMedico.filter((e) => {
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
			const horaA = extrairHorario(a);
			const horaB = extrairHorario(b);
			return horaA.localeCompare(horaB);
		});
		return res;
	});

	// Paginação da lista
	let totalPaginas = $derived(Math.ceil(ordenados.length / itensPorPagina));
	let paginaExibida = $derived(Math.min(paginaAtual, Math.max(1, totalPaginas)));
	let paginados = $derived(
		ordenados.slice((paginaExibida - 1) * itensPorPagina, paginaExibida * itensPorPagina)
	);

	// Resetar página quando filtros mudam
	$effect(() => {
		const _ = [medicoSelecionadoId, busca, dataAgenda];
		paginaAtual = 1;
	});

	// Abertura do Modal de Realocação
	function abrirRealocacao(enc: Encaminhamento) {
		encaminhamentoParaRealocar = enc;
		novaDataRealocacao = enc.agendamentoPrevisto
			? enc.agendamentoPrevisto.substring(0, 10)
			: dataAgenda;
		novoHorarioRealocacao = extrairHorario(enc);
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
			.filter((e) => e.agendamentoPrevisto && e.id !== encaminhamentoParaRealocar!.id)
			.map((e) => ({
				data: e.agendamentoPrevisto!.substring(0, 10),
				hora: extrairHorario(e),
				medicoNome: extrairNomeMedicoAgendamento(e)
			}));

		const escalasFormatadas: EscalaProfissionalCentro[] = listaEspecialistas.map((esp) => ({
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
			timerMensagem = setTimeout(() => {
				mensagemSucesso = '';
			}, 6000);

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
		if (
			!confirm(
				`Confirmar cancelamento do agendamento de ${enc.paciente.nome}? O paciente retornará para a fila de regulação.`
			)
		) {
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
			timerMensagem = setTimeout(() => {
				mensagemSucesso = '';
			}, 5000);
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
			timerMensagem = setTimeout(() => {
				mensagemSucesso = '';
			}, 4000);
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
			const agendadosNesteDia = todosEncaminhamentosMes.filter((e) => {
				const naData = e.agendamentoPrevisto?.substring(0, 10) === dataIso;
				if (!naData) return false;
				return esp ? agendamentoPertenceAoMedico(e, esp) : true;
			});

			const totalAgendados = agendadosNesteDia.length;
			const vagasLivres = temEscalaNoDia ? Math.max(0, vagasTurno - totalAgendados) : 0;
			const capacidadePercent =
				temEscalaNoDia && vagasTurno > 0
					? Math.min(100, Math.round((totalAgendados / vagasTurno) * 100))
					: 0;

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
						hora: extrairHorario(a),
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
			: [
					'08:00',
					'08:30',
					'09:00',
					'09:30',
					'10:00',
					'10:30',
					'11:00',
					'11:30',
					'13:30',
					'14:00',
					'14:30',
					'15:00',
					'15:30',
					'16:00',
					'16:30'
				];

		return slots.map((hora) => {
			const agendadosNesteHorario = ordenados.filter((e) => extrairHorario(e) === hora);
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
		<div
			class="flex flex-col gap-1 border-2 border-emerald-700 bg-emerald-50 p-4 font-bold whitespace-pre-wrap text-emerald-900 shadow-sm"
		>
			<div class="flex items-center gap-2 text-sm font-black">
				<span class="bg-emerald-700 px-2 py-0.5 font-mono text-xs text-white">CONFIRMADO</span>
				<span>GESTÃO DE ESCALAS & AGENDA DO {siglaOrgao}</span>
			</div>
			<div class="mt-0.5 font-mono text-xs font-normal">{mensagemSucesso}</div>
		</div>
	{/if}

	<!-- Banner Erro Global -->
	{#if erro}
		<div
			class="flex items-center gap-2 border border-rose-600 bg-rose-50 p-3 font-semibold text-rose-900"
		>
			<IconAlertTriangle size={16} class="shrink-0 text-rose-700" />
			<span>{erro}</span>
		</div>
	{/if}

	<!-- Header Principal com Navegação de Visões -->
	<section
		class="flex flex-wrap items-center justify-between gap-4 border border-slate-200 bg-white p-4"
	>
		<div>
			<div class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
				{nomeOrgao} · GESTÃO ASSISTENCIAL
			</div>
			<div class="mt-0.5 flex items-center gap-2 font-sans text-lg font-bold text-slate-900">
				<span>Agenda Assistencial & Atendimentos</span>
			</div>
			<div class="mt-1 flex items-center gap-1.5 font-sans text-xs font-bold text-blue-900">
				<IconCalendar size={14} />
				<span>Data Selecionada: <strong>{formatarData(dataAgenda)}</strong></span>
				<span class="text-slate-400">·</span>
				<span>({ordenados.length} consultas marcadas para o profissional)</span>
			</div>
		</div>

		<!-- Alternador de Modos de Visão -->
		<div class="flex items-center gap-2">
			<div class="flex border border-slate-300 bg-slate-100 p-0.5">
				<button
					type="button"
					onclick={() => (visaoModo = 'CALENDARIO')}
					class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase transition-colors {visaoModo ===
					'CALENDARIO'
						? 'bg-blue-900 text-white shadow-xs'
						: 'text-slate-700 hover:bg-slate-200'}"
				>
					<IconCalendar size={14} />
					<span>Calendário Mensal</span>
				</button>
				<button
					type="button"
					onclick={() => (visaoModo = 'GRADE')}
					class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase transition-colors {visaoModo ===
					'GRADE'
						? 'bg-blue-900 text-white shadow-xs'
						: 'text-slate-700 hover:bg-slate-200'}"
				>
					<IconClock size={14} />
					<span>Grade de Horários</span>
				</button>
				<button
					type="button"
					onclick={() => (visaoModo = 'LISTA')}
					class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase transition-colors {visaoModo ===
					'LISTA'
						? 'bg-blue-900 text-white shadow-xs'
						: 'text-slate-700 hover:bg-slate-200'}"
				>
					<IconList size={14} />
					<span>Lista de Pacientes</span>
				</button>
			</div>

			<button
				type="button"
				onclick={irParaHoje}
				class="border border-blue-900 bg-white px-3 py-1.5 text-xs font-bold tracking-wider text-blue-900 uppercase hover:bg-blue-50"
			>
				Hoje
			</button>
		</div>
	</section>

	<!-- ========================================================================= -->
	<!-- SELETOR DE ESPECIALISTA / MÉDICO (DROPDOWN DINÂMICO DA BASE)              -->
	<!-- ========================================================================= -->
	<section class="flex flex-col gap-3 border-2 border-slate-900 bg-white p-4 shadow-xs">
		<div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
			<div class="flex w-full flex-col gap-1.5 lg:max-w-md">
				<label
					for="select-prof"
					class="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 uppercase"
				>
					<IconUser size={14} class="text-blue-900" />
					<span>Selecionar {rotuloProfissional}</span>
				</label>
				{#if listaEspecialistas.length > 0}
					<select
						id="select-prof"
						bind:value={medicoSelecionadoId}
						class="border-2 border-slate-900 bg-white p-2.5 font-sans text-xs font-bold text-slate-900 shadow-xs focus:ring-2 focus:ring-blue-900 focus:outline-none"
					>
						{#each listaEspecialistas as esp}
							<option value={esp.id}>
								{esp.nome} — {esp.especialidade} ({esp.crm})
							</option>
						{/each}
					</select>
				{:else}
					<div
						class="border border-dashed border-amber-400 bg-amber-50 p-2.5 font-sans text-xs text-amber-900"
					>
						Nenhum especialista cadastrado para este centro. <a
							href="/{siglaOrgao.toLowerCase()}/gestao/vagas"
							class="font-bold underline">Cadastre uma Escala</a
						>.
					</div>
				{/if}
			</div>

			{#if especialistaAtivo}
				<div
					class="flex flex-wrap items-center gap-4 border border-slate-300 bg-slate-50 p-3 font-sans text-xs"
				>
					<div class="flex flex-col">
						<span class="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
							<IconBuildingHospital size={12} class="text-blue-900" />
							<span>{rotuloEspaco}</span>
						</span>
						<span class="font-bold text-slate-900">{especialistaAtivo.consultorio}</span>
					</div>
					<div class="hidden h-6 w-px bg-slate-300 sm:block"></div>
					<div class="flex flex-col">
						<span class="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
							<IconCalendar size={12} class="text-blue-900" />
							<span>Dias de Escala</span>
						</span>
						<span class="font-bold text-blue-900">{especialistaAtivo.diasSemanaFormatado}</span>
					</div>
					<div class="hidden h-6 w-px bg-slate-300 sm:block"></div>
					<div class="flex flex-col">
						<span class="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
							<IconClock size={12} class="text-blue-900" />
							<span>Horário & Vagas</span>
						</span>
						<span class="font-mono font-bold text-slate-700"
							>{especialistaAtivo.horarioInicio} às {especialistaAtivo.horarioFim} ({especialistaAtivo.vagasPorTurno}
							vagas/turno)</span
						>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- ========================================================================= -->
	<!-- CARD DE INFORMAÇÕES DO ESPECIALISTA SELECIONADO                           -->
	<!-- ========================================================================= -->
	{#if especialistaAtivo}
		<section class="border border-blue-900 bg-blue-950 p-4 text-white shadow-sm">
			<div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
				<div class="flex items-center gap-3.5">
					<div
						class="flex h-11 w-11 shrink-0 items-center justify-center bg-white font-bold text-blue-950 shadow-xs"
					>
						<IconUser size={24} />
					</div>
					<div>
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-sans text-base font-bold tracking-wide text-white"
								>{especialistaAtivo.nome}</span
							>
							<span
								class="bg-blue-800 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-200 uppercase"
								>{especialistaAtivo.crm}</span
							>
							<span
								class="bg-emerald-700 px-2 py-0.5 font-mono text-[10px] font-bold text-white uppercase"
								>{especialistaAtivo.especialidade}</span
							>
						</div>
						<div class="mt-1 flex flex-wrap items-center gap-2 font-sans text-xs text-blue-200">
							<span>{especialistaAtivo.consultorio}</span>
							<span>·</span>
							<span
								>Dias de Atendimento: <strong>{especialistaAtivo.diasSemanaFormatado}</strong></span
							>
							<span>·</span>
							<span
								>Turno: <strong
									>{especialistaAtivo.horarioInicio} às {especialistaAtivo.horarioFim}</strong
								>
								({especialistaAtivo.duracaoMinutos} min/consulta · {especialistaAtivo.vagasPorTurno} vagas/turno)</span
							>
						</div>
					</div>
				</div>

				<div
					class="flex items-center gap-3 border-t border-blue-800 pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4"
				>
					<div class="flex flex-col text-right">
						<span class="font-mono text-[10px] text-blue-300 uppercase">Agendamentos no Mês</span>
						<span class="font-mono text-lg font-bold text-white"
							>{totalAgendamentosMesEspecialista} pacientes</span
						>
					</div>
					<div class="h-8 w-px bg-blue-800"></div>
					<div class="flex flex-col text-right">
						<span class="font-mono text-[10px] text-blue-300 uppercase"
							>Atendimentos em {formatarData(dataAgenda)}</span
						>
						<span class="font-mono text-lg font-bold text-emerald-400"
							>{ordenados.length} / {especialistaAtivo.vagasPorTurno}</span
						>
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
			<div
				class="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-900 bg-slate-900 px-6 py-3 text-white"
			>
				<div class="flex items-center gap-3">
					<button
						type="button"
						onclick={() => navegarMes(-1)}
						class="border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold uppercase hover:bg-slate-700"
						title="Mês Anterior"
					>
						◀ Mês Anterior
					</button>

					<span class="font-sans text-base font-bold tracking-wider uppercase">
						{new Date(
							parseInt(mesCalendario.split('-')[0]),
							parseInt(mesCalendario.split('-')[1]) - 1
						).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
					</span>

					<button
						type="button"
						onclick={() => navegarMes(1)}
						class="border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold uppercase hover:bg-slate-700"
						title="Próximo Mês"
					>
						Próximo Mês ▶
					</button>
				</div>

				<!-- Legenda Clara das Cores da Escala -->
				<div class="flex items-center gap-4 font-sans text-xs">
					<div class="flex items-center gap-1.5">
						<span class="h-3 w-3 border border-emerald-500 bg-emerald-100"></span>
						<span>Dia de Atendimento da Escala</span>
					</div>
					<div class="flex items-center gap-1.5">
						<span class="h-3 w-3 border border-slate-300 bg-slate-100"></span>
						<span class="text-slate-300">Fora da Escala / Folga</span>
					</div>
					<div class="flex items-center gap-1.5">
						<span class="h-3 w-3 border-2 border-blue-900 bg-blue-100"></span>
						<span>Data em Foco</span>
					</div>
				</div>
			</div>

			<!-- Grid dos 7 Dias da Semana -->
			<div
				class="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center font-mono text-[11px] font-bold text-slate-700 uppercase"
			>
				<div class="border-r border-slate-200 py-2.5 text-rose-700">DOMINGO</div>
				<div class="border-r border-slate-200 py-2.5">SEGUNDA</div>
				<div class="border-r border-slate-200 py-2.5">TERÇA</div>
				<div class="border-r border-slate-200 py-2.5">QUARTA</div>
				<div class="border-r border-slate-200 py-2.5">QUINTA</div>
				<div class="border-r border-slate-200 py-2.5">SEXTA</div>
				<div class="py-2.5 text-rose-700">SÁBADO</div>
			</div>

			<!-- Células do Calendário Mensal por Especialista -->
			<div class="grid border-collapse grid-cols-7 gap-px bg-slate-200">
				{#each diasDoMesCalendario as dia (dia.dataIso)}
					<button
						type="button"
						onclick={() => selecionarDiaCalendario(dia.dataIso)}
						class="flex min-h-[120px] flex-col justify-between p-2 text-left transition-all {dia.isSelecionado
							? 'z-10 bg-blue-50 ring-2 ring-blue-900'
							: dia.temEscalaNoDia
								? 'bg-white hover:bg-emerald-50/40'
								: dia.mesAtual
									? 'bg-slate-50/80 text-slate-400 hover:bg-slate-100'
									: 'bg-slate-100/50 text-slate-300'}"
					>
						<!-- Cabeçalho da Célula (Número do Dia + Badge da Escala) -->
						<div class="flex items-start justify-between">
							<span
								class="text-xs font-bold {dia.isHoje
									? 'rounded-xs bg-blue-900 px-1.5 py-0.5 text-white'
									: dia.isSelecionado
										? 'text-sm font-black text-blue-900'
										: dia.temEscalaNoDia
											? 'font-black text-slate-900'
											: 'text-slate-400'}"
							>
								{dia.numero}
							</span>

							{#if dia.temEscalaNoDia && dia.mesAtual}
								<span
									class="border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-950 uppercase"
								>
									ESCALA ATIVA
								</span>
							{:else if dia.totalAgendados > 0 && dia.mesAtual}
								<span
									class="border border-amber-300 bg-amber-100 px-1 py-0.5 font-mono text-[8px] font-bold text-amber-950 uppercase"
								>
									ENCAIXE
								</span>
							{/if}
						</div>

						<!-- Corpo da Célula com Dados da Escala do Médico -->
						{#if dia.mesAtual}
							{#if dia.temEscalaNoDia}
								<div class="my-1 flex flex-col gap-1 font-sans">
									<!-- Contador de Vagas e Ocupação do Especialista -->
									<div class="flex items-center justify-between text-[10px]">
										<span class="font-mono font-bold text-slate-800">
											{dia.totalAgendados} / {especialistaAtivo?.vagasPorTurno || 12} agendados
										</span>
										{#if dia.vagasLivres > 0}
											<span
												class="border border-emerald-200 bg-emerald-50 px-1 text-[9px] font-bold text-emerald-700"
											>
												{dia.vagasLivres} livres
											</span>
										{:else}
											<span
												class="border border-rose-200 bg-rose-50 px-1 text-[9px] font-bold text-rose-700"
											>
												LOTADO
											</span>
										{/if}
									</div>

									<!-- Barra de Ocupação da Grade do Médico -->
									<div class="h-1.5 w-full overflow-hidden bg-slate-200">
										<div
											class="h-full {dia.capacidadePercent >= 100
												? 'bg-rose-600'
												: dia.capacidadePercent >= 70
													? 'bg-amber-500'
													: 'bg-emerald-600'}"
											style="width: {dia.capacidadePercent}%"
										></div>
									</div>

									<!-- Prévia dos Primeiros Pacientes -->
									{#if dia.pacientesPreview.length > 0}
										<div class="mt-0.5 flex flex-col gap-0.5 font-mono text-[9px] text-slate-600">
											{#each dia.pacientesPreview as p}
												<div class="flex items-center gap-1 truncate">
													<span class="font-bold text-blue-900">{p.hora}</span>
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
								<div class="my-auto py-2 text-center">
									<div class="font-sans text-[10px] text-slate-400 italic">Sem escala</div>
									{#if dia.totalAgendados > 0}
										<div
											class="mt-1 border border-amber-200 bg-amber-50 px-1 text-[9px] font-bold text-amber-800"
										>
											{dia.totalAgendados} paciente(s) marcado(s)
										</div>
									{/if}
								</div>
							{/if}
						{/if}

						<div class="text-right font-mono text-[9px] text-slate-400">
							{dia.isSelecionado ? '▶ Selecionado' : ''}
						</div>
					</button>
				{/each}
			</div>

			<div
				class="flex items-center justify-center gap-1.5 border-t border-slate-200 bg-slate-50 p-3 text-center font-sans text-xs text-slate-700"
			>
				<IconInfoCircle size={14} class="shrink-0 text-blue-900" />
				<span
					><strong>Dica da Regulação:</strong> O calendário exibe os dias e vagas em conformidade
					com a escala do especialista <strong>{especialistaAtivo?.nome}</strong>
					({especialistaAtivo?.diasSemanaFormatado}). Clique em qualquer dia para ver os horários
					detalhados.</span
				>
			</div>
		</section>
	{/if}

	<!-- ========================================================================= -->
	<!-- VISÃO 2: GRADE HORÁRIA DO ESPECIALISTA SELECIONADO                        -->
	<!-- ========================================================================= -->
	{#if visaoModo === 'GRADE'}
		<section class="border border-slate-200 bg-white">
			<PanelHeader
				title={`Grade de Horários · ${especialistaAtivo?.nome} · ${formatarData(dataAgenda)}`}
				index="01"
			>
				<div class="flex items-center gap-2">
					<input
						type="date"
						bind:value={dataAgenda}
						class="border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-900 outline-none"
					/>
				</div>
			</PanelHeader>

			<!-- Alerta se o dia selecionado for fora da escala do médico -->
			{#if !dataAtualEhDiaDeEscala}
				<div
					class="flex items-center justify-between border-b border-amber-300 bg-amber-50 p-3 font-sans text-xs text-amber-900"
				>
					<div class="flex items-center gap-1.5">
						<IconAlertTriangle size={14} class="shrink-0 text-amber-800" />
						<span
							><strong>Atenção:</strong>
							{formatarData(dataAgenda)} não é um dia habitual da escala de
							<strong>{especialistaAtivo?.nome}</strong>
							({especialistaAtivo?.diasSemanaFormatado}).</span
						>
					</div>
					<button
						type="button"
						onclick={() => (visaoModo = 'CALENDARIO')}
						class="border border-amber-700 bg-amber-700 px-2.5 py-1 font-mono text-[10px] font-bold text-white uppercase"
					>
						Ver Dias Disponíveis no Calendário
					</button>
				</div>
			{/if}

			<div class="flex flex-col gap-3 p-4">
				{#each gradeHorariosMapeada as slot (slot.hora)}
					<div
						class="border {slot.ocupado
							? 'border-blue-900 bg-blue-50/40'
							: 'border-slate-200 bg-slate-50'} flex flex-col justify-between gap-3 p-3 transition-colors md:flex-row md:items-center"
					>
						<div class="flex items-center gap-4">
							<div
								class="flex h-12 w-20 shrink-0 items-center justify-center text-base font-bold {slot.ocupado
									? 'bg-blue-900 text-white'
									: 'bg-slate-200 text-slate-600'}"
							>
								{slot.hora}
							</div>

							{#if slot.ocupado}
								{#each slot.agendados as enc}
									<div class="flex flex-col">
										<div class="flex items-center gap-2">
											<span class="font-sans text-sm font-bold text-slate-900"
												>{enc.paciente.nome}</span
											>
											<span class="font-mono text-xs text-slate-500">(CPF: {enc.paciente.cpf})</span
											>
											<StatusBadge prioridade={enc.solicitacao.prioridade} />
										</div>
										<div class="mt-0.5 font-sans text-xs font-bold text-blue-950">
											{enc.solicitacao.especialidadeSolicitada} · Protocolo: {enc.protocolo} · Unidade
											Origem: {enc.unidadeOrigem || 'UBS'}
										</div>
										<div class="font-sans text-[11px] text-slate-600">
											{enc.observacoesRegulacao || 'Consulta programada na escala do Centro'}
										</div>
									</div>
								{/each}
							{:else}
								<div>
									<div class="font-sans text-xs font-bold text-emerald-800 uppercase">
										Vaga Disponível na Escala do Especialista
									</div>
									<div class="font-sans text-[11px] text-slate-500">
										Horário livre ({slot.hora}) para agendamento ou encaixe clínico
									</div>
								</div>
							{/if}
						</div>

						<!-- Ações do Slot -->
						<div class="flex items-center justify-end gap-2">
							{#if slot.ocupado}
								{#each slot.agendados as enc}
									<button
										type="button"
										onclick={() => registrarPresencaRecepcao(enc, 'AGUARDANDO_ATENDIMENTO')}
										class="flex items-center gap-1 border border-emerald-700 bg-emerald-700 px-2.5 py-1 font-mono text-xs font-bold text-white uppercase hover:bg-emerald-800"
									>
										<IconCheck size={12} />
										<span>Chegada</span>
									</button>
									<button
										type="button"
										onclick={() => abrirRealocacao(enc)}
										class="flex items-center gap-1 border border-purple-900 bg-purple-900 px-2.5 py-1 font-mono text-xs font-bold text-white uppercase hover:bg-purple-950"
									>
										<IconRefresh size={12} />
										<span>Realocar</span>
									</button>
									<button
										type="button"
										onclick={() => abrirComprovante(enc)}
										class="flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs font-bold text-slate-700 uppercase hover:bg-slate-100"
									>
										<IconPrinter size={12} />
										<span>Comprovante</span>
									</button>
								{/each}
							{:else}
								<span
									class="border border-emerald-300 bg-emerald-100 px-2 py-1 font-mono text-xs font-bold text-emerald-800"
								>
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
			<PanelHeader
				title={`Pacientes Agendados · ${especialistaAtivo?.nome} · ${formatarData(dataAgenda)}`}
				index="02"
			>
				<div class="flex items-center gap-2">
					<input
						type="date"
						bind:value={dataAgenda}
						class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-900 outline-none"
					/>
					<span
						class="border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600 uppercase"
					>
						{ordenados.length} Agendados
					</span>
				</div>
			</PanelHeader>

			<!-- Busca de Paciente -->
			<div class="flex items-center gap-3 border-b border-slate-200 bg-slate-50 p-3">
				<label for="busca-pac" class="font-sans text-xs font-bold text-slate-700">Buscar:</label>
				<input
					id="busca-pac"
					type="text"
					bind:value={busca}
					placeholder="Buscar por nome do paciente, CPF ou número de protocolo..."
					class="w-full max-w-md border border-slate-300 bg-white p-1.5 font-sans text-xs outline-none focus:border-blue-900"
				/>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-xs">
					<thead>
						<tr
							class="border-b border-slate-200 bg-slate-100 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase"
						>
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
									Nenhum paciente agendado para {especialistaAtivo?.nome} na data selecionada ({formatarData(
										dataAgenda
									)}).
								</td>
							</tr>
						{:else}
							{#each paginados as enc (enc.id)}
								<tr class="border-b border-slate-100 transition-colors hover:bg-slate-50">
									<td class="border-r border-slate-100 px-3 py-2.5 text-sm font-bold text-blue-900">
										{extrairHorario(enc)}
									</td>
									<td class="border-r border-slate-100 px-3 py-2.5 text-slate-600">
										{enc.protocolo}
									</td>
									<td
										class="border-r border-slate-100 px-3 py-2.5 font-sans font-semibold text-slate-900"
									>
										<div>{enc.paciente.nome}</div>
										<div class="font-mono text-[10px] text-slate-500">{enc.paciente.cpf}</div>
									</td>
									<td
										class="border-r border-slate-100 px-3 py-2.5 font-sans font-semibold text-slate-900"
									>
										<div>{enc.solicitacao.especialidadeSolicitada}</div>
										{#if enc.triagemRealizada}
											<div
												class="py-0.2 mt-0.5 w-fit border border-emerald-300 bg-emerald-50 px-1 font-mono text-[9px] font-bold text-emerald-800"
											>
												TRIADO (Enf. {enc.triagemPorNome || 'Enfermagem'})
											</div>
										{:else if enc.necessitaTriagem}
											<div
												class="py-0.2 mt-0.5 w-fit border border-amber-300 bg-amber-50 px-1 font-mono text-[9px] font-bold text-amber-800"
											>
												EXIGE TRIAGEM
											</div>
										{/if}
									</td>
									<td class="border-r border-slate-100 px-3 py-2.5">
										<StatusBadge prioridade={enc.solicitacao.prioridade} />
									</td>
									<td
										class="max-w-xs truncate border-r border-slate-100 px-3 py-2.5 font-sans text-slate-700"
										title={enc.observacoesRegulacao || ''}
									>
										{enc.observacoesRegulacao || '—'}
									</td>
									<td
										class="flex items-center justify-center gap-1.5 px-3 py-2.5 text-center whitespace-nowrap"
									>
										<button
											type="button"
											onclick={() => registrarPresencaRecepcao(enc, 'AGUARDANDO_ATENDIMENTO')}
											class="flex items-center gap-1 border border-emerald-700 bg-emerald-700 px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-white uppercase hover:bg-emerald-800"
											title="Confirmar chegada do paciente"
										>
											<IconCheck size={11} />
											<span>Chegada</span>
										</button>
										<button
											type="button"
											onclick={() => abrirRealocacao(enc)}
											class="flex items-center gap-1 border border-purple-900 bg-purple-900 px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-white uppercase hover:bg-purple-950"
											title="Realocar para outra data ou médico"
										>
											<IconRefresh size={11} />
											<span>Realocar</span>
										</button>
										<button
											type="button"
											onclick={() => abrirComprovante(enc)}
											class="flex items-center gap-1 border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-blue-900 uppercase hover:bg-slate-50"
										>
											<IconPrinter size={11} />
											<span>Comprovante</span>
										</button>
										<button
											type="button"
											disabled={processandoDesmarcar}
											onclick={() => desmarcarConsulta(enc)}
											class="flex items-center gap-1 border border-red-700 bg-white px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-red-700 uppercase hover:bg-red-50 disabled:opacity-50"
										>
											<IconX size={11} />
											<span>Cancelar</span>
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
				<div
					class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-600"
				>
					<div>
						Exibindo {(paginaExibida - 1) * itensPorPagina + 1} - {Math.min(
							paginaExibida * itensPorPagina,
							ordenados.length
						)} de {ordenados.length}
					</div>
					<div class="flex items-center gap-1">
						<button
							type="button"
							disabled={paginaExibida === 1}
							onclick={() => (paginaAtual = paginaExibida - 1)}
							class="border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
						>
							&larr; Ant
						</button>
						<span class="border border-slate-300 bg-white px-3 py-1 font-bold text-slate-900">
							{paginaExibida} / {totalPaginas}
						</span>
						<button
							type="button"
							disabled={paginaExibida >= totalPaginas}
							onclick={() => (paginaAtual = paginaExibida + 1)}
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
		onClose={() => (modalRealocarAberto = false)}
		title="REALOCAÇÃO E REMANEJAMENTO NA ESCALA DO CENTRO"
		subtitle={`Protocolo: ${encaminhamentoParaRealocar.protocolo} · Paciente: ${encaminhamentoParaRealocar.paciente.nome}`}
		maxWidth="lg"
	>
		<div class="flex flex-col gap-4 font-mono text-xs">
			{#if erroModalRealocacao}
				<div
					class="flex items-center gap-1.5 border border-rose-300 bg-rose-50 p-2.5 font-bold text-rose-900"
				>
					<IconAlertTriangle size={14} class="shrink-0 text-rose-700" />
					<span>{erroModalRealocacao}</span>
				</div>
			{/if}

			<!-- Card com Dados do Paciente e Vaga Atual -->
			<div class="flex flex-col gap-1 border border-purple-200 bg-purple-50 p-3.5 font-sans">
				<div class="flex items-center justify-between">
					<div class="text-sm font-bold text-purple-950">
						{encaminhamentoParaRealocar.paciente.nome}
					</div>
					<StatusBadge prioridade={encaminhamentoParaRealocar.solicitacao.prioridade} />
				</div>
				<div class="font-mono text-xs text-purple-900">
					CPF: {encaminhamentoParaRealocar.paciente.cpf} · Especialidade:
					<strong>{encaminhamentoParaRealocar.solicitacao.especialidadeSolicitada}</strong>
				</div>
				<div class="mt-1 border-t border-purple-200 pt-1 text-[11px] text-purple-800">
					Data Atual Agendada: <strong
						>{formatarData(encaminhamentoParaRealocar.agendamentoPrevisto)}</strong
					>
					às <strong>{extrairHorario(encaminhamentoParaRealocar)}</strong>
				</div>
			</div>

			<!-- Botão de Otimização Automática -->
			<div class="flex items-center justify-between gap-3 border border-blue-200 bg-blue-50 p-3">
				<div>
					<div class="flex items-center gap-1 text-[11px] font-bold text-blue-900 uppercase">
						<IconBolt size={14} class="text-blue-900" />
						<span>Alocação Automática na Escala</span>
					</div>
					<div class="font-sans text-[10px] text-blue-700">
						Busca o próximo dia com vaga na escala do especialista conforme prioridade clínica.
					</div>
				</div>
				<button
					type="button"
					onclick={aplicarAlocacaoOtimizadaModal}
					class="shrink-0 border border-blue-900 bg-blue-900 px-3 py-1.5 text-[10px] font-bold text-white uppercase hover:bg-blue-950"
				>
					Calcular Vaga na Escala
				</button>
			</div>

			<!-- Atalhos Rápidos de Datas -->
			<div class="flex flex-col gap-1">
				<span class="text-[10px] font-bold text-slate-600 uppercase">Atalhos de Remanejamento:</span
				>
				<div class="flex flex-wrap gap-1.5">
					<button
						type="button"
						onclick={() => aplicarPresetDataRealocacao(0)}
						class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100"
						>Hoje (+0d)</button
					>
					<button
						type="button"
						onclick={() => aplicarPresetDataRealocacao(1)}
						class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100"
						>Amanhã (+1d)</button
					>
					<button
						type="button"
						onclick={() => aplicarPresetDataRealocacao(3)}
						class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100"
						>+3 dias</button
					>
					<button
						type="button"
						onclick={() => aplicarPresetDataRealocacao(7)}
						class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100"
						>+7 dias</button
					>
					<button
						type="button"
						onclick={() => aplicarPresetDataRealocacao(14)}
						class="border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100"
						>+14 dias</button
					>
				</div>
			</div>

			<!-- Formulário de Nova Data e Horário -->
			<div class="grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 md:grid-cols-2">
				<div class="flex flex-col gap-1">
					<label for="realoc-data" class="text-[11px] font-bold text-slate-700"
						>Nova Data da Consulta *</label
					>
					<input
						id="realoc-data"
						type="date"
						bind:value={novaDataRealocacao}
						class="border border-slate-300 p-2 text-xs font-bold"
					/>
				</div>

				<div class="flex flex-col gap-1">
					<label for="realoc-hora" class="text-[11px] font-bold text-slate-700"
						>Novo Horário *</label
					>
					<select
						id="realoc-hora"
						bind:value={novoHorarioRealocacao}
						class="border border-slate-300 bg-white p-2 font-mono text-xs font-bold"
					>
						{#each ['07:30', '08:00', '08:20', '08:30', '08:40', '09:00', '09:20', '09:30', '09:40', '10:00', '10:20', '10:30', '10:40', '11:00', '11:20', '11:30', '13:30', '14:00', '14:20', '14:30', '14:40', '15:00', '15:20', '15:30', '16:00', '16:30'] as h}
							<option value={h}>{h}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-3">
				<div class="flex flex-col gap-1">
					<label for="realoc-medico" class="text-[11px] font-bold text-slate-700"
						>Especialista Destino</label
					>
					<select
						id="realoc-medico"
						bind:value={novoMedicoRealocacao}
						class="border border-slate-300 bg-white p-2 text-xs font-bold"
					>
						<option value=""
							>Manter profissional atual ({extrairNomeMedicoAgendamento(
								encaminhamentoParaRealocar
							) || 'Especialista'})</option
						>
						{#each listaEspecialistas as med}
							<option value={med.nome}>{med.nome} — {med.especialidade} ({med.crm})</option>
						{/each}
					</select>
				</div>

				<div class="flex flex-col gap-1">
					<label for="realoc-motivo" class="text-[11px] font-bold text-slate-700"
						>Motivo da Realocação</label
					>
					<input
						id="realoc-motivo"
						type="text"
						bind:value={motivoRealocacao}
						placeholder="Ex.: Remanejamento de escala, antecipação clínica ou solicitação do paciente..."
						class="border border-slate-300 p-2 font-sans text-xs"
					/>
				</div>
			</div>

			<div
				class="-mx-6 mt-2 -mb-6 flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3"
			>
				<button
					type="button"
					onclick={() => (modalRealocarAberto = false)}
					class="border border-slate-300 bg-white px-4 py-2 font-bold hover:bg-slate-100"
				>
					Cancelar
				</button>
				<button
					type="button"
					disabled={realocandoProcessando}
					onclick={executarRealocacao}
					class="flex items-center gap-1.5 border border-purple-900 bg-purple-900 px-5 py-2 font-bold text-white uppercase hover:bg-purple-950 disabled:opacity-50"
				>
					<IconCheck size={14} />
					<span>{realocandoProcessando ? 'Realocando...' : 'Confirmar Realocação'}</span>
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
		<div
			class="w-full max-w-lg border-2 border-slate-900 bg-white p-6 shadow-[8px_8px_0_rgba(15,23,42,0.12)]"
		>
			<div class="flex items-center justify-between border-b-2 border-slate-900 pb-3">
				<div class="flex items-center gap-2">
					<div class="bg-blue-900 px-2 py-0.5 font-mono text-xs font-bold text-white uppercase">
						UNISISM
					</div>
					<div class="font-mono text-xs font-bold text-slate-900 uppercase">
						Comprovante de Agendamento
					</div>
				</div>
				<button
					type="button"
					onclick={() => (modalComprovanteAberto = false)}
					class="font-mono text-xs font-bold text-slate-500 hover:text-slate-900"
				>
					✕ FECHAR
				</button>
			</div>

			<div class="mt-4 space-y-2 border border-slate-200 bg-slate-50 p-4 font-mono text-xs">
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
						<span class="font-bold text-slate-900">{comprovanteSelecionado.paciente.cartaoSus}</span
						>
					</div>
				{/if}
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Data Agendada:</span>
					<span class="text-sm font-bold text-emerald-800"
						>{formatarData(comprovanteSelecionado.agendamentoPrevisto)}</span
					>
				</div>
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Especialista:</span>
					<span class="font-bold text-slate-900"
						>{extrairNomeMedicoAgendamento(comprovanteSelecionado) ||
							especialistaAtivo?.nome ||
							'Especialista do Centro'}</span
					>
				</div>
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Especialidade:</span>
					<span class="font-bold text-slate-900"
						>{comprovanteSelecionado.solicitacao.especialidadeSolicitada}</span
					>
				</div>
				<div class="flex justify-between border-b border-slate-200 pb-1">
					<span class="text-slate-500 uppercase">Local:</span>
					<span class="font-bold text-slate-900">{nomeOrgao}</span>
				</div>
				{#if comprovanteSelecionado.observacoesRegulacao}
					<div class="pt-1">
						<span class="mb-0.5 block text-slate-500 uppercase">Orientações:</span>
						<p class="border border-slate-200 bg-white p-2 font-sans text-[11px] text-slate-800">
							{comprovanteSelecionado.observacoesRegulacao}
						</p>
					</div>
				{/if}
			</div>

			<div class="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
				<button
					type="button"
					onclick={() => (modalComprovanteAberto = false)}
					class="border border-slate-300 bg-white px-4 py-2 font-mono text-xs font-bold text-slate-700 uppercase hover:bg-slate-100"
				>
					Fechar
				</button>
				<button
					type="button"
					onclick={acionarImpressao}
					class="flex items-center gap-1.5 border border-blue-900 bg-blue-900 px-5 py-2 font-mono text-xs font-bold text-white uppercase hover:bg-blue-950"
				>
					<IconPrinter size={14} />
					<span>Imprimir Comprovante</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	select,
	input,
	button {
		border-radius: 0 !important;
	}
</style>
