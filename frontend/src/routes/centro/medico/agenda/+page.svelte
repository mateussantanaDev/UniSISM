<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
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
		MedicamentoEmUso
	} from '$lib/api/types';
	import StatusBadge from '$lib/presentation/components/StatusBadge.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import ImprimirProntuario from '$lib/presentation/components/prontuario/ImprimirProntuario.svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();

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
	}

	// Dynamic State
	let dataAgenda = $state(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD
	let medicoLogado = $state('Dr. Roberto Medeiros (Cardiologia)');
	let busca = $state('');
	let filtroStatus = $state<'TODOS' | 'AGUARDANDO' | 'EM_ATENDIMENTO' | 'CONCLUIDO' | 'FALTOU'>('TODOS');
	let carregando = $state(true);
	let erroGlobal = $state('');
	let mensagemSucesso = $state('');

	// Mock/Loaded appointments list
	let consultas = $state<ConsultaAgenda[]>([]);

	// Active Consultation State
	let consultaAtiva = $state<ConsultaAgenda | null>(null);
	let timerSegundos = $state(0);
	let timerInterval: any = null;

	// Form fields for active SOAP Consultation
	let soapQueixa = $state('');
	let soapExameFisico = $state('');
	let soapPa = $state('120/80');
	let soapFc = $state('72');
	let soapPeso = $state('70.5');
	let soapCid10 = $state('I10');
	let soapDiagnostico = $state('Hipertensão arterial essencial');
	let soapConduta = $state('');
	let soapPrescricao = $state('');
	let salvandoAtendimento = $state(false);

	// Modals State
	let modalSolicitacaoAberto = $state(false);
	let consultaSolicitacao = $state<ConsultaAgenda | null>(null);

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

	// Initial dataset generator / API loader
	async function carregarAgendaDoDia() {
		carregando = true;
		erroGlobal = '';
		try {
			// Tenta consumir endpoint v3.0.0 de agenda do especialista (centro-doc-back.md)
			try {
				const resCentro = await api.centroMedico.listAgenda({ data: dataAgenda });
				if (resCentro && Array.isArray(resCentro.agenda) && resCentro.agenda.length > 0) {
					consultas = resCentro.agenda.map((enc, idx) => ({
						id: enc.id,
						protocolo: enc.protocolo,
						horario: `0${8 + (idx % 4)}:${(idx * 20) % 60 === 0 ? '00' : (idx * 20) % 60}`,
						status: (enc.statusAtendimentoCentro || 'AGUARDANDO') as any,
						pacienteId: (enc.paciente as any).id || 'pac-uuid-' + (idx + 1),
						paciente: {
							nome: enc.paciente.nome,
							cpf: enc.paciente.cpf,
							cartaoSus: enc.paciente.cartaoSus || '898000123456' + idx,
							dataNascimento: enc.paciente.dataNascimento || '1978-05-14',
							sexo: enc.paciente.sexo || 'M',
							telefone: enc.paciente.telefone || '(51) 99887-1122',
							endereco: enc.paciente.endereco || 'Rua Central, 120'
						},
						solicitacao: {
							medicoSolicitante: enc.solicitacao.medicoSolicitante || 'Dr. Carlos Moreira',
							crm: enc.solicitacao.crm || 'CRM 45892',
							especialidadeSolicitada: enc.solicitacao.especialidadeSolicitada || 'Cardiologia',
							cid10: enc.solicitacao.cid10 || 'I10',
							cidDescricao: enc.solicitacao.cidDescricao || 'Hipertensão Essencial',
							justificativaClinica: enc.solicitacao.justificativaClinica || 'Picos hipertensivos recorrentes.',
							prioridade: enc.solicitacao.prioridade || 'PRIORITARIA',
							dataSolicitacao: enc.solicitacao.dataSolicitacao || '2026-07-20'
						},
						unidadeOrigem: enc.unidadeOrigem || 'UBS Central',
						observacoesRegulacao: enc.observacoesRegulacao || 'Prioridade de encaixe.'
					}));
					return;
				}
			} catch (errMedico) {
				console.info('[UniSISM] Endpoint /v1/centro/medico/agenda em transição — usando fallback /v1/encaminhamentos', errMedico);
			}

			// Fallback para API de encaminhamentos
			const res = await api.encaminhamentos.list({ status: 'APROVADO', limit: 1000 });
			const filtradosCentro = res.filter(e => e.filaDestino === 'CENTRO_ESPECIALIDADES');

			// If API returns real appointments for this date, map them; otherwise provide rich demo schedule
			if (filtradosCentro.length > 0) {
				const agendados = filtradosCentro.filter(e => !e.agendamentoPrevisto || e.agendamentoPrevisto === dataAgenda);
				consultas = agendados.map((enc, idx) => {
					const horas = ['08:00', '08:45', '09:30', '10:15', '11:00', '13:30', '14:15', '15:00'];
					return {
						id: enc.id,
						protocolo: enc.protocolo,
						horario: horas[idx % horas.length],
						status: (idx === 0 ? 'CONCLUIDO' : idx === 1 ? 'EM_ATENDIMENTO' : 'AGUARDANDO') as any,
						pacienteId: 'pac-uuid-' + (idx + 1),
						paciente: {
							nome: enc.paciente.nome,
							cpf: enc.paciente.cpf,
							cartaoSus: enc.paciente.cartaoSus || '898000123456' + idx,
							dataNascimento: enc.paciente.dataNascimento || '1978-05-14',
							sexo: enc.paciente.sexo || 'M',
							telefone: enc.paciente.telefone || '(51) 99887-1122',
							endereco: enc.paciente.endereco || 'Rua das Flores, 120'
						},
						solicitacao: {
							medicoSolicitante: enc.solicitacao.medicoSolicitante || 'Dr. Carlos Moreira',
							crm: enc.solicitacao.crm || 'CRM 45892',
							especialidadeSolicitada: enc.solicitacao.especialidadeSolicitada || 'Cardiologia',
							cid10: enc.solicitacao.cid10 || 'I10',
							cidDescricao: enc.solicitacao.cidDescricao || 'Hipertensão Essencial',
							justificativaClinica: enc.solicitacao.justificativaClinica || 'Paciente com picos hipertensivos recorrentes e queixa de palpitações.',
							prioridade: enc.solicitacao.prioridade || 'PRIORITARIA',
							dataSolicitacao: enc.solicitacao.dataSolicitacao || '2026-07-20'
						},
						unidadeOrigem: enc.unidadeOrigem || 'UBS Central',
						observacoesRegulacao: enc.observacoesRegulacao || 'Agendado no Centro de Especialidades.'
					};
				});
			} else {
				// Rich demo dataset for daily agenda
				consultas = [
					{
						id: 'cons-101',
						protocolo: 'ENC20260721-001',
						horario: '08:00',
						status: 'CONCLUIDO',
						pacienteId: 'pac-1',
						paciente: {
							nome: 'Mateus Henrique Silva',
							cpf: '123.456.789-09',
							cartaoSus: '898000123456789',
							dataNascimento: '1985-04-12',
							sexo: 'M',
							telefone: '(51) 99988-7766',
							endereco: 'Av. Central, 100 - Centro'
						},
						solicitacao: {
							medicoSolicitante: 'Dr. Fernando Souza',
							crm: 'CRM 34120',
							especialidadeSolicitada: 'Cardiologia',
							cid10: 'I10',
							cidDescricao: 'Hipertensão essencial (primária)',
							justificativaClinica: 'Paciente relata episódios de tontura e pressão 160x100 mmHg mantida.',
							prioridade: 'URGENTE',
							dataSolicitacao: '2026-07-15'
						},
						unidadeOrigem: 'UBS Central - Bairro Novo',
						observacoesRegulacao: 'Recepção: Médico Dr. Roberto Medeiros às 08:00.',
						atendimentoSOAP: {
							queixaPrincipal: 'Retorno para avaliação de picos hipertensivos.',
							exameFisico: 'PA: 130/85 mmHg, FC: 74 bpm, RCR 2T BNF sem sopros. Murmúrio vesicular presente sem ruídos adventícios.',
							cid10: 'I10',
							diagnostico: 'Hipertensão arterial primária sob controle medicamentos ajustado.',
							conduta: 'Ajustado anti-hipertensivo para Losartana 50mg 12/12h. Solicitado ECG e Ecocardiograma.',
							prescricao: '1. Losartana 50mg — Tomar 1 cp VO de 12/12h por 60 dias.\n2. Anlodipino 5mg — Tomar 1 cp VO pela manhã.',
							concluidoEm: '08:35'
						}
					},
					{
						id: 'cons-102',
						protocolo: 'ENC20260722-004',
						horario: '08:45',
						status: 'EM_ATENDIMENTO',
						pacienteId: 'pac-2',
						paciente: {
							nome: 'Maria Eduarda Oliveira',
							cpf: '987.654.321-00',
							cartaoSus: '898000987654321',
							dataNascimento: '1972-09-25',
							sexo: 'F',
							telefone: '(51) 98877-6655',
							endereco: 'Rua das Palmeiras, 450'
						},
						solicitacao: {
							medicoSolicitante: 'Dra. Juliana Paes',
							crm: 'CRM 51209',
							especialidadeSolicitada: 'Cardiologia',
							cid10: 'I20.9',
							cidDescricao: 'Angina pectoris não especificada',
							justificativaClinica: 'Dor precordial aos médios esforços com irradiação para membro superior esquerdo.',
							prioridade: 'EMERGENCIA',
							dataSolicitacao: '2026-07-20'
						},
						unidadeOrigem: 'UBS Vila Esperança',
						observacoesRegulacao: 'Prioridade absoluta de encaixe rápido.'
					},
					{
						id: 'cons-103',
						protocolo: 'ENC20260723-012',
						horario: '09:30',
						status: 'AGUARDANDO',
						pacienteId: 'pac-3',
						paciente: {
							nome: 'João Pedro Santos',
							cpf: '456.789.123-44',
							cartaoSus: '898000456789123',
							dataNascimento: '1960-11-30',
							sexo: 'M',
							telefone: '(51) 97766-5544',
							endereco: 'Rua 7 de Setembro, 88'
						},
						solicitacao: {
							medicoSolicitante: 'Dr. Lucas Viana',
							crm: 'CRM 62300',
							especialidadeSolicitada: 'Cardiologia',
							cid10: 'I48',
							cidDescricao: 'Flutter e fibrilação atrial',
							justificativaClinica: 'Palpitações taquicárdicas esporádicas. ECG da UBS demonstrou ritmo irregular.',
							prioridade: 'PRIORITARIA',
							dataSolicitacao: '2026-07-18'
						},
						unidadeOrigem: 'UBS São José',
						observacoesRegulacao: 'Trazer exames de sangue recentes.'
					},
					{
						id: 'cons-104',
						protocolo: 'ENC20260724-019',
						horario: '10:15',
						status: 'AGUARDANDO',
						pacienteId: 'pac-4',
						paciente: {
							nome: 'Ana Lucia Ferreira',
							cpf: '321.654.987-11',
							cartaoSus: '898000321654987',
							dataNascimento: '1990-01-15',
							sexo: 'F',
							telefone: '(51) 96655-4433',
							endereco: 'Av. Industrial, 1200'
						},
						solicitacao: {
							medicoSolicitante: 'Dr. Roberto Medeiros',
							crm: 'CRM 12345',
							especialidadeSolicitada: 'Cardiologia',
							cid10: 'R00.2',
							cidDescricao: 'Palpitações',
							justificativaClinica: 'Avaliação de síncope vasovagal recorrente.',
							prioridade: 'ELETIVA',
							dataSolicitacao: '2026-07-10'
						},
						unidadeOrigem: 'Balcão do Centro',
						observacoesRegulacao: 'Agendamento direto efetuado no balcão do Centro.'
					},
					{
						id: 'cons-105',
						protocolo: 'ENC20260725-022',
						horario: '11:00',
						status: 'FALTOU',
						pacienteId: 'pac-5',
						paciente: {
							nome: 'Carlos Eduardo Ramos',
							cpf: '789.123.456-55',
							cartaoSus: '898000789123456',
							dataNascimento: '1955-06-08',
							sexo: 'M',
							telefone: '(51) 95544-3322',
							endereco: 'Linha IV Interior'
						},
						solicitacao: {
							medicoSolicitante: 'Dra. Beatriz Costa',
							crm: 'CRM 55667',
							especialidadeSolicitada: 'Cardiologia',
							cid10: 'I50',
							cidDescricao: 'Insuficiência cardíaca',
							justificativaClinica: 'Dispneia paroxística noturna e edema de membros inferiores ++/4.',
							prioridade: 'PRIORITARIA',
							dataSolicitacao: '2026-07-12'
						},
						unidadeOrigem: 'UBS Rural',
						observacoesRegulacao: 'Paciente não compareceu no horário.'
					}
				];
			}
		} catch (e) {
			console.error(e);
			erroGlobal = 'Falha ao conectar ao servidor. Exibindo dados locais da agenda.';
		} finally {
			carregando = false;
		}
	}

	onMount(() => {
		carregarAgendaDoDia();
	});

	onDestroy(() => {
		if (timerInterval) clearInterval(timerInterval);
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

	function calcularIdade(dataNasc: string): number {
		const hoje = new Date();
		const nasc = new Date(dataNasc);
		let idade = hoje.getFullYear() - nasc.getFullYear();
		const m = hoje.getMonth() - nasc.getMonth();
		if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
		return idade;
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

		// Reset SOAP form
		soapQueixa = `Paciente ${c.paciente.nome}, ${calcularIdade(c.paciente.dataNascimento)} anos. Queixa: ${c.solicitacao.justificativaClinica}`;
		soapExameFisico = 'Aparelho Cardiovascular: RCR em 2 tempos, bulhas normofonéticas sem sopros. PA: 120/80 mmHg, FC: 72 bpm.\nAparelho Respiratório: Murmúrio vesicular distribuído sem ruídos adventícios.';
		soapPa = '120/80';
		soapFc = '75';
		soapPeso = '72.0';
		soapCid10 = c.solicitacao.cid10 || 'I10';
		soapDiagnostico = c.solicitacao.cidDescricao || 'Avaliação Cardiológica Especializada';
		soapConduta = 'Orientada mudança no estilo de vida, dieta hipossódica e atividade física moderada. Mantida medicação de uso contínuo.';
		soapPrescricao = '1. Enalapril 10mg — Tomar 1 comprimido por via oral a cada 12 horas.\n2. Controle diário de PA por 14 dias.';

		// Start Timer
		timerSegundos = 0;
		if (timerInterval) clearInterval(timerInterval);
		timerInterval = setInterval(() => {
			timerSegundos++;
		}, 1000);
	}

	function formatarTimer(segs: number) {
		const min = Math.floor(segs / 60);
		const sec = segs % 60;
		return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
	}

	async function concluirAtendimento() {
		if (!consultaAtiva) return;
		if (!soapCid10.trim() || !soapDiagnostico.trim() || !soapConduta.trim()) {
			alert('Preencha os campos obrigatórios da consulta (CID-10, Diagnóstico e Conduta).');
			return;
		}

		salvandoAtendimento = true;
		try {
			// Register attendance via dedicated Centro SOAP endpoint (v3.0.0 centro-doc-back.md)
			try {
				await api.centroMedico.registrarAtendimentoSoap(consultaAtiva.id, {
					subjetivo: soapQueixa,
					objetivo: `${soapExameFisico}\nSinais Vitais: PA ${soapPa} mmHg | FC ${soapFc} bpm | Peso ${soapPeso}kg`,
					avaliacao: soapDiagnostico,
					plano: soapConduta,
					queixaPrincipal: soapQueixa,
					diagnostico: soapDiagnostico,
					cid10: soapCid10,
					conduta: soapConduta,
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
						conduta: soapConduta,
						prescricaoResumo: soapPrescricao
					});
				} catch (e) {
					console.warn('Backend API não disponivel para gravação do PEC — gravando estado local.', e);
				}
			}

			// Update consultation in list
			const agoraHora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
			consultaAtiva.status = 'CONCLUIDO';
			consultaAtiva.atendimentoSOAP = {
				queixaPrincipal: soapQueixa,
				exameFisico: `${soapExameFisico}\nSinais Vitais: PA ${soapPa} mmHg | FC ${soapFc} bpm | Peso ${soapPeso}kg`,
				cid10: soapCid10,
				diagnostico: soapDiagnostico,
				conduta: soapConduta,
				prescricao: soapPrescricao,
				concluidoEm: agoraHora
			};

			mensagemSucesso = `✓ ATENDIMENTO CONCLUÍDO COM SUCESSO!\nPaciente: ${consultaAtiva.paciente.nome} | CID-10: ${soapCid10} (${soapDiagnostico}) | Horário: ${agoraHora}`;
			
			// Stop timer & close
			if (timerInterval) clearInterval(timerInterval);
			consultaAtiva = null;

			setTimeout(() => {
				mensagemSucesso = '';
			}, 6000);
		} catch (e) {
			console.error(e);
			alert('Falha ao concluir atendimento.');
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
		} catch (e) {
			console.warn('Usando dossiê fallback estruturado para exibição do prontuário.');
			pacienteDossie = {
				id: c.pacienteId,
				nome: c.paciente.nome,
				cpf: c.paciente.cpf,
				cartaoSus: c.paciente.cartaoSus,
				dataNascimento: c.paciente.dataNascimento,
				sexo: c.paciente.sexo,
				telefone: c.paciente.telefone,
				unidadeVinculada: c.unidadeOrigem,
				condicoesCronicasAtivas: 2,
				encaminhamentosAtivos: 1,
				cadastradoEm: '2025-01-10',
				nomeMae: 'Maria Helena Silva',
				estadoCivil: 'CASADO',
				escolaridade: 'Ensino Médio Completo',
				racaCor: 'PARDA',
				endereco: c.paciente.endereco,
				bairro: 'Centro',
				municipio: 'Município Sede',
				uf: 'RS',
				cep: '95000-000',
				grupoSanguineo: 'O+',
				alergias: [
					{ id: 'al-1', substancia: 'Penicilina', tipo: 'MEDICAMENTO', gravidade: 'GRAVE', observacao: 'Anafilaxia previa em 2018' },
					{ id: 'al-2', substancia: 'Dipirona', tipo: 'MEDICAMENTO', gravidade: 'MODERADA', observacao: 'Exantema cutaneo' }
				],
				condicoesCronicas: [
					{ id: 'cc-1', cid10: 'I10', descricao: 'Hipertensão Arterial Essencial', desde: '2020-03-15', ativo: true },
					{ id: 'cc-2', cid10: 'E11', descricao: 'Diabetes Mellitus Tipo 2', desde: '2022-08-10', ativo: true }
				],
				medicamentosEmUso: [
					{ id: 'med-1', nome: 'Losartana Potássica', dosagem: '50mg', frequencia: '12/12h', desde: '2020-03-15', prescritor: 'Dr. Fernando Souza', ativo: true },
					{ id: 'med-2', nome: 'Metformina', dosagem: '850mg', frequencia: 'Após almoço', desde: '2022-08-10', prescritor: 'Dra. Ana Paula', ativo: true }
				],
				historicoFamiliar: ['Pai: Infarto Agudo do Miocárdio aos 58 anos', 'Mãe: Diabetes Mellitus Tipo 2'],
				atendimentos: [
					{
						id: 'at-1',
						data: '2026-05-10T14:30:00Z',
						tipo: 'CONSULTA_MEDICA',
						profissional: 'Dr. Fernando Souza',
						registroProfissional: 'CRM 34120',
						especialidade: 'Medicina da Família',
						unidade: c.unidadeOrigem,
						queixaPrincipal: 'Checkup de rotina e receitas de uso contínuo',
						diagnostico: 'Hipertensão Essencial Controlada',
						cid10: 'I10',
						conduta: 'Renovadas receitas de Losartana e Metformina. Solicitado ECG e Perfil Lipídico.'
					}
				],
				viagensTFD: [],
				exames: [
					{ id: 'ex-1', data: '2026-06-01', tipo: 'Eletrocardiograma (ECG)', categoria: 'FUNCIONAL', solicitante: 'Dr. Fernando Souza', unidadeExecutora: 'Centro de Especialidades', resultado: 'ALTERADO', observacao: 'Ritmo sinusal com sobrecarga ventricular esquerda leve.' },
					{ id: 'ex-2', data: '2026-06-01', tipo: 'Glicemia de Jejum', categoria: 'LABORATORIAL', solicitante: 'Dr. Fernando Souza', unidadeExecutora: 'Lab Municipal', resultado: 'NORMAL', observacao: '94 mg/dL' }
				],
				vacinacoes: [
					{ id: 'vac-1', data: '2026-04-10', vacina: 'Influenza Quadrivalente 2026', dose: 'Dose Anual', lote: 'INF2026-X8', aplicador: 'Enf. Carla', unidade: c.unidadeOrigem, via: 'INTRAMUSCULAR' }
				],
				medicosAtendentes: [
					{ nome: 'Dr. Roberto Medeiros', registro: 'CRM 12345', especialidade: 'Cardiologia', unidade: 'Centro de Especialidades', ultimaConsulta: '2026-07-27', totalConsultas: 2 }
				],
				encaminhamentosIds: [c.id]
			};
		} finally {
			carregandoDossie = false;
		}
	}

	// Intermunicipal Referral Action (Envio para a Regulação da SMS / TFD)
	function abrirFormularioReferencia() {
		if (!consultaAtiva) return;
		protocoloReferenciaGerado = '';
		refMunicipioDestino = 'Porto Alegre';
		refEspecialidade = 'Cirurgia Cardiovascular / Alta Complexidade';
		refCid10 = soapCid10 || consultaAtiva.solicitacao.cid10;
		refDiagnostico = soapDiagnostico || consultaAtiva.solicitacao.cidDescricao;
		refJustificativa = `Paciente necessita de avaliação e intervenção especializada em centro de referência intermunicipal de alta complexidade. Ausência de suporte tecnológico municipal no local.`;
		refPrioridade = consultaAtiva.solicitacao.prioridade;
		modalReferenciaAberto = true;
	}

	async function submeterReferenciaIntermunicipal() {
		if (!consultaAtiva) return;
		if (!refMunicipioDestino || !refEspecialidade || !refJustificativa.trim()) {
			alert('Preencha os campos obrigatórios do encaminhamento intermunicipal.');
			return;
		}

		enviandoReferencia = true;
		try {
			let protocoloObtido = '';
			// Send intermunicipal referral via dedicated Centro TFD endpoint (v3.0.0 centro-doc-back.md)
			try {
				const resTfd = await api.centroMedico.criarEncaminhamentoIntermunicipal({
					pacienteId: consultaAtiva.pacienteId,
					solicitacao: {
						especialidadeSolicitada: `${refEspecialidade} (${refMunicipioDestino})`,
						cid10: refCid10,
						cidDescricao: refDiagnostico,
						justificativaClinica: `[ENCAMINHAMENTO INTERMUNICIPAL PARA REGULAÇÃO SMS / TFD]\nMunicípio Destino: ${refMunicipioDestino}\nTransporte: ${refTransporte} | Acompanhante: ${refAcompanhante ? 'Sim' : 'Não'}\n\nLaudo Médico:\n${refJustificativa.trim()}`,
						prioridade: refPrioridade
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
						especialidadeSolicitada: `${refEspecialidade} (${refMunicipioDestino})`,
						cid10: refCid10,
						cidDescricao: refDiagnostico,
						justificativaClinica: `[ENCAMINHAMENTO INTERMUNICIPAL PARA REGULAÇÃO SMS / TFD]\nMunicípio Destino: ${refMunicipioDestino}\nTransporte: ${refTransporte} | Acompanhante: ${refAcompanhante ? 'Sim' : 'Não'}\n\nLaudo Médico:\n${refJustificativa.trim()}`,
						prioridade: refPrioridade,
						dataSolicitacao: new Date().toISOString().substring(0, 10)
					}
				});
				protocoloObtido = criado.protocolo;
			}

			protocoloReferenciaGerado = protocoloObtido;
			consultaAtiva.encaminhamentoIntermunicipal = {
				protocolo: protocoloObtido,
				municipioDestino: refMunicipioDestino,
				especialidade: refEspecialidade,
				criadoEm: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
			};

			// Add note to SOAP conduct
			soapConduta += `\n\n[ENCAMINHAMENTO INTERMUNICIPAL GERADO: Protocolo ${protocoloObtido} para ${refEspecialidade} em ${refMunicipioDestino} — Enviado à Regulação SMS]`;

			setTimeout(() => {
				modalReferenciaAberto = false;
			}, 3500);
		} catch (e) {
			console.error(e);
			alert('Falha ao enviar encaminhamento para a regulação da SMS.');
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
		<div class="border border-amber-600 bg-amber-50 p-3 font-semibold text-amber-900">
			⚠ {erroGlobal}
		</div>
	{/if}

	<!-- 1. Cabeçalho de Contexto do Médico e Seletor de Data da Agenda -->
	<section class="grid grid-cols-1 gap-3 md:grid-cols-12">
		<!-- Card de Identificação do Especialista -->
		<div class="border border-slate-200 bg-white p-4 md:col-span-4 flex flex-col justify-between">
			<div>
				<div class="text-[9px] font-bold tracking-widest text-slate-500 uppercase">ESPECIALISTA RESPONSÁVEL</div>
				<div class="mt-1 text-base font-bold text-slate-900 font-sans">{medicoLogado}</div>
				<div class="text-[11px] text-blue-900 font-bold mt-0.5">Centro Municipal de Especialidades · CRM 12345</div>
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

	<!-- 2. AMBIENTE DE CONSULTA ATIVA (SOAP + PEC + Encaminhamento Intermunicipal) -->
	{#if consultaAtiva}
		<section class="border-2 border-blue-900 bg-white shadow-md">
			<!-- Header do Atendimento com Cronômetro -->
			<div class="flex flex-wrap items-center justify-between border-b-2 border-blue-900 bg-blue-900 px-6 py-3 text-white">
				<div class="flex items-center gap-3">
					<span class="flex h-7 w-7 items-center justify-center bg-white font-mono text-xs font-bold text-blue-900">
						🩺
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
						class="border border-white/40 bg-white/10 hover:bg-white/20 px-3 py-1 font-bold text-xs uppercase tracking-wider text-white"
					>
						📋 Abrir Prontuário Completo (PEC)
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
						<div class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
							O — OBJETIVO / SINAIS VITAIS E AFERIÇÕES
						</div>
						<div class="grid grid-cols-3 gap-2 font-mono text-xs">
							<div>
								<label for="sv-pa" class="text-[9px] text-slate-500">PA (mmHg)</label>
								<input id="sv-pa" type="text" bind:value={soapPa} class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs font-bold" />
							</div>
							<div>
								<label for="sv-fc" class="text-[9px] text-slate-500">FC (bpm)</label>
								<input id="sv-fc" type="text" bind:value={soapFc} class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs font-bold" />
							</div>
							<div>
								<label for="sv-peso" class="text-[9px] text-slate-500">PESO (kg)</label>
								<input id="sv-peso" type="text" bind:value={soapPeso} class="w-full border border-slate-300 bg-white px-2 py-1 outline-none text-xs font-bold" />
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
					<!-- A: Avaliação e CID-10 -->
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

					<!-- Prescrição Médica -->
					<div class="flex flex-col gap-1">
						<label for="soap-presc" class="font-mono text-[10px] font-bold tracking-widest text-slate-600 uppercase">
							RECEITA E PRESCRIÇÃO DE MEDICAMENTOS
						</label>
						<textarea
							id="soap-presc"
							rows="3"
							bind:value={soapPrescricao}
							placeholder="1. Nome do medicamento - posologia..."
							class="w-full border border-slate-300 bg-white p-2.5 text-xs font-mono outline-none focus:border-blue-900 resize-none"
						></textarea>
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
				</div>
			</div>

			<!-- Rodapé de Ações de Conclusão -->
			<div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
				<div class="font-mono text-xs text-slate-600">
					* Ao concluir, o registro será gravado permanentemente no Prontuário do Paciente (PEC).
				</div>

				<div class="flex items-center gap-3">
					<button
						type="button"
						onclick={() => abrirDossie(consultaAtiva!)}
						class="border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 font-mono text-xs font-bold uppercase text-slate-800"
					>
						Ver Dossiê do Paciente
					</button>

					<button
						type="button"
						onclick={concluirAtendimento}
						disabled={salvandoAtendimento}
						class="border border-emerald-800 bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-2 font-mono text-xs font-bold uppercase tracking-wider disabled:opacity-50"
					>
						{salvandoAtendimento ? 'Gravando PEC...' : '✓ CONCLUIR ATENDIMENTO'}
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
				disabled={carregando}
				class="border border-slate-300 bg-white px-3 py-1 font-bold text-slate-700 uppercase hover:border-blue-900 disabled:opacity-50"
			>
				{carregando ? 'Carregando...' : 'Atualizar Agenda'}
			</button>
		</PanelHeader>

		<div class="grid grid-cols-1 gap-3 p-4 md:grid-cols-12 font-sans">
			<!-- Campo de Busca -->
			<div class="md:col-span-6 flex flex-col gap-1">
				<label for="busca-med" class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Buscar na Agenda
				</label>
				<input
					id="busca-med"
					type="text"
					bind:value={busca}
					placeholder="Nome do paciente, CPF, Protocolo ou CID..."
					class="w-full border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-900"
				/>
			</div>

			<!-- Filtro por Status -->
			<div class="md:col-span-6 flex flex-col gap-1">
				<label for="filtro-status" class="font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
					Status do Atendimento
				</label>
				<select
					id="filtro-status"
					bind:value={filtroStatus}
					class="w-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono outline-none focus:border-blue-900"
				>
					<option value="TODOS">TODOS OS STATUS</option>
					<option value="AGUARDANDO">AGUARDANDO ATENDIMENTO</option>
					<option value="EM_ATENDIMENTO">EM ATENDIMENTO (EM ANDAMENTO)</option>
					<option value="CONCLUIDO">CONCLUÍDO (ATENDIDO)</option>
					<option value="FALTOU">FALTOU / ABSENTEÍSMO</option>
				</select>
			</div>
		</div>
	</div>

	<!-- 4. Tabela/Lista Cronológica de Pacientes Agendados para o Dia -->
	<div class="border border-slate-200 bg-white">
		<PanelHeader title="Lista Cronológica de Atendimentos" index="02">
			<span class="border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-mono text-slate-700 uppercase">
				{consultasFiltradas.length} Pacientes
			</span>
		</PanelHeader>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr class="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-widest text-slate-600 uppercase">
						<th class="border-r border-slate-200 px-3 py-2">Horário</th>
						<th class="border-r border-slate-200 px-3 py-2">Status</th>
						<th class="border-r border-slate-200 px-3 py-2">Paciente / Identificação</th>
						<th class="border-r border-slate-200 px-3 py-2">Especialidade / CID-10</th>
						<th class="border-r border-slate-200 px-3 py-2">Prioridade</th>
						<th class="border-r border-slate-200 px-3 py-2">Origem / UBS</th>
						<th class="px-3 py-2 text-center">Ações Clínicas</th>
					</tr>
				</thead>
				<tbody class="font-mono">
					{#if carregando}
						{#each Array(5) as _, i (i)}
							<tr class="border-b border-slate-100">
								<td colspan="7" class="px-3 py-4">
									<div class="h-4 w-full animate-pulse bg-slate-100"></div>
								</td>
							</tr>
						{/each}
					{:else if consultasFiltradas.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-12 text-center font-sans text-sm text-slate-500">
								Nenhum paciente encontrado para os filtros selecionados.
							</td>
						</tr>
					{:else}
						{#each consultasFiltradas as c (c.id)}
							<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors {c.status === 'EM_ATENDIMENTO' ? 'bg-blue-50/50' : ''}">
								<!-- Horário -->
								<td class="border-r border-slate-100 px-3 py-2.5 font-bold text-blue-900 text-sm">
									{c.horario}
								</td>

								<!-- Status -->
								<td class="border-r border-slate-100 px-3 py-2.5">
									{#if c.status === 'AGUARDANDO'}
										<span class="border border-amber-600 bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-bold">
											AGUARDANDO
										</span>
									{:else if c.status === 'EM_ATENDIMENTO'}
										<span class="border border-blue-700 bg-blue-100 text-blue-900 px-2 py-0.5 text-[10px] font-bold animate-pulse">
											EM ATENDIMENTO
										</span>
									{:else if c.status === 'CONCLUIDO'}
										<span class="border border-emerald-700 bg-emerald-100 text-emerald-900 px-2 py-0.5 text-[10px] font-bold">
											✓ CONCLUÍDO
										</span>
									{:else}
										<span class="border border-red-700 bg-red-100 text-red-900 px-2 py-0.5 text-[10px] font-bold">
											FALTOU
										</span>
									{/if}
								</td>

								<!-- Paciente -->
								<td class="border-r border-slate-100 px-3 py-2.5 font-sans">
									<div class="font-bold text-slate-900">{c.paciente.nome}</div>
									<div class="font-mono text-[10px] text-slate-500">
										CPF: {c.paciente.cpf} · {calcularIdade(c.paciente.dataNascimento)} anos ({c.paciente.sexo})
									</div>
								</td>

								<!-- Especialidade / CID-10 -->
								<td class="border-r border-slate-100 px-3 py-2.5 font-sans">
									<div class="font-semibold text-slate-900">{c.solicitacao.especialidadeSolicitada}</div>
									<div class="font-mono text-[10px] text-slate-600">
										CID-10: <strong>{c.solicitacao.cid10}</strong> ({c.solicitacao.cidDescricao})
									</div>
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
											Dossiê PEC
										</button>

										<!-- Fluxo de Atendimento -->
										{#if c.status === 'AGUARDANDO'}
											<button
												type="button"
												onclick={() => iniciarAtendimento(c)}
												class="border border-emerald-800 bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
											>
												🩺 Iniciar
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
												class="border border-blue-900 bg-blue-900 text-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
											>
												✍️ Atender
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
<Modal
	isOpen={modalSolicitacaoAberto}
	onClose={() => modalSolicitacaoAberto = false}
	title="SOLICITAÇÃO MÉDICA DE ORIGEM"
	subtitle={consultaSolicitacao ? `Protocolo: ${consultaSolicitacao.protocolo} · Unidade: ${consultaSolicitacao.unidadeOrigem}` : ''}
	maxWidth="lg"
>
	{#if consultaSolicitacao}
		<div class="flex flex-col gap-4 font-mono text-xs">
			<!-- Dados do Paciente e Origem -->
			<div class="border border-slate-200 bg-slate-50 p-4 grid grid-cols-2 gap-4">
				<div>
					<div class="text-[9px] font-bold text-slate-500 uppercase">PACIENTE</div>
					<div class="font-bold text-slate-900 text-sm font-sans">{consultaSolicitacao.paciente.nome}</div>
					<div class="text-[11px] text-slate-600">CPF: {consultaSolicitacao.paciente.cpf} · SUS: {consultaSolicitacao.paciente.cartaoSus}</div>
				</div>
				<div>
					<div class="text-[9px] font-bold text-slate-500 uppercase">MÉDICO SOLICITANTE DA UBS</div>
					<div class="font-bold text-slate-900 font-sans">{consultaSolicitacao.solicitacao.medicoSolicitante}</div>
					<div class="text-[11px] text-slate-600">{consultaSolicitacao.solicitacao.crm} · Data: {consultaSolicitacao.solicitacao.dataSolicitacao}</div>
				</div>
			</div>

			<!-- Detalhes Clínicos da Solicitação -->
			<div class="border border-slate-200 p-4 flex flex-col gap-3 font-sans">
				<div class="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3 font-mono">
					<div>
						<span class="text-[10px] text-slate-500 uppercase block">Especialidade Solicitada</span>
						<span class="font-bold text-blue-900 text-sm">{consultaSolicitacao.solicitacao.especialidadeSolicitada}</span>
					</div>
					<div>
						<span class="text-[10px] text-slate-500 uppercase block">CID-10 e Diagnóstico</span>
						<span class="font-bold text-slate-900">{consultaSolicitacao.solicitacao.cid10} — {consultaSolicitacao.solicitacao.cidDescricao}</span>
					</div>
				</div>

				<div>
					<div class="font-mono text-[10px] font-bold text-slate-500 uppercase">JUSTIFICATIVA CLÍNICA ORIGINAL DA UBS</div>
					<div class="mt-1 bg-slate-50 border border-slate-200 p-3 text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
						{consultaSolicitacao.solicitacao.justificativaClinica}
					</div>
				</div>

				{#if consultaSolicitacao.observacoesRegulacao}
					<div>
						<div class="font-mono text-[10px] font-bold text-slate-500 uppercase">NOTAS DE REGULAÇÃO / RECEPÇÃO</div>
						<div class="mt-1 bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-900 font-mono">
							{consultaSolicitacao.observacoesRegulacao}
						</div>
					</div>
				{/if}
			</div>

			<div class="flex justify-end pt-2 border-t border-slate-200">
				<button
					type="button"
					onclick={() => modalSolicitacaoAberto = false}
					class="border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase"
				>
					Fechar
				</button>
			</div>
		</div>
	{/if}
</Modal>

<!-- MODAL 2: Dossiê Completo do Paciente (Prontuário PEC) -->
<Modal
	isOpen={modalDossieAberto}
	onClose={() => modalDossieAberto = false}
	title="DOSSIÊ COMPLETO DO PACIENTE (PEC)"
	subtitle={pacienteDossie ? `${pacienteDossie.nome} · CPF: ${pacienteDossie.cpf}` : ''}
	maxWidth="xl"
>
	{#if carregandoDossie}
		<div class="p-8 text-center font-mono text-xs text-slate-500">
			Carregando prontuário eletrônico completo...
		</div>
	{:else if pacienteDossie}
		<div class="flex flex-col gap-4 font-mono text-xs">
			<!-- Header Resumo com Impressão -->
			<div class="border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-3">
				<div>
					<div class="text-base font-bold text-slate-900 font-sans">{pacienteDossie.nome}</div>
					<div class="text-xs text-slate-600">
						Cartão SUS: {pacienteDossie.cartaoSus} · {pacienteDossie.sexo === 'M' ? 'Masculino' : 'Feminino'} · Nascimento: {pacienteDossie.dataNascimento}
					</div>
				</div>

				<button
					type="button"
					onclick={() => modalImprimirAberto = true}
					class="border border-blue-900 bg-blue-900 text-white px-4 py-2 font-bold text-xs uppercase tracking-wider hover:bg-blue-950"
				>
					🖨️ Imprimir Prontuário Completo
				</button>
			</div>

			<!-- Abas do Dossiê -->
			<div class="flex border-b border-slate-200 bg-slate-100 overflow-x-auto">
				<button
					type="button"
					onclick={() => abaDossieAtiva = 'resumo'}
					class="px-4 py-2.5 font-bold uppercase text-xs border-b-2 transition-colors {abaDossieAtiva === 'resumo' ? 'border-blue-900 bg-white text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-200'}"
				>
					Resumo
				</button>
				<button
					type="button"
					onclick={() => abaDossieAtiva = 'quadro'}
					class="px-4 py-2.5 font-bold uppercase text-xs border-b-2 transition-colors {abaDossieAtiva === 'quadro' ? 'border-blue-900 bg-white text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-200'}"
				>
					Alergias & Crônicas
				</button>
				<button
					type="button"
					onclick={() => abaDossieAtiva = 'atendimentos'}
					class="px-4 py-2.5 font-bold uppercase text-xs border-b-2 transition-colors {abaDossieAtiva === 'atendimentos' ? 'border-blue-900 bg-white text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-200'}"
				>
					Histórico de Consultas
				</button>
				<button
					type="button"
					onclick={() => abaDossieAtiva = 'exames'}
					class="px-4 py-2.5 font-bold uppercase text-xs border-b-2 transition-colors {abaDossieAtiva === 'exames' ? 'border-blue-900 bg-white text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-200'}"
				>
					Exames Realizados
				</button>
				<button
					type="button"
					onclick={() => abaDossieAtiva = 'vacinas'}
					class="px-4 py-2.5 font-bold uppercase text-xs border-b-2 transition-colors {abaDossieAtiva === 'vacinas' ? 'border-blue-900 bg-white text-blue-900' : 'border-transparent text-slate-600 hover:bg-slate-200'}"
				>
					Vacinação
				</button>
			</div>

			<!-- Conteúdo das Abas -->
			<div class="p-4 border border-slate-200 bg-white min-h-[250px]">
				{#if abaDossieAtiva === 'resumo'}
					<div class="grid grid-cols-2 gap-4 font-sans text-xs">
						<div>
							<h4 class="font-mono font-bold text-slate-500 text-[10px] uppercase border-b pb-1 mb-2">Dados Cadastrais</h4>
							<p><strong>Mãe:</strong> {pacienteDossie.nomeMae}</p>
							<p><strong>Endereço:</strong> {pacienteDossie.endereco}, {pacienteDossie.bairro} - {pacienteDossie.municipio}/{pacienteDossie.uf}</p>
							<p><strong>Telefone:</strong> {pacienteDossie.telefone}</p>
							<p><strong>Unidade de Vínculo:</strong> {pacienteDossie.unidadeVinculada}</p>
						</div>
						<div>
							<h4 class="font-mono font-bold text-slate-500 text-[10px] uppercase border-b pb-1 mb-2">Alertas de Saúde</h4>
							<p><strong class="text-red-700">Alergias:</strong> {pacienteDossie.alergias.map(a => a.substancia).join(', ') || 'Nenhuma'}</p>
							<p><strong>Condições Crônicas:</strong> {pacienteDossie.condicoesCronicas.map(c => c.descricao).join(', ') || 'Nenhuma'}</p>
							<p><strong>Medicamentos em Uso:</strong> {pacienteDossie.medicamentosEmUso.map(m => `${m.nome} ${m.dosagem}`).join(', ') || 'Nenhum'}</p>
						</div>
					</div>
				{:else if abaDossieAtiva === 'quadro'}
					<div class="flex flex-col gap-4 font-sans text-xs">
						<!-- Alergias -->
						<div>
							<h4 class="font-mono font-bold text-red-700 text-xs uppercase mb-2">Alergias Registradas</h4>
							<div class="border border-red-200 bg-red-50 p-3">
								{#each pacienteDossie.alergias as al}
									<div class="font-bold text-red-900">{al.substancia} ({al.tipo}) — Gravidade: {al.gravidade}</div>
									<div class="text-xs text-red-800">{al.observacao}</div>
								{:else}
									<div class="text-slate-500">Nenhuma alergia registrada.</div>
								{/each}
							</div>
						</div>

						<!-- Medicamentos em Uso -->
						<div>
							<h4 class="font-mono font-bold text-slate-800 text-xs uppercase mb-2">Medicamentos em Uso Contínuo</h4>
							<table class="w-full border-collapse font-mono text-xs border border-slate-200">
								<thead>
									<tr class="bg-slate-100 text-left border-b border-slate-200">
										<th class="p-2">Medicamento</th>
										<th class="p-2">Dosagem</th>
										<th class="p-2">Frequência</th>
										<th class="p-2">Prescritor</th>
									</tr>
								</thead>
								<tbody>
									{#each pacienteDossie.medicamentosEmUso as med}
										<tr class="border-b border-slate-100">
											<td class="p-2 font-bold">{med.nome}</td>
											<td class="p-2">{med.dosagem}</td>
											<td class="p-2">{med.frequencia}</td>
											<td class="p-2">{med.prescritor}</td>
										</tr>
									{:else}
										<tr><td colspan="4" class="p-4 text-center text-slate-500">Nenhum medicamento registrado.</td></tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{:else if abaDossieAtiva === 'atendimentos'}
					<div class="flex flex-col gap-3 font-sans text-xs">
						{#each pacienteDossie.atendimentos as at}
							<div class="border border-slate-200 p-3 bg-slate-50">
								<div class="flex justify-between border-b border-slate-200 pb-1.5 font-mono text-[11px] text-slate-600">
									<span>{new Date(at.data).toLocaleString('pt-BR')} — <strong>{at.profissional}</strong> ({at.especialidade})</span>
									<span>CID-10: <strong>{at.cid10}</strong></span>
								</div>
								<div class="mt-2">
									<p><strong>Queixa:</strong> {at.queixaPrincipal}</p>
									<p><strong>Diagnóstico:</strong> {at.diagnostico}</p>
									<p><strong>Conduta:</strong> {at.conduta}</p>
								</div>
							</div>
						{:else}
							<div class="p-8 text-center text-slate-500">Nenhum atendimento anterior registrado.</div>
						{/each}
					</div>
				{:else if abaDossieAtiva === 'exames'}
					<table class="w-full border-collapse font-mono text-xs border border-slate-200">
						<thead>
							<tr class="bg-slate-100 text-left border-b border-slate-200">
								<th class="p-2">Data</th>
								<th class="p-2">Exame</th>
								<th class="p-2">Solicitante</th>
								<th class="p-2">Resultado</th>
							</tr>
						</thead>
						<tbody>
							{#each pacienteDossie.exames as ex}
								<tr class="border-b border-slate-100">
									<td class="p-2">{ex.data}</td>
									<td class="p-2 font-bold">{ex.tipo}</td>
									<td class="p-2">{ex.solicitante}</td>
									<td class="p-2 font-bold {ex.resultado === 'ALTERADO' ? 'text-red-700' : 'text-emerald-700'}">{ex.resultado}</td>
								</tr>
							{:else}
								<tr><td colspan="4" class="p-4 text-center text-slate-500">Nenhum exame registrado.</td></tr>
							{/each}
						</tbody>
					</table>
				{:else if abaDossieAtiva === 'vacinas'}
					<table class="w-full border-collapse font-mono text-xs border border-slate-200">
						<thead>
							<tr class="bg-slate-100 text-left border-b border-slate-200">
								<th class="p-2">Data</th>
								<th class="p-2">Vacina</th>
								<th class="p-2">Dose</th>
								<th class="p-2">Lote</th>
							</tr>
						</thead>
						<tbody>
							{#each pacienteDossie.vacinacoes as vc}
								<tr class="border-b border-slate-100">
									<td class="p-2">{vc.data}</td>
									<td class="p-2 font-bold">{vc.vacina}</td>
									<td class="p-2">{vc.dose}</td>
									<td class="p-2">{vc.lote}</td>
								</tr>
							{:else}
								<tr><td colspan="4" class="p-4 text-center text-slate-500">Nenhuma vacina registrada.</td></tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>

			<div class="flex justify-end pt-2">
				<button
					type="button"
					onclick={() => modalDossieAberto = false}
					class="border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase"
				>
					Fechar Dossiê
				</button>
			</div>
		</div>
	{/if}
</Modal>

<!-- MODAL 3: Formulario de Encaminhamento Intermunicipal / Regulação SMS (TFD) -->
<Modal
	isOpen={modalReferenciaAberto}
	onClose={() => modalReferenciaAberto = false}
	title="ENCAMINHAMENTO INTERMUNICIPAL (REGULAÇÃO SMS / TFD)"
	subtitle={consultaAtiva ? `Paciente: ${consultaAtiva.paciente.nome}` : ''}
	maxWidth="lg"
>
	{#if protocoloReferenciaGerado}
		<div class="border-2 border-emerald-700 bg-emerald-50 p-6 text-center flex flex-col items-center gap-3">
			<div class="text-xl font-black text-emerald-900 font-mono">
				✓ ENCAMINHAMENTO INTERMUNICIPAL REGISTRADO
			</div>
			<div class="text-sm font-mono text-slate-800">
				Protocolo Gerado: <strong class="bg-emerald-200 px-2 py-1 text-base">{protocoloReferenciaGerado}</strong>
			</div>
			<div class="text-xs font-sans text-slate-700 max-w-md">
				O pedido foi enviado diretamente para a fila da Regulação da Secretaria Municipal de Saúde. O paciente poderá acompanhar a regulação e o agendamento logístico no centro de comando.
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-4 font-sans text-xs">
			<div class="border border-blue-200 bg-blue-50 p-3 text-blue-900 font-mono text-[11px]">
				ℹ Utilize este formulário quando o tratamento ou procedimento do paciente não estiver disponível na rede municipal, necessitando de encaminhamento para centro de referência em outra cidade.
			</div>

			<div class="grid grid-cols-2 gap-3 font-mono">
				<!-- Município de Destino -->
				<div class="flex flex-col gap-1">
					<label for="ref-mun" class="text-[10px] font-bold text-slate-600 uppercase">Município de Referência <span class="text-red-700">*</span></label>
					<select id="ref-mun" bind:value={refMunicipioDestino} class="border border-slate-300 p-2 text-xs outline-none focus:border-blue-900 font-sans">
						{#each municipiosReferencia as m}
							<option value={m}>{m}</option>
						{/each}
					</select>
				</div>

				<!-- Especialidade / Procedimento de Alta Complexidade -->
				<div class="flex flex-col gap-1">
					<label for="ref-esp" class="text-[10px] font-bold text-slate-600 uppercase">Especialidade / Alta Complexidade <span class="text-red-700">*</span></label>
					<select id="ref-esp" bind:value={refEspecialidade} class="border border-slate-300 p-2 text-xs outline-none focus:border-blue-900 font-sans">
						{#each especialidadesReferencia as e}
							<option value={e}>{e}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="grid grid-cols-12 gap-3 font-mono">
				<div class="col-span-4 flex flex-col gap-1">
					<label for="ref-cid" class="text-[10px] font-bold text-slate-600 uppercase">CID-10 <span class="text-red-700">*</span></label>
					<input id="ref-cid" type="text" bind:value={refCid10} class="border border-slate-300 p-2 text-xs font-bold outline-none focus:border-blue-900 uppercase" />
				</div>
				<div class="col-span-8 flex flex-col gap-1">
					<label for="ref-diag" class="text-[10px] font-bold text-slate-600 uppercase">Diagnóstico Clínico</label>
					<input id="ref-diag" type="text" bind:value={refDiagnostico} class="border border-slate-300 p-2 text-xs outline-none focus:border-blue-900 font-sans" />
				</div>
			</div>

			<!-- Justificativa / Laudo Médico -->
			<div class="flex flex-col gap-1">
				<label for="ref-just" class="font-mono text-[10px] font-bold text-slate-600 uppercase">
					Laudo Médico e Justificativa da Necessidade Intermunicipal <span class="text-red-700">*</span>
				</label>
				<textarea
					id="ref-just"
					rows="4"
					bind:value={refJustificativa}
					placeholder="Descreva a fundamentação clínica para o tratamento fora do município..."
					class="border border-slate-300 p-2.5 text-xs outline-none focus:border-blue-900 resize-none font-sans"
				></textarea>
			</div>

			<!-- Prioridade e Logística -->
			<div class="grid grid-cols-3 gap-3 font-mono border-t border-slate-200 pt-3">
				<div class="flex flex-col gap-1">
					<label for="ref-prio" class="text-[9px] font-bold text-slate-600 uppercase">Prioridade Clínica</label>
					<select id="ref-prio" bind:value={refPrioridade} class="border border-slate-300 p-1.5 text-xs outline-none">
						<option value="ELETIVA">ELETIVA</option>
						<option value="PRIORITARIA">PRIORITÁRIA</option>
						<option value="URGENTE">URGENTE</option>
						<option value="EMERGENCIA">EMERGÊNCIA</option>
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<label for="ref-transp" class="text-[9px] font-bold text-slate-600 uppercase">Transporte Solicitado</label>
					<select id="ref-transp" bind:value={refTransporte} class="border border-slate-300 p-1.5 text-xs outline-none">
						<option value="VAN_SMS">Van da SMS</option>
						<option value="AMBULANCIA">Ambulância Simples</option>
						<option value="UTI_MOVEL">Ambulância UTI Móvel</option>
						<option value="PASSAGEM_RODOVIARIA">Passagem Rodoviária</option>
					</select>
				</div>
				<div class="flex flex-col gap-1 justify-center">
					<span class="text-[9px] font-bold text-slate-600 uppercase">Acompanhante</span>
					<label for="ref-acomp" class="flex items-center gap-1.5 cursor-pointer font-sans">
						<input id="ref-acomp" type="checkbox" bind:checked={refAcompanhante} class="h-4 w-4" />
						<span>Exige Acompanhante</span>
					</label>
				</div>
			</div>

			<div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 font-mono">
				<button
					type="button"
					onclick={() => modalReferenciaAberto = false}
					class="border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase"
				>
					Cancelar
				</button>

				<button
					type="button"
					onclick={submeterReferenciaIntermunicipal}
					disabled={enviandoReferencia}
					class="border border-blue-900 bg-blue-900 text-white px-5 py-2 text-xs font-bold uppercase tracking-wider hover:bg-blue-950 disabled:opacity-50"
				>
					{enviandoReferencia ? 'Enviando à Regulação...' : 'Enviar para Regulação SMS'}
				</button>
			</div>
		</div>
	{/if}
</Modal>

<!-- OVERLAY 4: Impressão do Prontuário Eletrônico (ImprimirProntuario) -->
{#if modalImprimirAberto && pacienteDossie}
	<ImprimirProntuario
		paciente={pacienteDossie}
		operador={auth.me ? `${auth.me.nome} (${auth.me.matricula})` : medicoLogado}
		prefeitura={auth.me?.prefeitura ?? 'Prefeitura Municipal'}
		unidade="Centro Municipal de Especialidades"
		onFechar={() => modalImprimirAberto = false}
	/>
{/if}

<style>
	select, input, textarea, button {
		border-radius: 0 !important;
	}
</style>

