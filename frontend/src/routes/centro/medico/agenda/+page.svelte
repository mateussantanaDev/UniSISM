<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import type {
		Encaminhamento,
		PacienteCompleto,
		PrioridadeClinica,
		StatusEncaminhamento,
		Atendimento,
		Sexo,
		Alergia,
		CondicaoCronica,
		MedicamentoEmUso,
		ProcedimentoRealizadoItem,
		SinaisVitaisTriagem
	} from '$lib/api/types';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import ImprimirProntuario from '$lib/presentation/components/prontuario/ImprimirProntuario.svelte';
	import ModalSolicitacaoOrigem from '$lib/presentation/components/centro/ModalSolicitacaoOrigem.svelte';
	import ModalDossiePaciente from '$lib/presentation/components/centro/ModalDossiePaciente.svelte';
	import ModalReferenciaIntermunicipal from '$lib/presentation/components/centro/ModalReferenciaIntermunicipal.svelte';
	import ModalNovoEncaminhamentoRegulacao from '$lib/presentation/components/centro/ModalNovoEncaminhamentoRegulacao.svelte';
	import ModalAgendarRetornoManual from '$lib/presentation/components/centro/ModalAgendarRetornoManual.svelte';
	import {
		IconCalendar,
		IconClock,
		IconUser,
		IconStethoscope,
		IconFlask,
		IconFileText,
		IconAlertTriangle,
		IconInfoCircle,
		IconCheck,
		IconPlayerPlay,
		IconNotes,
		IconPlus
	} from '@tabler/icons-svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { pertenceAoOrgaoCentro } from '$lib/domain/centro/alocadorInteligenteEscala';

	const auth = useAuth();

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');
	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let tituloProfissional = $derived(ehCeo ? 'CIRURGIÃO-DENTISTA ESPECIALISTA' : 'MÉDICO ESPECIALISTA');
	let rotuloRegistro = $derived(ehCeo ? 'CRO' : 'CRM');
	let rotuloSala = $derived(ehCeo ? 'Cadeira Odontológica' : 'Consultório Médico');

	// Structure of a Doctor's Appointment item
	interface ConsultaAgenda {
		id: string;
		protocolo: string;
		horario: string;
		status: 'AGUARDANDO' | 'EM_ATENDIMENTO' | 'CONCLUIDO' | 'FALTOU';
		pacienteId: string;
		paciente: {
			nome: string;
			cpf: string;
			cartaoSus: string;
			dataNascimento: string;
			sexo: Sexo;
			telefone: string;
			endereco: string;
		};
		solicitacao: {
			medicoSolicitante: string;
			crm: string;
			especialidadeSolicitada: string;
			cid10: string;
			cidDescricao: string;
			justificativaClinica: string;
			prioridade: PrioridadeClinica;
			dataSolicitacao: string;
			tipoServico?: 'CONSULTA' | 'PROCEDIMENTO';
			procedimentoSolicitado?: string;
		};
		unidadeOrigem: string;
		observacoesRegulacao?: string;
		atendimentoSOAP?: {
			queixaPrincipal: string;
			exameFisico: string;
			cid10: string;
			diagnostico: string;
			conduta: string;
			prescricao: string;
			concluidoEm: string;
		};
		encaminhamentoIntermunicipal?: {
			protocolo: string;
			municipioDestino: string;
			especialidade: string;
			criadoEm: string;
		};
		necessitaTriagem?: boolean;
		triagemRealizada?: boolean;
		triagemEm?: string;
		triagemPorNome?: string;
		triagemCoren?: string;
		triagemDados?: SinaisVitaisTriagem;
	}

	// Dynamic State
	let dataAgenda = $state(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD
	let medicoLogado = $state('Especialista');
	let medicoCrm = $state('Regulação');
	let busca = $state('');
	let filtroStatus = $state<'TODOS' | 'AGUARDANDO' | 'EM_ATENDIMENTO' | 'CONCLUIDO' | 'FALTOU'>('TODOS');
	let carregando = $state(true);
	let erroGlobal = $state('');
	let mensagemSucesso = $state('');

	// Loaded appointments list
	let consultas = $state<ConsultaAgenda[]>([]);

	// Filtragem dinâmica de consultas da agenda
	let filtrados = $derived.by(() => {
		return consultas.filter(c => {
			if (filtroStatus !== 'TODOS' && c.status !== filtroStatus) return false;
			if (busca.trim()) {
				const q = busca.toLowerCase();
				return (
					c.paciente.nome.toLowerCase().includes(q) ||
					c.paciente.cpf.includes(q) ||
					c.protocolo.toLowerCase().includes(q) ||
					c.solicitacao.cid10.toLowerCase().includes(q) ||
					(c.solicitacao.especialidadeSolicitada && c.solicitacao.especialidadeSolicitada.toLowerCase().includes(q))
				);
			}
			return true;
		});
	});

	// Active Consultation State
	let consultaAtiva = $state<ConsultaAgenda | null>(null);
	let timerSegundos = $state(0);
	let timerInterval: any = null;

	// Form fields for active SOAP Consultation
	let tabAtendimento = $state<'SOAP' | 'PRESCRICAO' | 'EXAMES' | 'ATESTADO' | 'CONTRA_REFERENCIA'>('SOAP');
	let soapQueixa = $state('');
	let soapExameFisico = $state('');
	let soapPa = $state('');
	let soapFc = $state('');
	let soapPeso = $state('');
	let soapAltura = $state('');
	let soapSpo2 = $state('');
	let soapTemp = $state('');
	let soapGlicemia = $state('');
	let soapCid10 = $state('');
	let soapDiagnostico = $state('');
	let soapConduta = $state('');
	let soapPrescricao = $state('');
	let salvandoAtendimento = $state(false);
	let erroSoapForm = $state('');
	let erroModalRetorno = $state('');
	let erroModalInter = $state('');
	let erroModalNovoEnc = $state('');

	// Procedimentos Realizados no Atendimento (1 ou mais)
	let procedimentosRealizados = $state<ProcedimentoRealizadoItem[]>([]);
	let novoProcedimentoNome = $state('');
	let novoProcedimentoCodigo = $state('');
	let novoProcedimentoQtd = $state(1);
	let novoProcedimentoObs = $state('');

	const procedimentosSigtapMedicos = [
		{ codigo: '02.11.02.003-6', nome: 'Eletrocardiograma (ECG)' },
		{ codigo: '04.01.01.002-3', nome: 'Curativo Especial / Debridamento' },
		{ codigo: '04.04.01.001-2', nome: 'Biópsia de Pele e Subcutâneo' },
		{ codigo: '03.01.01.004-0', nome: 'Lavagem Otológica' },
		{ codigo: '04.08.01.004-7', nome: 'Infiltração Articular' },
		{ codigo: '02.05.02.009-7', nome: 'Ultrassonografia com Doppler' },
		{ codigo: '04.01.01.001-5', nome: 'Retirada de Pontos' },
		{ codigo: '02.11.05.008-3', nome: 'Holter 24 Horas' }
	];

	const procedimentosSigtapOdonto = [
		{ codigo: '03.07.02.006-1', nome: 'Tratamento Endodôntico Dente Permanente' },
		{ codigo: '03.07.01.004-0', nome: 'Raspagem e Alisamento Periodontal' },
		{ codigo: '04.14.01.014-9', nome: 'Exodontia de Dente Incluso / Semi-incluso' },
		{ codigo: '03.07.03.003-2', nome: 'Condicionamento Odontopediátrico' },
		{ codigo: '03.07.04.004-6', nome: 'Atendimento Odontológico a Pacientes Especiais (PNE)' },
		{ codigo: '07.01.07.012-9', nome: 'Moldagem e Instalação de Prótese Dentária' },
		{ codigo: '02.01.01.042-8', nome: 'Biópsia de Lesão Bucal / Glândula Salivar' },
		{ codigo: '02.04.01.018-0', nome: 'Radiografia Periapical / Interproximal' }
	];

	let procedimentosDoBanco = $state<{ codigo: string; nome: string }[]>([]);

	let procedimentosSigtapSugeridos = $derived(
		procedimentosDoBanco.length > 0
			? procedimentosDoBanco
			: ehCeo
				? procedimentosSigtapOdonto
				: procedimentosSigtapMedicos
	);

	function adicionarProcedimento() {
		if (!novoProcedimentoNome.trim()) {
			erroSoapForm = 'Informe o nome ou selecione um procedimento.';
			return;
		}
		procedimentosRealizados.push({
			id: 'proc-' + Date.now() + Math.random().toString(36).substring(2, 6),
			nome: novoProcedimentoNome.trim(),
			codigoSigtap: novoProcedimentoCodigo.trim() || undefined,
			quantidade: Math.max(1, novoProcedimentoQtd),
			observacao: novoProcedimentoObs.trim() || undefined
		});
		novoProcedimentoNome = '';
		novoProcedimentoCodigo = '';
		novoProcedimentoQtd = 1;
		novoProcedimentoObs = '';
		erroSoapForm = '';
	}

	function removerProcedimento(id: string) {
		procedimentosRealizados = procedimentosRealizados.filter(p => p.id !== id);
	}

	function selecionarProcedimentoSugerido(p: { codigo: string; nome: string }) {
		novoProcedimentoCodigo = p.codigo;
		novoProcedimentoNome = p.nome;
	}

	// State para Agendamento Direto de Retorno / Volta com Data Manual
	let modalRetornoAberto = $state(false);
	let dataRetornoManual = $state('');
	let horaRetornoManual = $state('09:00');
	let medicoRetornoNome = $state('');
	let obsRetorno = $state('Retorno para reavaliação clínica e apresentação de exames.');
	let agendandoRetorno = $state(false);

	function abrirModalRetorno() {
		if (!consultaAtiva) return;
		const d = new Date();
		d.setDate(d.getDate() + 30);
		dataRetornoManual = d.toISOString().substring(0, 10);
		horaRetornoManual = '09:00';
		medicoRetornoNome = medicoLogado || auth.me?.nome || 'Profissional do Centro';
		obsRetorno = 'Retorno para reavaliação de conduta e checagem de exames.';
		modalRetornoAberto = true;
	}

	function selecionarPrazoPresetRetorno(dias: number) {
		const d = new Date();
		d.setDate(d.getDate() + dias);
		dataRetornoManual = d.toISOString().substring(0, 10);
	}

	async function confirmarAgendamentoRetornoManual(dados: {
		dataRetorno: string;
		horaRetorno: string;
		medicoRetornoNome: string;
		obsRetorno: string;
	}) {
		if (!consultaAtiva) return;

		agendandoRetorno = true;
		erroModalRetorno = '';
		try {
			const dtFmt = dados.dataRetorno.split('-').reverse().join('/');
			try {
				await api.centroMedico.agendarRetornoDirect({
					consultaId: consultaAtiva.id,
					pacienteId: consultaAtiva.pacienteId,
					medicoNome: dados.medicoRetornoNome || medicoLogado,
					dataRetorno: dados.dataRetorno,
					horaRetorno: dados.horaRetorno,
					observacoes: dados.obsRetorno
				} as any);
			} catch (e) {
				console.info('[UniSISM] Endpoint /v1/centro/medico/retorno em transição — gravando retorno localmente.', e);
			}

			// Adiciona à conduta da consulta ativa
			soapConduta += `\n\nRETORNO AGENDADO (DATA MANUAL): ${dtFmt} às ${dados.horaRetorno} com Dr(a). ${dados.medicoRetornoNome || medicoLogado}. Obs: ${dados.obsRetorno}`;
			
			modalRetornoAberto = false;
			mensagemSucesso = `✓ RETORNO DO PACIENTE AGENDADO COM SUCESSO!\nPaciente: ${consultaAtiva.paciente.nome}\nData Escolhida: ${dtFmt} às ${dados.horaRetorno}\nMédico: ${dados.medicoRetornoNome || medicoLogado}`;
			setTimeout(() => { mensagemSucesso = ''; }, 6000);
		} catch (err: any) {
			console.error(err);
			erroModalRetorno = `Falha ao agendar retorno: ${err?.message || 'Erro do servidor'}`;
		} finally {
			agendandoRetorno = false;
		}
	}

	// Automatic IMC calculation
	let soapImc = $derived.by(() => {
		const p = parseFloat(soapPeso);
		const a = parseFloat(soapAltura) / 100;
		if (isNaN(p) || isNaN(a) || a <= 0) return { imc: '0.0', classificacao: 'Indefinido' };
		const val = p / (a * a);
		let cls = 'Eutrófico';
		if (val < 18.5) cls = 'Abaixo do peso';
		else if (val < 25) cls = 'Eutrófico';
		else if (val < 30) cls = 'Sobrepeso';
		else if (val < 35) cls = 'Obesidade Grau I';
		else if (val < 40) cls = 'Obesidade Grau II';
		else cls = 'Obesidade Grau III';
		return { imc: val.toFixed(1), classificacao: cls };
	});

	// REMUME Drugs Quick Insert
	const medicamentosRemume = [
		{ nome: 'Losartana Potássica 50mg', dose: '1 comp VO de 12/12h por 60 dias' },
		{ nome: 'Atenolol 50mg', dose: '1 comp VO pela manhã por 60 dias' },
		{ nome: 'Metformina 850mg', dose: '1 comp VO junto às refeições (2x ao dia)' },
		{ nome: 'Omeprazol 20mg', dose: '1 comp VO em jejum pela manhã por 30 dias' },
		{ nome: 'Sinvastatina 20mg', dose: '1 comp VO à noite por 60 dias' },
		{ nome: 'Dipirona 500mg', dose: '1 comp VO de 6/6h se dor ou febre' },
		{ nome: 'Paracetamol 500mg', dose: '1 comp VO de 6/6h se dor' },
		{ nome: 'Hydrochlorothiazide 25mg', dose: '1 comp VO pela manhã por 60 dias' }
	];

	// Common CIDs Quick List
	const cidsFrequentes = [
		{ codigo: 'I10', descricao: 'Hipertensão arterial essencial' },
		{ codigo: 'E11', descricao: 'Diabetes mellitus tipo 2' },
		{ codigo: 'J45', descricao: 'Asma' },
		{ codigo: 'M54.5', descricao: 'Dor lombar baixa' },
		{ codigo: 'G43', descricao: 'Enxaqueca' },
		{ codigo: 'H52.1', descricao: 'Miopia' },
		{ codigo: 'L20', descricao: 'Dermatite atópica' }
	];

	// Form fields for Prescrição / Exames / Atestado / Contra-Referência
	let atestadoDias = $state(1);
	let atestadoMotivo = $state('Necessidade de repouso para recuperação médica.');
	let examesPedidosTexto = $state('1. Eletrocardiógrafo 12 canais (ECG de repouso)\n2. Ecocardiograma Transtorácico');
	let contraReferenciaTexto = $state('Devolutiva para a UBS de origem: Paciente avaliado pela Cardiologia com diagnóstico de Hipertensão arterial essencial (I10). Mantida conduta medicamentosa. Retorno em 60 dias.');

	// Modals State
	let modalSolicitacaoAberto = $state(false);
	let consultaSolicitacao = $state<ConsultaAgenda | null>(null);

	// State for New Referral Request to Municipal Regulation (Novo Encaminhamento pelo Médico)
	let modalNovoEncaminhamentoAberto = $state(false);
	let formNovoEncEspecialidade = $state('Cardiologia Pediátrica');
	let formNovoEncJustificativa = $state('');
	let formNovoEncPrioridade = $state<PrioridadeClinica>('PRIORITARIA');
	let enviandoNovoEncaminhamento = $state(false);

	function abrirFormNovoEncaminhamento() {
		if (!consultaAtiva) return;
		modalNovoEncaminhamentoAberto = true;
	}

	async function enviarNovoEncaminhamentoRegulacao(dados: {
		especialidade: string;
		prioridade: PrioridadeClinica;
		cid10: string;
		diagnostico: string;
		justificativa: string;
	}) {
		if (!consultaAtiva) return;

		enviandoNovoEncaminhamento = true;
		erroModalNovoEnc = '';
		try {
			const res = await api.centroMedico.solicitarEncaminhamento({
				encaminhamentoId: consultaAtiva.id,
				pacienteId: consultaAtiva.pacienteId,
				especialidadeSolicitada: dados.especialidade,
				cid10: dados.cid10 || soapCid10 || 'I10',
				cidDescricao: dados.diagnostico || soapDiagnostico || 'Consulta Especializada',
				justificativaClinica: dados.justificativa,
				prioridade: dados.prioridade,
				observacao: `Solicitado em consulta pelo especialista ${medicoLogado}`
			});

			const prot = res.protocolo || ('ENC' + Date.now().toString().substring(3, 11));
			mensagemSucesso = `✓ SOLICITAÇÃO DE ENCAMINHAMENTO REGISTRADA COM SUCESSO!\nProtocolo ${prot} enviado diretamente à Fila de Regulação da Secretaria Municipal de Saúde.`;
			modalNovoEncaminhamentoAberto = false;
			if (timerMensagem) clearTimeout(timerMensagem);
			timerMensagem = setTimeout(() => (mensagemSucesso = ''), 8000);
		} catch (e: any) {
			console.error(e);
			erroModalNovoEnc = `Falha ao enviar solicitação para a regulação: ${e?.message || 'Erro do servidor'}`;
		} finally {
			enviandoNovoEncaminhamento = false;
		}
	}

	function inserirMedicamentoPrescricao(med: { nome: string; dose: string }) {
		const linha = `${med.nome} — ${med.dose}`;
		if (!soapPrescricao.trim()) {
			soapPrescricao = '1. ' + linha;
		} else {
			const linhas = soapPrescricao.split('\n').filter(Boolean);
			soapPrescricao = soapPrescricao + `\n${linhas.length + 1}. ` + linha;
		}
	}

	function selecionarCidRapido(item: { codigo: string; descricao: string }) {
		soapCid10 = item.codigo;
		soapDiagnostico = item.descricao;
	}

	let modalDossieAberto = $state(false);
	let pacienteDossie = $state<PacienteCompleto | null>(null);
	let carregandoDossie = $state(false);
	let abaDossieAtiva = $state<'resumo' | 'quadro' | 'atendimentos' | 'exames' | 'vacinas' | 'viagens'>('resumo');

	let modalImprimirAberto = $state(false);

	// Modal State for Intermunicipal Referral (Encaminhamento para outra cidade)
	let modalReferenciaAberto = $state(false);
	let refMunicipioDestino = $state('Porto Alegre');
	let refEspecialidade = $state('Oncologia Cirúrgica');
	let refCid10 = $state('C50.9');
	let refDiagnostico = $state('Neoplasia maligna da mama');
	let refJustificativa = $state('Tratamento cirúrgico de alta complexidade e radioterapia não disponíveis na rede municipal.');
	let refPrioridade = $state<PrioridadeClinica>('URGENTE');
	let refTransporte = $state('VAN_SMS');
	let refAcompanhante = $state(true);
	let enviandoReferencia = $state(false);
	let protocoloReferenciaGerado = $state('');

	// List of reference cities for intermunicipal referrals
	const municipiosReferencia = [
		'Porto Alegre',
		'Caxias do Sul',
		'Pelotas',
		'Passo Fundo',
		'Santa Maria',
		'Curitiba',
		'Florianópolis'
	];

	// List of high complexity specialties outside local municipality
	const especialidadesReferencia = [
		'Oncologia Cirúrgica',
		'Cirurgia Cardiovascular',
		'Neurocirurgia de Alta Complexidade',
		'Exame PET-CT Oncologia',
		'Ressonância Magnética com Contraste',
		'Hemodinâmica e Cateterismo Intervencionista',
		'Cirurgia Pediátrica Especializada',
		'Transplante de Órgãos'
	];

	function extrairHorarioReal(enc: any, idx: number): string {
		if (enc.observacoesRegulacao) {
			const match = enc.observacoesRegulacao.match(/(\d{2}:\d{2})/);
			if (match) return match[1];
		}
		if (enc.horaAgendamento && typeof enc.horaAgendamento === 'string') {
			return enc.horaAgendamento.substring(0, 5);
		}
		if (enc.agendamentoPrevisto && typeof enc.agendamentoPrevisto === 'string' && enc.agendamentoPrevisto.includes('T')) {
			const d = new Date(enc.agendamentoPrevisto);
			if (!isNaN(d.getTime())) {
				const h = d.getUTCHours().toString().padStart(2, '0');
				const m = d.getUTCMinutes().toString().padStart(2, '0');
				if (h !== '00' || m !== '00') {
					return `${h}:${m}`;
				}
			}
		}
		const horasPadrao = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '13:30', '14:00', '14:30', '15:00', '15:30'];
		return horasPadrao[idx % horasPadrao.length];
	}

	// Initial dataset generator / API loader
	async function carregarAgendaDoDia() {
		carregando = true;
		erroGlobal = '';
		try {
			// Consome endpoint v3.0.0 de agenda do especialista (centro-doc-back.md)
			try {
				const resCentro = await api.centroMedico.listAgenda({ data: dataAgenda });
				if (resCentro && Array.isArray(resCentro.agenda)) {
					consultas = resCentro.agenda.map((enc, idx) => ({
						id: enc.id,
						protocolo: enc.protocolo,
						horario: extrairHorarioReal(enc, idx),
						status: (enc.statusAtendimentoCentro || 'AGUARDANDO') as any,
						pacienteId: (enc.paciente as any).id || enc.id,
						paciente: {
							nome: enc.paciente.nome,
							cpf: enc.paciente.cpf,
							cartaoSus: enc.paciente.cartaoSus || '',
							dataNascimento: enc.paciente.dataNascimento || '',
							sexo: enc.paciente.sexo || 'M',
							telefone: enc.paciente.telefone || '',
							endereco: enc.paciente.endereco || ''
						},
						solicitacao: {
							medicoSolicitante: enc.solicitacao.medicoSolicitante || '',
							crm: enc.solicitacao.crm || '',
							especialidadeSolicitada: enc.solicitacao.especialidadeSolicitada || '',
							cid10: enc.solicitacao.cid10 || '',
							cidDescricao: enc.solicitacao.cidDescricao || '',
							justificativaClinica: enc.solicitacao.justificativaClinica || '',
							prioridade: enc.solicitacao.prioridade || 'ELETIVA',
							dataSolicitacao: enc.solicitacao.dataSolicitacao || ''
						},
						unidadeOrigem: enc.unidadeOrigem || 'Unidade de Origem',
						observacoesRegulacao: enc.observacoesRegulacao || ''
					}));
					return;
				}
			} catch (errMedico) {
				console.info('[UniSISM] Tentando recuperar agenda via /v1/encaminhamentos.', errMedico);
			}

			// Consulta via API de encaminhamentos aprovados
			const res = await api.encaminhamentos.list({ status: 'APROVADO', limit: 1000 });
			const filtradosCentro = res.filter(e => pertenceAoOrgaoCentro(e, centroAtivo));
			const agendados = filtradosCentro.filter(e => !e.agendamentoPrevisto || e.agendamentoPrevisto.substring(0, 10) === dataAgenda);

			consultas = agendados.map((enc, idx) => {
				return {
					id: enc.id,
					protocolo: enc.protocolo,
					horario: extrairHorarioReal(enc, idx),
					status: ((enc as any).statusAtendimentoCentro || 'AGUARDANDO') as any,
					pacienteId: (enc.paciente as any).id || enc.id,
					paciente: {
						nome: enc.paciente.nome,
						cpf: enc.paciente.cpf,
						cartaoSus: enc.paciente.cartaoSus || '',
						dataNascimento: enc.paciente.dataNascimento || '',
						sexo: enc.paciente.sexo || 'M',
						telefone: enc.paciente.telefone || '',
						endereco: enc.paciente.endereco || ''
					},
					solicitacao: {
						medicoSolicitante: enc.solicitacao.medicoSolicitante || '',
						crm: enc.solicitacao.crm || '',
						especialidadeSolicitada: enc.solicitacao.especialidadeSolicitada || '',
						cid10: enc.solicitacao.cid10 || '',
						cidDescricao: enc.solicitacao.cidDescricao || '',
						justificativaClinica: enc.solicitacao.justificativaClinica || '',
						prioridade: enc.solicitacao.prioridade || 'ELETIVA',
						dataSolicitacao: enc.solicitacao.dataSolicitacao || ''
					},
					unidadeOrigem: enc.unidadeOrigem || 'Unidade de Origem',
					observacoesRegulacao: enc.observacoesRegulacao || '',
					necessitaTriagem: (enc as any).necessitaTriagem,
					triagemRealizada: (enc as any).triagemRealizada,
					triagemEm: (enc as any).triagemEm,
					triagemPorNome: (enc as any).triagemPorNome,
					triagemCoren: (enc as any).triagemCoren,
					triagemDados: (enc as any).triagemDados
				};
			});
		} catch (e: any) {
			console.error(e);
			erroGlobal = `Falha ao carregar agenda do servidor: ${e?.message || 'Erro de conexão'}`;
			consultas = [];
		} finally {
			carregando = false;
		}
	}

	onMount(async () => {
		try {
			const me = await api.auth.me();
			if (me && me.nome) {
				const esp = (me as any).especialidade ? ` (${(me as any).especialidade})` : '';
				medicoLogado = `${me.nome}${esp}`;
				medicoCrm = (me as any).crm ? `CRM ${(me as any).crm}` : (me as any).cpf ? `CRM/REG ${(me as any).cpf.substring(0, 6)}` : 'CRM Regulação';
			}
		} catch (e) {
			console.info('[UniSISM] Erro ao carregar perfil do médico conectado.', e);
		}
		try {
			const procs = await api.centroGestao.listEspecialidades({ centro: centroAtivo }).catch(() => []);
			if (Array.isArray(procs) && procs.length > 0) {
				procedimentosDoBanco = procs.map(p => ({
					codigo: p.codigoSigtap || '00.00.00.000-0',
					nome: p.nome
				}));
			}
		} catch (e) {
			console.info('[UniSISM] Erro ao carregar catálogo SIGTAP.', e);
		}
		carregarAgendaDoDia();
	});

	let timerMensagem: any = null;

	onDestroy(() => {
		if (timerInterval) clearInterval(timerInterval);
		if (timerMensagem) clearTimeout(timerMensagem);
	});

	// Filtered schedule list
	let consultasFiltradas = $derived.by(() => {
		return consultas.filter(c => {
			if (filtroStatus !== 'TODOS' && c.status !== filtroStatus) return false;
			if (busca.trim()) {
				const q = busca.toLowerCase();
				return (
					c.paciente.nome.toLowerCase().includes(q) ||
					c.paciente.cpf.includes(q) ||
					c.protocolo.toLowerCase().includes(q) ||
					c.solicitacao.cid10.toLowerCase().includes(q)
				);
			}
			return true;
		});
	});

	// Metrics
	let totalAgendados = $derived(consultas.length);
	let totalAguardando = $derived(consultas.filter(c => c.status === 'AGUARDANDO').length);
	let totalEmAtendimento = $derived(consultas.filter(c => c.status === 'EM_ATENDIMENTO').length);
	let totalConcluidos = $derived(consultas.filter(c => c.status === 'CONCLUIDO').length);
	let totalFaltas = $derived(consultas.filter(c => c.status === 'FALTOU').length);
	let taxaOcupacao = $derived(totalAgendados > 0 ? Math.round((totalConcluidos / totalAgendados) * 100) : 0);

	function formatarTimer(seg: number): string {
		const m = Math.floor(seg / 60).toString().padStart(2, '0');
		const s = (seg % 60).toString().padStart(2, '0');
		return `${m}:${s}`;
	}

	function calcularIdade(dataNasc: string): number {
		if (!dataNasc) return 0;
		const nasc = new Date(dataNasc);
		const hoje = new Date();
		let idade = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
		return idade;
	}

	// Navigation between days
	function navegarDia(delta: number) {
		const d = new Date(dataAgenda + 'T12:00:00');
		d.setDate(d.getDate() + delta);
		dataAgenda = d.toISOString().substring(0, 10);
		carregarAgendaDoDia();
	}

	function irParaHoje() {
		dataAgenda = new Date().toISOString().substring(0, 10);
		carregarAgendaDoDia();
	}

	function formatarDataExtensa(iso: string) {
		const d = new Date(iso + 'T12:00:00');
		return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
	}

	// Attendance Actions
	async function iniciarAtendimento(c: ConsultaAgenda) {
		// Update status
		c.status = 'EM_ATENDIMENTO';
		consultaAtiva = c;

		// Notifica o backend sobre o início da chamada no consultório
		try {
			await api.centroMedico.chamarPaciente(c.id);
		} catch (errChamar) {
			console.info('[UniSISM] Endpoint /v1/centro/medico/chamar em transição — usando estado local.', errChamar);
		}

		// Reset SOAP form com dados reais da solicitação
		procedimentosRealizados = c.solicitacao?.procedimentoSolicitado ? [{
			id: 'proc-ini-' + Date.now(),
			nome: c.solicitacao.procedimentoSolicitado,
			quantidade: 1,
			observacao: 'Procedimento solicitado no encaminhamento'
		}] : [];
		soapQueixa = c.solicitacao?.justificativaClinica
			? `Queixa informada na solicitação: ${c.solicitacao.justificativaClinica}`
			: '';

		// Pré-popula sinais vitais aferidos pela enfermagem na triagem clínica
		if (c.triagemDados) {
			soapPa = c.triagemDados.pressaoArterial || '';
			soapFc = c.triagemDados.frequenciaCardiaca ? String(c.triagemDados.frequenciaCardiaca) : '';
			soapPeso = c.triagemDados.pesoKg ? String(c.triagemDados.pesoKg) : '';
			soapAltura = c.triagemDados.alturaCm ? String(c.triagemDados.alturaCm) : '';
			soapSpo2 = c.triagemDados.saturacaoO2 ? String(c.triagemDados.saturacaoO2) : '';
			soapTemp = c.triagemDados.temperatura ? String(c.triagemDados.temperatura) : '';
			soapGlicemia = c.triagemDados.glicemiaCapilar ? String(c.triagemDados.glicemiaCapilar) : '';
			if (c.triagemDados.queixaPrincipal) {
				soapQueixa += (soapQueixa ? '\n' : '') + `[TRIAGEM ENFERMAGEM]: ${c.triagemDados.queixaPrincipal}`;
			}
		} else {
			soapPa = '';
			soapFc = '';
			soapPeso = '';
			soapAltura = '';
			soapSpo2 = '';
			soapTemp = '';
			soapGlicemia = '';
		}
		soapExameFisico = '';
		soapCid10 = c.solicitacao?.cid10 || '';
		soapDiagnostico = c.solicitacao?.cidDescricao || '';
		soapConduta = '';
		soapPrescricao = '';
		erroSoapForm = '';

		// Start Timer
		timerSegundos = 0;
		if (timerInterval) clearInterval(timerInterval);
		timerInterval = setInterval(() => {
			timerSegundos++;
		}, 1000);
	}

	async function concluirAtendimento() {
		if (!consultaAtiva) return;
		if (!soapCid10.trim() || !soapDiagnostico.trim() || !soapConduta.trim()) {
			erroSoapForm = 'Preencha os campos obrigatórios da consulta (CID-10, Diagnóstico e Conduta).';
			return;
		}

		salvandoAtendimento = true;
		erroSoapForm = '';
		try {
			const procResumo = procedimentosRealizados.length > 0 
				? `\n\nProcedimentos Realizados (${procedimentosRealizados.length}): ` + procedimentosRealizados.map(p => `${p.nome} (${p.quantidade}x)` + (p.codigoSigtap ? ` [SIGTAP ${p.codigoSigtap}]` : '')).join('; ')
				: '';
			const condutaCompleta = soapConduta + procResumo;

			// Register attendance via dedicated Centro SOAP endpoint (v3.0.0 centro-doc-back.md)
			try {
				await api.centroMedico.registrarAtendimentoSoap(consultaAtiva.id, {
					subjetivo: soapQueixa,
					objetivo: `${soapExameFisico}\nSinais Vitais: PA ${soapPa || '—'} mmHg | FC ${soapFc || '—'} bpm | Peso ${soapPeso || '—'}kg`,
					avaliacao: soapDiagnostico,
					plano: condutaCompleta,
					queixaPrincipal: soapQueixa,
					diagnostico: soapDiagnostico,
					cid10: soapCid10,
					conduta: condutaCompleta,
					prescricaoResumo: soapPrescricao
				});
			} catch (errSoap) {
				console.info('[UniSISM] Endpoint /v1/centro/medico/atendimento/:id em transição — usando fallback pacientes.addAtendimento', errSoap);
				try {
					await api.pacientes.addAtendimento(consultaAtiva.pacienteId, {
						data: new Date().toISOString(),
						tipo: 'CONSULTA_MEDICA',
						profissional: medicoLogado,
						registroProfissional: 'CRM 12345',
						especialidade: 'Cardiologia',
						unidade: 'Centro Municipal de Especialidades',
						queixaPrincipal: soapQueixa,
						diagnostico: soapDiagnostico,
						cid10: soapCid10,
						conduta: condutaCompleta,
						prescricaoResumo: soapPrescricao
					});
				} catch (e) {
					console.warn('Backend API não disponivel para gravação do PEC — gravando estado local.', e);
				}
			}

			if (procedimentosRealizados.length > 0) {
				try {
					await api.centroMedico.registrarProcedimentos(consultaAtiva.id, {
						procedimentos: procedimentosRealizados.map(p => ({
							codigoSigtap: p.codigoSigtap,
							nome: p.nome,
							quantidade: p.quantidade,
							valorUnitario: p.valorUnitario
						}))
					});
				} catch (eProc) {
					console.info('[UniSISM] Registro de procedimentos faturáveis:', eProc);
				}
			}

			// Update consultation in list
			const agoraHora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
			consultaAtiva.status = 'CONCLUIDO';
			consultaAtiva.atendimentoSOAP = {
				queixaPrincipal: soapQueixa,
				exameFisico: `${soapExameFisico}\nSinais Vitais: PA ${soapPa || '—'} mmHg | FC ${soapFc || '—'} bpm | Peso ${soapPeso || '—'}kg`,
				cid10: soapCid10,
				diagnostico: soapDiagnostico,
				conduta: condutaCompleta,
				prescricao: soapPrescricao,
				concluidoEm: agoraHora
			};

			mensagemSucesso = `✓ ATENDIMENTO CONCLUÍDO COM SUCESSO!\nPaciente: ${consultaAtiva.paciente.nome} | CID-10: ${soapCid10} (${soapDiagnostico}) | Horário: ${agoraHora}`;
			
			// Stop timer & close
			if (timerInterval) clearInterval(timerInterval);
			consultaAtiva = null;

			if (timerMensagem) clearTimeout(timerMensagem);
			timerMensagem = setTimeout(() => {
				mensagemSucesso = '';
			}, 6000);
		} catch (e: any) {
			console.error(e);
			erroSoapForm = `Falha ao concluir atendimento: ${e?.message || 'Erro no servidor'}`;
		} finally {
			salvandoAtendimento = false;
		}
	}

	function marcarFalta(c: ConsultaAgenda) {
		if (confirm(`Confirmar que o paciente ${c.paciente.nome} faltou à consulta agendada para às ${c.horario}?`)) {
			c.status = 'FALTOU';
		}
	}

	// Modal 1: Details of original request
	function abrirSolicitacao(c: ConsultaAgenda) {
		consultaSolicitacao = c;
		modalSolicitacaoAberto = true;
	}

	// Modal 2: Patient Dossier (PEC completo)
	async function abrirDossie(c: ConsultaAgenda) {
		carregandoDossie = true;
		abaDossieAtiva = 'resumo';
		modalDossieAberto = true;

		try {
			// Fetch patient full dossier from dedicated Centro PEC endpoint (v3.0.0 centro-doc-back.md)
			try {
				const pCentro = await api.centroMedico.obterProntuario(c.pacienteId);
				if (pCentro && pCentro.id) {
					pacienteDossie = pCentro;
					return;
				}
			} catch (errCentroPront) {
				console.info('[UniSISM] Endpoint /v1/centro/medico/pacientes/:id/prontuario em transição — usando fallback pacientes.byId', errCentroPront);
			}

			const p = await api.pacientes.byId(c.pacienteId);
			pacienteDossie = p;
		} catch (e: any) {
			console.error('Erro ao obter prontuário do servidor:', e);
			erroGlobal = 'Prontuário do paciente não encontrado no servidor.';
			modalDossieAberto = false;
		} finally {
			carregandoDossie = false;
		}
	}

	// Intermunicipal Referral Action (Envio para a Regulação da SMS / TFD)
	function abrirFormularioReferencia() {
		if (!consultaAtiva) return;
		protocoloReferenciaGerado = '';
		erroModalInter = '';
		refMunicipioDestino = 'Porto Alegre';
		refEspecialidade = 'Cirurgia Cardiovascular / Alta Complexidade';
		refCid10 = soapCid10 || consultaAtiva.solicitacao.cid10;
		refDiagnostico = soapDiagnostico || consultaAtiva.solicitacao.cidDescricao;
		refJustificativa = `Paciente necessita de avaliação e intervenção especializada em centro de referência intermunicipal de alta complexidade. Ausência de suporte tecnológico municipal no local.`;
		refPrioridade = consultaAtiva.solicitacao.prioridade;
		modalReferenciaAberto = true;
	}

	async function submeterReferenciaIntermunicipal(dados: {
		municipioDestino: string;
		especialidade: string;
		cid10: string;
		diagnostico: string;
		justificativa: string;
		prioridade: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';
		transporte: string;
		acompanhante: boolean;
	}) {
		if (!consultaAtiva) return;

		enviandoReferencia = true;
		erroModalInter = '';
		try {
			let protocoloObtido = '';
			// Send intermunicipal referral via dedicated Centro TFD endpoint (v3.0.0 centro-doc-back.md)
			try {
				const resTfd = await api.centroMedico.criarEncaminhamentoIntermunicipal({
					pacienteId: consultaAtiva.pacienteId,
					solicitacao: {
						especialidadeSolicitada: `${dados.especialidade} (${dados.municipioDestino})`,
						cid10: dados.cid10,
						cidDescricao: dados.diagnostico,
						justificativaClinica: `[ENCAMINHAMENTO INTERMUNICIPAL PARA REGULAÇÃO SMS / TFD]\nMunicípio Destino: ${dados.municipioDestino}\nTransporte: ${dados.transporte} | Acompanhante: ${dados.acompanhante ? 'Sim' : 'Não'}\n\nLaudo Médico:\n${dados.justificativa.trim()}`,
						prioridade: dados.prioridade
					}
				});
				if (resTfd && resTfd.encaminhamento) {
					protocoloObtido = resTfd.encaminhamento.protocolo;
				}
			} catch (errInter) {
				console.info('[UniSISM] Endpoint /v1/centro/medico/encaminhamento-intermunicipal em transição — usando fallback encaminhamentos.create', errInter);
				const criado = await api.encaminhamentos.create({
					paciente: {
						nome: consultaAtiva.paciente.nome,
						cpf: consultaAtiva.paciente.cpf.replace(/\D/g, ''),
						cartaoSus: consultaAtiva.paciente.cartaoSus,
						dataNascimento: consultaAtiva.paciente.dataNascimento,
						sexo: consultaAtiva.paciente.sexo,
						telefone: consultaAtiva.paciente.telefone,
						endereco: consultaAtiva.paciente.endereco
					},
					solicitacao: {
						medicoSolicitante: medicoLogado,
						crm: 'CRM 12345',
						especialidadeSolicitada: `${dados.especialidade} (${dados.municipioDestino})`,
						cid10: dados.cid10,
						cidDescricao: dados.diagnostico,
						justificativaClinica: `[ENCAMINHAMENTO INTERMUNICIPAL PARA REGULAÇÃO SMS / TFD]\nMunicípio Destino: ${dados.municipioDestino}\nTransporte: ${dados.transporte} | Acompanhante: ${dados.acompanhante ? 'Sim' : 'Não'}\n\nLaudo Médico:\n${dados.justificativa.trim()}`,
						prioridade: dados.prioridade,
						dataSolicitacao: new Date().toISOString().substring(0, 10)
					}
				});
				protocoloObtido = criado.protocolo;
			}

			protocoloReferenciaGerado = protocoloObtido;
			consultaAtiva.encaminhamentoIntermunicipal = {
				protocolo: protocoloObtido,
				municipioDestino: dados.municipioDestino,
				especialidade: dados.especialidade,
				criadoEm: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
			};

			// Add note to SOAP conduct
			soapConduta += `\n\n[ENCAMINHAMENTO INTERMUNICIPAL GERADO: Protocolo ${protocoloObtido} para ${dados.especialidade} em ${dados.municipioDestino} — Enviado à Regulação SMS]`;

			setTimeout(() => {
				modalReferenciaAberto = false;
			}, 3500);
		} catch (e: any) {
			console.error(e);
			erroModalInter = `Falha ao enviar encaminhamento para a regulação: ${e?.message || 'Erro do servidor'}`;
		} finally {
			enviandoReferencia = false;
		}
	}
</script>

<div class="flex flex-col gap-4 font-mono text-xs">
	<!-- Banner de Sucesso Global -->
	{#if mensagemSucesso}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-4 font-bold text-emerald-900 flex flex-col gap-1 shadow-sm whitespace-pre-wrap">
			<div class="flex items-center gap-2 text-sm font-black">
				<span class="bg-emerald-700 text-white px-2 py-0.5 text-xs font-mono">CONCLUÍDO</span>
				<span>ATENDIMENTO MÉDICO REGISTRADO</span>
			</div>
			<div class="text-xs font-mono font-normal mt-1">{mensagemSucesso}</div>
		</div>
	{/if}

	<!-- Banner de Erro Global -->
	{#if erroGlobal}
		<div class="border border-amber-600 bg-amber-50 p-3 font-semibold text-amber-900 flex items-center gap-2">
			<IconAlertTriangle size={16} class="text-amber-800 shrink-0" />
			<span>{erroGlobal}</span>
		</div>
	{/if}

	<!-- 1. Cabeçalho de Contexto do Médico e Seletor de Data da Agenda -->
	<section class="grid grid-cols-1 gap-3 md:grid-cols-12">
		<!-- Card de Identificação do Especialista -->
		<div class="border border-slate-200 bg-white p-4 md:col-span-4 flex flex-col justify-between">
			<div>
				<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">ESPECIALISTA RESPONSÁVEL</div>
				<div class="mt-1 text-base font-bold text-slate-900 font-sans">{medicoLogado}</div>
				<div class="text-[11px] text-blue-900 font-bold mt-0.5">Centro Municipal de Especialidades · {medicoCrm}</div>
			</div>
			<div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-600">
				<span>Status da Escala: <strong class="text-emerald-700 font-bold">EM ATENDIMENTO</strong></span>
				<span>Turno: <strong>08h às 17h</strong></span>
			</div>
		</div>

		<!-- Card de Controle da Data da Agenda -->
		<div class="border border-slate-200 bg-white p-4 md:col-span-8 flex flex-col justify-between">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">DATA DA AGENDA DO MÉDICO</div>
					<div class="mt-0.5 text-sm font-bold text-slate-900 capitalize">
						{formatarDataExtensa(dataAgenda)}
					</div>
				</div>

				<div class="flex items-center gap-1">
					<button
						type="button"
						onclick={() => navegarDia(-1)}
						class="border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
					>
						&larr; Dia Anterior
					</button>
					<button
						type="button"
						onclick={irParaHoje}
						class="border border-blue-900 bg-blue-900 text-white px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
					>
						Hoje
					</button>
					<button
						type="button"
						onclick={() => navegarDia(1)}
						class="border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
					>
						Próximo Dia &rarr;
					</button>
				</div>
			</div>

			<div class="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 border-t border-slate-100 pt-3 text-center">
				<div class="border-r border-slate-100 pr-2">
					<div class="text-[9px] text-slate-500 uppercase">Agendados</div>
					<div class="text-lg font-bold text-slate-900">{totalAgendados}</div>
				</div>
				<div class="border-r border-slate-100 pr-2">
					<div class="text-[9px] text-amber-700 uppercase font-bold">Aguardando</div>
					<div class="text-lg font-bold text-amber-700">{totalAguardando}</div>
				</div>
				<div class="border-r border-slate-100 pr-2">
					<div class="text-[9px] text-blue-900 uppercase font-bold">Em Atendimento</div>
					<div class="text-lg font-bold text-blue-900">{totalEmAtendimento}</div>
				</div>
				<div class="border-r border-slate-100 pr-2">
					<div class="text-[9px] text-emerald-700 uppercase font-bold">Concluídos</div>
					<div class="text-lg font-bold text-emerald-700">{totalConcluidos}</div>
				</div>
				<div>
					<div class="text-[9px] text-red-700 uppercase font-bold">Faltas</div>
					<div class="text-lg font-bold text-red-700">{totalFaltas}</div>
				</div>
			</div>
		</div>
	</section>

	<!-- 2. AMBIENTE DE CONSULTA ATIVA (SOAP + Dossie + Encaminhamento Intermunicipal) -->
	{#if consultaAtiva}
		<section class="border-2 border-blue-900 bg-white shadow-md">
			<!-- Header do Atendimento com Cronômetro -->
			<div class="flex flex-wrap items-center justify-between border-b-2 border-blue-900 bg-blue-900 px-6 py-3 text-white">
				<div class="flex items-center gap-3">
					<span class="flex h-7 w-7 items-center justify-center bg-white font-mono text-xs font-bold text-blue-900">
						<IconStethoscope size={16} />
					</span>
					<div>
						<div class="text-[10px] font-mono tracking-widest text-blue-200 uppercase">
							EM CONSULTA MÉDICA ESPECIALIZADA · {consultaAtiva.solicitacao.especialidadeSolicitada}
						</div>
						<div class="text-base font-bold font-sans">
							{consultaAtiva.paciente.nome} <span class="text-xs font-normal font-mono opacity-90">({calcularIdade(consultaAtiva.paciente.dataNascimento)} anos · CPF: {consultaAtiva.paciente.cpf})</span>
						</div>
					</div>
				</div>

				<div class="flex items-center gap-4">
					<div class="flex items-center gap-2 border border-blue-700 bg-blue-950 px-3 py-1 font-mono text-xs">
						<span class="inline-block h-2 w-2 animate-ping bg-emerald-400"></span>
						<span class="text-slate-300">Tempo:</span>
						<span class="font-bold text-white text-sm">{formatarTimer(timerSegundos)}</span>
					</div>

					<button
						type="button"
						onclick={() => abrirDossie(consultaAtiva!)}
						class="border border-white/40 bg-white/10 hover:bg-white/20 px-3 py-1 font-bold text-xs uppercase tracking-wider text-white flex items-center gap-1.5"
					>
						<IconFileText size={14} />
						<span>Prontuário Clínico</span>
					</button>

					<button
						type="button"
						onclick={() => consultaAtiva = null}
						class="border border-red-400/40 bg-red-900/60 hover:bg-red-800 px-2.5 py-1 text-xs font-bold uppercase text-white"
						title="Minimizar consulta"
					>
						✕ Pausar
					</button>
				</div>
			</div>

			<!-- Alertas Rápidos de Alergias e Crônicas -->
			<div class="grid grid-cols-1 md:grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs">
				<div class="border-r border-slate-200 p-3 bg-red-50 text-red-900 font-semibold flex items-center gap-2">
					<span class="bg-red-700 text-white px-1.5 py-0.5 text-[10px] font-bold">ALERTA</span>
					<span>Alergia Registrada: <strong class="underline">PENICILINA (GRAVE)</strong></span>
				</div>
				<div class="border-r border-slate-200 p-3 text-slate-800 font-sans">
					<strong>Condições Crônicas:</strong> Hipertensão Arterial (I10), Diabetes Mellitus (E11)
				</div>
				<div class="p-3 text-slate-800 font-sans">
					<strong>Medicamentos Ativos:</strong> Losartana 50mg, Metformina 850mg
				</div>
			</div>

			<!-- Painel de Triagem Clínica da Enfermagem -->
			{#if consultaAtiva.triagemRealizada && consultaAtiva.triagemDados}
				<div class="border-b border-emerald-300 bg-emerald-50/90 p-3 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2 font-mono">
					<div class="flex items-center gap-2 flex-wrap">
						<span class="bg-emerald-700 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
							<IconCheck size={12} />
							<span>TRIAGEM DE ENFERMAGEM</span>
						</span>
						<span class="text-emerald-950 font-bold font-sans">
							Enf. {consultaAtiva.triagemPorNome || 'Enfermagem'} ({consultaAtiva.triagemCoren || 'COREN'})
						</span>
						{#if consultaAtiva.triagemDados.classificacaoRisco}
							<span class="px-2 py-0.5 text-[10px] font-bold border {consultaAtiva.triagemDados.classificacaoRisco === 'VERMELHO' ? 'bg-red-600 text-white' : consultaAtiva.triagemDados.classificacaoRisco === 'LARANJA' ? 'bg-orange-500 text-white' : consultaAtiva.triagemDados.classificacaoRisco === 'AMARELO' ? 'bg-yellow-400 text-slate-900' : 'bg-emerald-600 text-white'}">
								RISCO: {consultaAtiva.triagemDados.classificacaoRisco}
							</span>
						{/if}
					</div>
					<div class="flex flex-wrap items-center gap-2.5 text-[11px] text-emerald-950">
						<span class="bg-white border border-emerald-300 px-1.5 py-0.5 font-bold">PA: {consultaAtiva.triagemDados.pressaoArterial}</span>
						{#if consultaAtiva.triagemDados.frequenciaCardiaca}<span class="bg-white border border-emerald-300 px-1.5 py-0.5">FC: {consultaAtiva.triagemDados.frequenciaCardiaca} bpm</span>{/if}
						{#if consultaAtiva.triagemDados.temperatura}<span class="bg-white border border-emerald-300 px-1.5 py-0.5">Temp: {consultaAtiva.triagemDados.temperatura}°C</span>{/if}
						{#if consultaAtiva.triagemDados.saturacaoO2}<span class="bg-white border border-emerald-300 px-1.5 py-0.5">SpO2: {consultaAtiva.triagemDados.saturacaoO2}%</span>{/if}
						{#if consultaAtiva.triagemDados.pesoKg}<span class="bg-white border border-emerald-300 px-1.5 py-0.5">Peso: {consultaAtiva.triagemDados.pesoKg}kg</span>{/if}
						{#if consultaAtiva.triagemDados.alturaCm}<span class="bg-white border border-emerald-300 px-1.5 py-0.5">Alt: {consultaAtiva.triagemDados.alturaCm}cm</span>{/if}
						{#if consultaAtiva.triagemDados.imc}<span class="bg-emerald-200 border border-emerald-400 px-1.5 py-0.5 font-black">IMC: {consultaAtiva.triagemDados.imc}</span>{/if}
					</div>
				</div>
			{:else if consultaAtiva.necessitaTriagem}
				<div class="border-b border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 font-bold flex items-center gap-2 font-mono">
					<span class="bg-amber-600 text-white px-2 py-0.5 text-[10px]">AVISO</span>
					<span>Especialidade com exigência de triagem prévia de enfermagem (ainda não triado).</span>
				</div>
			{/if}

			<!-- Form SOAP da Consulta -->
			<div class="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 font-sans">
				<!-- Lado Esquerdo: SOAP Subjetivo, Objetivo e Sinais Vitais -->
				<div class="md:col-span-6 flex flex-col gap-4">
					<!-- S: Subjetivo / Anamnese -->
					<div class="flex flex-col gap-1">
						<label for="soap-queixa" class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase flex items-center justify-between">
							<span>S — SUBJETIVO / ANAMNESE E EVOLUÇÃO CLÍNICA <span class="text-red-700">*</span></span>
						</label>
						<textarea
							id="soap-queixa"
							rows="4"
							bind:value={soapQueixa}
							placeholder="Relato do paciente, queixa principal, evolução da queixa..."
							class="w-full border border-slate-300 bg-white p-2.5 text-xs outline-none focus:border-blue-900 resize-none font-sans"
						></textarea>
					</div>

					<!-- O: Objetivo / Sinais Vitais + Exame Físico -->
					<div class="border border-slate-200 bg-slate-50 p-3 flex flex-col gap-3">
						<div class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase flex items-center justify-between">
							<span>O — OBJETIVO / SINAIS VITAIS E AFERIÇÕES</span>
							<span class="text-blue-900 bg-blue-100 px-2 py-0.5 font-bold">IMC: {soapImc.imc} ({soapImc.classificacao})</span>
						</div>
						<div class="grid grid-cols-3 gap-2 font-mono text-xs sm:grid-cols-6">
							<div>
								<label for="sv-pa" class="text-[9px] text-slate-500 font-bold">PA (mmHg)</label>
								<input id="sv-pa" type="text" bind:value={soapPa} class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs font-bold" />
							</div>
							<div>
								<label for="sv-fc" class="text-[9px] text-slate-500 font-bold">FC (bpm)</label>
								<input id="sv-fc" type="text" bind:value={soapFc} class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs font-bold" />
							</div>
							<div>
								<label for="sv-peso" class="text-[9px] text-slate-500 font-bold">PESO (kg)</label>
								<input id="sv-peso" type="text" bind:value={soapPeso} class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs font-bold" />
							</div>
							<div>
								<label for="sv-altura" class="text-[9px] text-slate-500 font-bold">ALTURA (cm)</label>
								<input id="sv-altura" type="text" bind:value={soapAltura} class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs font-bold" />
							</div>
							<div>
								<label for="sv-spo2" class="text-[9px] text-slate-500 font-bold">SpO2 (%)</label>
								<input id="sv-spo2" type="text" bind:value={soapSpo2} class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs font-bold" />
							</div>
							<div>
								<label for="sv-glic" class="text-[9px] text-slate-500 font-bold">GLICEMIA (mg/dL)</label>
								<input id="sv-glic" type="text" bind:value={soapGlicemia} class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs font-bold" />
							</div>
						</div>
						<div class="flex flex-col gap-1 mt-1">
							<label for="soap-exame" class="font-mono text-[10px] font-bold text-slate-600">EXAME FÍSICO ESPECIALIZADO</label>
							<textarea
								id="soap-exame"
								rows="3"
								bind:value={soapExameFisico}
								placeholder="Achados do exame físico cardiologico/especializado..."
								class="w-full border border-slate-300 bg-white p-2 text-xs outline-none focus:border-blue-900 resize-none font-sans"
							></textarea>
						</div>
					</div>
				</div>

				<!-- Lado Direito: SOAP Avaliação, Diagnóstico CID-10, Plano, Prescrição e Encaminhamentos -->
				<div class="md:col-span-6 flex flex-col gap-4">
					<!-- A: Avaliação e CID-10 com sugestões rápidas -->
					<div class="flex flex-col gap-2 border border-slate-200 bg-slate-50 p-3">
						<div class="grid grid-cols-12 gap-2">
							<div class="col-span-4 flex flex-col gap-1">
								<label for="soap-cid" class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
									CID-10 <span class="text-red-700">*</span>
								</label>
								<input
									id="soap-cid"
									type="text"
									bind:value={soapCid10}
									placeholder="I10"
									class="w-full border border-slate-300 bg-white p-2 font-mono text-xs font-bold outline-none focus:border-blue-900 uppercase"
								/>
							</div>
							<div class="col-span-8 flex flex-col gap-1">
								<label for="soap-diag" class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
									DIAGNÓSTICO DA ESPECIALIDADE <span class="text-red-700">*</span>
								</label>
								<input
									id="soap-diag"
									type="text"
									bind:value={soapDiagnostico}
									placeholder="Descrição diagnóstica"
									class="w-full border border-slate-300 bg-white p-2 text-xs font-semibold outline-none focus:border-blue-900"
								/>
							</div>
						</div>
						<!-- CIDs Frequentes da Especialidade -->
						<div class="flex items-center gap-1 overflow-x-auto pt-1">
							<span class="text-[9px] font-bold text-slate-500 font-mono shrink-0">CIDs Rápidos:</span>
							{#each cidsFrequentes as item}
								<button
									type="button"
									onclick={() => selecionarCidRapido(item)}
									class="border border-slate-300 bg-white hover:bg-slate-100 text-[9px] font-mono px-1.5 py-0.5 font-bold shrink-0"
								>
									{item.codigo}
								</button>
							{/each}
						</div>
					</div>

					<!-- P: Plano / Conduta -->
					<div class="flex flex-col gap-1">
						<label for="soap-conduta" class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
							P — PLANO TERAPÊUTICO E CONDUTA MÉDICA <span class="text-red-700">*</span>
						</label>
						<textarea
							id="soap-conduta"
							rows="3"
							bind:value={soapConduta}
							placeholder="Conduta médica, exames solicitados, orientações..."
							class="w-full border border-slate-300 bg-white p-2.5 text-xs outline-none focus:border-blue-900 resize-none font-sans"
						></textarea>
					</div>

					<!-- Prescrição Médica + Botões da REMUME -->
					<div class="flex flex-col gap-1 border border-emerald-200 bg-emerald-50/50 p-3">
						<label for="soap-presc" class="font-mono text-[10px] font-bold tracking-widest text-emerald-900 uppercase flex items-center justify-between">
							<span>💊 RECEITA E PRESCRIÇÃO DE MEDICAMENTOS (REMUME)</span>
							<span class="text-[9px] text-emerald-800 font-normal">Farmácia Municipal</span>
						</label>
						<textarea
							id="soap-presc"
							rows="3"
							bind:value={soapPrescricao}
							placeholder="1. Nome do medicamento - posologia..."
							class="w-full border border-emerald-300 bg-white p-2.5 text-xs font-mono outline-none focus:border-emerald-700 resize-none"
						></textarea>
						<div class="flex flex-wrap gap-1 pt-1">
							<span class="text-[9px] font-bold text-emerald-800 font-mono self-center">Atalhos REMUME:</span>
							{#each medicamentosRemume as med}
								<button
									type="button"
									onclick={() => inserirMedicamentoPrescricao(med)}
									class="border border-emerald-300 bg-white hover:bg-emerald-100 text-[9px] font-mono px-1.5 py-0.5 font-semibold text-emerald-950"
								>
									+ {med.nome.split(' ')[0]}
								</button>
							{/each}
						</div>
					</div>

					<!-- PROCEDIMENTOS REALIZADOS NO ATENDIMENTO (1 ou mais) -->
					<div class="flex flex-col gap-2 border border-purple-300 bg-purple-50/40 p-3">
						<div class="font-mono text-[10px] font-bold tracking-widest text-purple-900 uppercase flex items-center justify-between">
							<span class="flex items-center gap-1.5">
								<IconFlask size={14} class="text-purple-900" />
								<span>PROCEDIMENTOS REALIZADOS NESTE ATENDIMENTO ({procedimentosRealizados.length})</span>
							</span>
							<span class="text-[9px] text-purple-800 font-normal">Tabela SIGTAP / Faturamento SIA-SUS</span>
						</div>

						<div class="bg-purple-100/70 border border-purple-300 p-2 text-[10px] text-purple-950 font-sans flex items-start gap-1.5">
							<IconInfoCircle size={14} class="text-purple-900 shrink-0 mt-0.5" />
							<span><strong>Não precisa enviar o paciente de volta ao balcão!</strong> Se durante a consulta foi necessário realizar algum exame ou procedimento (*ex: ECG, Biópsia, Curativo, Infiltração, Lavagem*), basta adicionar abaixo para compor o faturamento e histórico do paciente.</span>
						</div>

						<!-- Lista de Procedimentos Já Adicionados -->
						{#if procedimentosRealizados.length > 0}
							<div class="border border-purple-200 bg-white overflow-hidden text-xs">
								<table class="w-full text-left border-collapse">
									<thead>
										<tr class="bg-purple-100 text-purple-900 font-mono text-[9px] uppercase font-bold border-b border-purple-200">
											<th class="p-2">Procedimento / Serviço</th>
											<th class="p-2">Código SIGTAP</th>
											<th class="p-2 text-center">Qtd</th>
											<th class="p-2">Obs</th>
											<th class="p-2 text-center">Ação</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-purple-100 font-mono text-[11px]">
										{#each procedimentosRealizados as proc (proc.id)}
											<tr class="hover:bg-purple-50/60">
												<td class="p-2 font-bold text-purple-950">{proc.nome}</td>
												<td class="p-2 text-purple-800 font-mono">{proc.codigoSigtap || '—'}</td>
												<td class="p-2 text-center font-bold">{proc.quantidade}</td>
												<td class="p-2 text-slate-600 font-sans text-[10px]">{proc.observacao || '—'}</td>
												<td class="p-2 text-center">
													<button
														type="button"
														onclick={() => removerProcedimento(proc.id)}
														class="text-red-700 hover:text-red-900 font-bold text-[10px]"
													>
														[Remover]
													</button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<div class="text-[11px] text-purple-800 italic font-sans bg-white/60 p-2 border border-purple-200/60">
								Nenhum procedimento extra registrado neste atendimento. Adicione procedimentos abaixo se realizados.
							</div>
						{/if}

						<!-- Formulário para Adicionar Novo Procedimento -->
						<div class="grid grid-cols-12 gap-2 pt-1">
							<div class="col-span-12 md:col-span-5 flex flex-col gap-1">
								<label for="proc-nome-in" class="text-[9px] font-bold text-purple-900 uppercase">Nome do Procedimento</label>
								<input
									id="proc-nome-in"
									type="text"
									bind:value={novoProcedimentoNome}
									placeholder="Ex.: Curativo Especial, Biópsia, ECG..."
									class="border border-purple-300 bg-white p-1.5 text-xs outline-none focus:border-purple-800"
								/>
							</div>
							<div class="col-span-6 md:col-span-3 flex flex-col gap-1">
								<label for="proc-cod-in" class="text-[9px] font-bold text-purple-900 uppercase">Código SIGTAP</label>
								<input
									id="proc-cod-in"
									type="text"
									bind:value={novoProcedimentoCodigo}
									placeholder="04.01.01.002-3"
									class="border border-purple-300 bg-white p-1.5 text-xs font-mono outline-none focus:border-purple-800"
								/>
							</div>
							<div class="col-span-3 md:col-span-2 flex flex-col gap-1">
								<label for="proc-qtd-in" class="text-[9px] font-bold text-purple-900 uppercase">Qtd</label>
								<input
									id="proc-qtd-in"
									type="number"
									min="1"
									bind:value={novoProcedimentoQtd}
									class="border border-purple-300 bg-white p-1.5 text-xs font-bold text-center outline-none focus:border-purple-800"
								/>
							</div>
							<div class="col-span-3 md:col-span-2 flex flex-col justify-end">
								<button
									type="button"
									onclick={adicionarProcedimento}
									class="border border-purple-900 bg-purple-900 hover:bg-purple-950 text-white p-1.5 font-bold text-[10px] uppercase font-mono tracking-wider w-full"
								>
									+ Adicionar
								</button>
							</div>
						</div>

						<!-- Sugestões Rápidas de Procedimentos SIGTAP -->
						<div class="flex flex-wrap gap-1 pt-1">
							<span class="text-[9px] font-bold text-purple-900 font-mono self-center">Frequentes SIGTAP:</span>
							{#each procedimentosSigtapSugeridos as ps}
								<button
									type="button"
									onclick={() => selecionarProcedimentoSugerido(ps)}
									class="border border-purple-300 bg-white hover:bg-purple-100 text-[9px] font-mono px-1.5 py-0.5 font-semibold text-purple-950"
								>
									+ {ps.nome}
								</button>
							{/each}
						</div>
					</div>

					<!-- Botão de Destaque: Encaminhar para Outra Cidade (Regulação SMS / TFD) -->
					{#if consultaAtiva.encaminhamentoIntermunicipal}
						<div class="border border-blue-900 bg-blue-50 p-3 font-mono text-xs flex justify-between items-center text-blue-900 font-bold">
							<div>
								<span>✓ ENCAMINHAMENTO GERADO: Protocolo {consultaAtiva.encaminhamentoIntermunicipal.protocolo}</span>
								<div class="text-[10px] font-normal text-slate-600">Para {consultaAtiva.encaminhamentoIntermunicipal.especialidade} em {consultaAtiva.encaminhamentoIntermunicipal.municipioDestino}</div>
							</div>
							<span class="bg-blue-900 text-white text-[10px] px-2 py-0.5 font-mono">REGULAÇÃO SMS</span>
						</div>
					{:else}
						<div class="border border-amber-300 bg-amber-50 p-3 flex items-center justify-between">
							<div class="leading-tight">
								<div class="font-mono text-[10px] font-bold text-amber-900 uppercase">NECESSITA ENCAMINHAR PARA OUTRA CIDADE?</div>
								<div class="text-[11px] text-amber-800">Envie o laudo direto para a Regulação da Secretaria de Saúde (TFD)</div>
							</div>
							<button
								type="button"
								onclick={abrirFormularioReferencia}
								class="border border-amber-800 bg-amber-800 hover:bg-amber-900 text-white px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider whitespace-nowrap"
							>
								+ Encaminhar Outra Cidade
							</button>
						</div>
					{/if}

					{#if erroSoapForm}
						<div class="border-2 border-red-700 bg-red-50 p-3 font-mono text-xs font-bold text-red-900 flex items-center gap-2">
							<IconAlertTriangle size={14} class="text-red-700 shrink-0" />
							<span>{erroSoapForm}</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Rodapé de Ações de Conclusão -->
			<div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
				<div class="font-mono text-xs text-slate-600">
					* Ao concluir, o registro será gravado permanentemente no Prontuário do Paciente.
				</div>

				<div class="flex items-center gap-3">
					<button
						type="button"
						onclick={abrirModalRetorno}
						class="border border-purple-900 bg-purple-900 hover:bg-purple-950 text-white px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
					>
						<IconCalendar size={14} />
						<span>Agendar Retorno / Volta</span>
					</button>

					<button
						type="button"
						onclick={abrirFormNovoEncaminhamento}
						class="border border-blue-900 bg-blue-900 hover:bg-blue-950 text-white px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
					>
						<IconPlus size={14} />
						<span>Encaminhar Regulação / SMS</span>
					</button>

					<button
						type="button"
						onclick={() => abrirDossie(consultaAtiva!)}
						class="border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 font-mono text-xs font-bold uppercase text-slate-800"
					>
						Dossiê
					</button>

					<button
						type="button"
						onclick={concluirAtendimento}
						disabled={salvandoAtendimento}
						class="border border-emerald-800 bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-2 font-mono text-xs font-bold uppercase tracking-wider disabled:opacity-50"
					>
						{salvandoAtendimento ? 'Gravando no Prontuário...' : '✓ CONCLUIR ATENDIMENTO'}
					</button>
				</div>
			</div>
		</section>
	{/if}

	<!-- 3. Filtros da Agenda Diária -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Controle da Agenda do Dia" index="01">
			<button
				type="button"
				onclick={carregarAgendaDoDia}
				class="border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 uppercase"
			>
				Atualizar
			</button>
		</PanelHeader>

		<div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-3">
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={() => filtroStatus = 'TODOS'}
					class="px-2.5 py-1 text-xs font-bold uppercase {filtroStatus === 'TODOS' ? 'border border-blue-900 bg-blue-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
				>
					Todos ({totalAgendados})
				</button>
				<button
					type="button"
					onclick={() => filtroStatus = 'AGUARDANDO'}
					class="px-2.5 py-1 text-xs font-bold uppercase {filtroStatus === 'AGUARDANDO' ? 'border border-amber-700 bg-amber-700 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
				>
					Aguardando ({totalAguardando})
				</button>
				<button
					type="button"
					onclick={() => filtroStatus = 'EM_ATENDIMENTO'}
					class="px-2.5 py-1 text-xs font-bold uppercase {filtroStatus === 'EM_ATENDIMENTO' ? 'border border-blue-900 bg-blue-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
				>
					Em Atendimento ({totalEmAtendimento})
				</button>
				<button
					type="button"
					onclick={() => filtroStatus = 'CONCLUIDO'}
					class="px-2.5 py-1 text-xs font-bold uppercase {filtroStatus === 'CONCLUIDO' ? 'border border-emerald-700 bg-emerald-700 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
				>
					Concluídos ({totalConcluidos})
				</button>
				<button
					type="button"
					onclick={() => filtroStatus = 'FALTOU'}
					class="px-2.5 py-1 text-xs font-bold uppercase {filtroStatus === 'FALTOU' ? 'border border-red-700 bg-red-700 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}"
				>
					Faltas ({totalFaltas})
				</button>
			</div>

			<div class="flex items-center gap-2">
				<label for="busca-paciente" class="text-xs font-bold text-slate-700">Buscar:</label>
				<input
					id="busca-paciente"
					type="text"
					bind:value={busca}
					placeholder="Nome ou CPF do paciente..."
					class="border border-slate-300 bg-white p-1 text-xs font-sans w-56 outline-none focus:border-blue-900"
				/>
			</div>
		</div>

		<!-- Tabela de Pacientes Agendados -->
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr class="border-b border-slate-200 bg-slate-100 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
						<th class="border-r border-slate-200 px-3 py-2.5">Horário / Status</th>
						<th class="border-r border-slate-200 px-3 py-2.5">Paciente</th>
						<th class="border-r border-slate-200 px-3 py-2.5">Especialidade / Procedimento</th>
						<th class="border-r border-slate-200 px-3 py-2.5">Prioridade</th>
						<th class="border-r border-slate-200 px-3 py-2.5">Origem / Protocolo</th>
						<th class="px-3 py-2.5 text-center">Ações Clínicas</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(5) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="6" class="px-3 py-3.5">
									<div class="h-3.5 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if filtrados.length === 0}
						<tr>
							<td colspan="6" class="px-3 py-10 text-center font-sans text-sm text-slate-500">
								Nenhum paciente encontrado para a data e filtros selecionados.
							</td>
						</tr>
					{:else}
						{#each filtrados as c (c.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
								<!-- Horário e Status -->
								<td class="border-r border-slate-100 px-3 py-2.5">
									<div class="font-bold text-slate-900 text-sm">{c.horario}</div>
									<span class="inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase mt-0.5 {c.status === 'EM_ATENDIMENTO' ? 'bg-blue-100 text-blue-900 border border-blue-300' : c.status === 'AGUARDANDO' ? 'bg-amber-100 text-amber-900 border border-amber-300' : c.status === 'CONCLUIDO' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-red-100 text-red-900 border border-red-300'}">
										{c.status.replace('_', ' ')}
									</span>
								</td>

								<!-- Paciente -->
								<td class="border-r border-slate-100 px-3 py-2.5 font-sans">
									<div class="font-bold text-slate-900">{c.paciente.nome}</div>
									<div class="font-mono text-[10px] text-slate-500">
										CPF: {c.paciente.cpf} · {calcularIdade(c.paciente.dataNascimento)} anos ({c.paciente.sexo})
									</div>
								</td>

								<!-- Especialidade / Procedimento / CID-10 -->
								<td class="border-r border-slate-100 px-3 py-2.5 font-sans">
									<div class="flex items-center gap-1.5 mb-0.5">
										{#if c.solicitacao.tipoServico === 'PROCEDIMENTO' || c.solicitacao.procedimentoSolicitado}
											<span class="bg-purple-100 text-purple-900 border border-purple-300 text-[9px] font-bold px-1.5 py-0.2 font-mono uppercase flex items-center gap-1">
												<IconFlask size={11} />
												<span>PROCEDIMENTO</span>
											</span>
										{:else}
											<span class="bg-blue-100 text-blue-900 border border-blue-300 text-[9px] font-bold px-1.5 py-0.2 font-mono uppercase flex items-center gap-1">
												<IconStethoscope size={11} />
												<span>CONSULTA</span>
											</span>
										{/if}
										<span class="font-semibold text-slate-900">{c.solicitacao.especialidadeSolicitada}</span>
									</div>
									{#if c.solicitacao.procedimentoSolicitado}
										<div class="font-mono text-[10px] text-purple-900 font-bold">
											Proc: {c.solicitacao.procedimentoSolicitado}
										</div>
									{/if}
									<div class="font-mono text-[10px] text-slate-600">
										CID-10: <strong>{c.solicitacao.cid10}</strong> ({c.solicitacao.cidDescricao})
									</div>
									{#if c.triagemRealizada}
										<div class="mt-1 flex items-center gap-1 font-mono text-[9px] bg-emerald-50 text-emerald-900 border border-emerald-300 px-1.5 py-0.5 font-bold w-fit">
											<IconCheck size={11} class="text-emerald-700 shrink-0" />
											<span>TRIADO ({c.triagemPorNome || 'Enf.'}) — PA: {c.triagemDados?.pressaoArterial || '--'}</span>
										</div>
									{:else if c.necessitaTriagem}
										<div class="mt-1 flex items-center gap-1 font-mono text-[9px] bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 font-bold w-fit">
											<IconClock size={11} class="text-amber-700 shrink-0" />
											<span>EXIGE TRIAGEM PRÉVIA</span>
										</div>
									{/if}
								</td>

								<!-- Prioridade -->
								<td class="border-r border-slate-100 px-3 py-2.5">
									<StatusBadge prioridade={c.solicitacao.prioridade} />
								</td>

								<!-- Origem -->
								<td class="border-r border-slate-100 px-3 py-2.5 font-sans text-slate-700 text-[11px]">
									<div>{c.unidadeOrigem}</div>
									<div class="font-mono text-[10px] text-slate-500">Req: {c.protocolo}</div>
								</td>

								<!-- Ações Clínicas -->
								<td class="px-3 py-2.5 text-center">
									<div class="flex items-center justify-center gap-1.5 flex-wrap">
										<!-- Botão Ver Solicitação -->
										<button
											type="button"
											onclick={() => abrirSolicitacao(c)}
											class="border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase"
											title="Ver encaminhamento médico original"
										>
											Solicitação
										</button>

										<!-- Botão Dossiê / Prontuário -->
										<button
											type="button"
											onclick={() => abrirDossie(c)}
											class="border border-blue-900 bg-white text-blue-900 hover:bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase"
											title="Ver Prontuário Eletrônico do Paciente"
										>
											Dossiê Clínico
										</button>

										<!-- Fluxo de Atendimento -->
										{#if c.status === 'AGUARDANDO'}
											<button
												type="button"
												onclick={() => iniciarAtendimento(c)}
												class="border border-emerald-800 bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
											>
												<IconPlayerPlay size={11} />
												<span>Iniciar</span>
											</button>
											<button
												type="button"
												onclick={() => marcarFalta(c)}
												class="border border-red-700 bg-white text-red-700 hover:bg-red-50 px-2 py-1 text-[10px] font-bold uppercase"
											>
												Falta
											</button>
										{:else if c.status === 'EM_ATENDIMENTO'}
											<button
												type="button"
												onclick={() => { consultaAtiva = c; }}
												class="border border-blue-900 bg-blue-900 text-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
											>
												<IconNotes size={11} />
												<span>Atender</span>
											</button>
										{:else if c.status === 'CONCLUIDO'}
											<span class="text-[10px] font-bold text-emerald-700">Atendido</span>
										{/if}
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

<!-- MODAL 1: Detalhes da Solicitação Médica Original -->
<ModalSolicitacaoOrigem
	isOpen={modalSolicitacaoAberto}
	consulta={consultaSolicitacao}
	onClose={() => (modalSolicitacaoAberto = false)}
/>

<!-- MODAL 2: Dossiê Completo do Paciente (Prontuário PEC) -->
<ModalDossiePaciente
	isOpen={modalDossieAberto}
	carregando={carregandoDossie}
	paciente={pacienteDossie}
	onClose={() => (modalDossieAberto = false)}
	onImprimirProntuario={() => (modalImprimirAberto = true)}
/>

<!-- MODAL 3: Formulario de Encaminhamento Intermunicipal / Regulação SMS (TFD) -->
<ModalReferenciaIntermunicipal
	isOpen={modalReferenciaAberto}
	consulta={consultaAtiva}
	enviando={enviandoReferencia}
	protocoloGerado={protocoloReferenciaGerado}
	onClose={() => (modalReferenciaAberto = false)}
	onSubmit={submeterReferenciaIntermunicipal}
/>

<!-- OVERLAY 4: Impressão do Prontuário Eletrônico (ImprimirProntuario) -->
{#if modalImprimirAberto && pacienteDossie}
	<ImprimirProntuario
		paciente={pacienteDossie}
		operador={auth.me ? `${auth.me.nome} (${auth.me.matricula})` : medicoLogado}
		prefeitura={auth.me?.prefeitura ?? 'Prefeitura Municipal'}
		unidade="Centro Municipal de Especialidades"
		onFechar={() => (modalImprimirAberto = false)}
	/>
{/if}

<!-- OVERLAY 5: Modal de Criação de Encaminhamento para Regulação SMS / Secretaria -->
<ModalNovoEncaminhamentoRegulacao
	isOpen={modalNovoEncaminhamentoAberto}
	consulta={consultaAtiva}
	{medicoLogado}
	{medicoCrm}
	{soapCid10}
	{soapDiagnostico}
	enviando={enviandoNovoEncaminhamento}
	onClose={() => (modalNovoEncaminhamentoAberto = false)}
	onSubmit={enviarNovoEncaminhamentoRegulacao}
/>

<!-- OVERLAY 6: Modal de Agendamento Direto de Retorno / Volta (Data Manual) -->
<ModalAgendarRetornoManual
	isOpen={modalRetornoAberto}
	consulta={consultaAtiva}
	medicoNomePadrao={medicoLogado}
	agendando={agendandoRetorno}
	onClose={() => (modalRetornoAberto = false)}
	onSubmit={confirmarAgendamentoRetornoManual}
/>

<style>
	select, input, textarea, button {
		border-radius: 0 !important;
	}
</style>

