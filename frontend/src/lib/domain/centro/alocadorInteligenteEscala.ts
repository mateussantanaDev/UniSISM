import type { PrioridadeClinica } from '$lib/api/types';

export type TipoCentro = 'CEM' | 'CEO';

export interface EscalaProfissionalCentro {
	id: string;
	nome: string;
	registro: string; // CRM ou CRO
	centro: TipoCentro;
	especialidade: string;
	diasSemana: Array<'SEG' | 'TER' | 'QUA' | 'QUI' | 'SEX' | 'SAB'>;
	horarioInicio: string; // "08:00"
	horarioFim: string; // "12:00"
	duracaoMinutos: number; // Ex: 20 min (CEM) ou 30-40 min (CEO)
	vagasPorTurno: number;
	consultorio: string; // "Consultório 03" ou "Cadeira 02"
	status: 'ATIVA' | 'FERIAS' | 'BLOQUEADA_PARCIAL';
}

export interface ResultadoAlocacaoAutomatica {
	data: string; // YYYY-MM-DD
	dataFormatada: string; // DD/MM/YYYY
	hora: string; // HH:MM
	medicoNome: string;
	registro: string;
	especialidade: string;
	centro: TipoCentro;
	centroNome: string;
	consultorio: string;
	prioridade: PrioridadeClinica;
	diasAteAtendimento: number;
	prazoLegalSus: string;
	justificativaEscala: string;
}

export interface AgendamentoOcupado {
	data: string; // YYYY-MM-DD
	hora: string; // HH:MM
	medicoNome?: string;
	centro?: TipoCentro;
}

// Especialidades Oficiais por Centro
export const ESPECIALIDADES_CEM = [
	'Cardiologia',
	'Oftalmologia',
	'Dermatologia',
	'Ortopedia',
	'Neurologia',
	'Ginecologia e Obstetrícia',
	'Psiquiatria',
	'Endocrinologia',
	'Otorrinolaringologia',
	'Urologia',
	'Pediatria Especializada',
	'Pneumologia',
	'Gastroenterologia',
	'Angiologia / Cirurgia Vascular',
	'Reumatologia'
] as const;

export const ESPECIALIDADES_CEO = [
	'Endodontia',
	'Periodontia',
	'Cirurgia Bucomaxilofacial',
	'Odontopediatria',
	'Pacientes com Necessidades Especiais (PNE)',
	'Prótese Dentária',
	'Estomatologia',
	'Ortodontia Preventiva'
] as const;

// Escalas Padrão Iniciais do CEM (Médicos Especialistas)
export const ESCALAS_PADRAO_CEM: EscalaProfissionalCentro[] = [
	{
		id: 'esc-cem-01',
		nome: 'Dr. Roberto Medeiros',
		registro: 'CRM 14920',
		centro: 'CEM',
		especialidade: 'Cardiologia',
		diasSemana: ['TER', 'QUI'],
		horarioInicio: '08:00',
		horarioFim: '12:00',
		duracaoMinutos: 20,
		vagasPorTurno: 12,
		consultorio: 'CONSULTÓRIO 01 — ALA A',
		status: 'ATIVA'
	},
	{
		id: 'esc-cem-02',
		nome: 'Dra. Beatriz Albuquerque',
		registro: 'CRM 18340',
		centro: 'CEM',
		especialidade: 'Oftalmologia',
		diasSemana: ['SEG', 'QUA', 'SEX'],
		horarioInicio: '08:00',
		horarioFim: '12:00',
		duracaoMinutos: 20,
		vagasPorTurno: 12,
		consultorio: 'CONSULTÓRIO 02 — OFTALMOLOGIA',
		status: 'ATIVA'
	},
	{
		id: 'esc-cem-03',
		nome: 'Dr. Lucas Silveira',
		registro: 'CRM 19042',
		centro: 'CEM',
		especialidade: 'Ortopedia',
		diasSemana: ['SEG', 'TER', 'QUI'],
		horarioInicio: '13:00',
		horarioFim: '17:00',
		duracaoMinutos: 20,
		vagasPorTurno: 12,
		consultorio: 'CONSULTÓRIO 03 — TRAUMATO-ORTOPEDIA',
		status: 'ATIVA'
	},
	{
		id: 'esc-cem-04',
		nome: 'Dra. Mariana Fontes',
		registro: 'CRM 22105',
		centro: 'CEM',
		especialidade: 'Dermatologia',
		diasSemana: ['QUA', 'SEX'],
		horarioInicio: '08:00',
		horarioFim: '12:00',
		duracaoMinutos: 20,
		vagasPorTurno: 12,
		consultorio: 'CONSULTÓRIO 04 — DERMATOLOGIA',
		status: 'ATIVA'
	},
	{
		id: 'esc-cem-05',
		nome: 'Dr. Fernando Vasconcellos',
		registro: 'CRM 15780',
		centro: 'CEM',
		especialidade: 'Neurologia',
		diasSemana: ['SEG', 'QUI'],
		horarioInicio: '08:00',
		horarioFim: '12:00',
		duracaoMinutos: 25,
		vagasPorTurno: 10,
		consultorio: 'CONSULTÓRIO 05 — NEUROLOGIA',
		status: 'ATIVA'
	},
	{
		id: 'esc-cem-06',
		nome: 'Dra. Juliana Prado',
		registro: 'CRM 20880',
		centro: 'CEM',
		especialidade: 'Ginecologia e Obstetrícia',
		diasSemana: ['TER', 'QUA', 'SEX'],
		horarioInicio: '13:30',
		horarioFim: '17:30',
		duracaoMinutos: 20,
		vagasPorTurno: 12,
		consultorio: 'CONSULTÓRIO 06 — SAÚDE DA MULHER',
		status: 'ATIVA'
	},
	{
		id: 'esc-cem-07',
		nome: 'Dr. Henrique Novaes',
		registro: 'CRM 16400',
		centro: 'CEM',
		especialidade: 'Psiquiatria',
		diasSemana: ['SEG', 'TER', 'QUA', 'QUI', 'SEX'],
		horarioInicio: '08:00',
		horarioFim: '12:00',
		duracaoMinutos: 30,
		vagasPorTurno: 8,
		consultorio: 'CONSULTÓRIO 07 — SAÚDE MENTAL',
		status: 'ATIVA'
	},
	{
		id: 'esc-cem-08',
		nome: 'Dra. Claudia Meirelles',
		registro: 'CRM 21390',
		centro: 'CEM',
		especialidade: 'Endocrinologia',
		diasSemana: ['TER', 'QUI'],
		horarioInicio: '13:00',
		horarioFim: '17:00',
		duracaoMinutos: 20,
		vagasPorTurno: 12,
		consultorio: 'CONSULTÓRIO 08 — METABOLISMO',
		status: 'ATIVA'
	}
];

// Escalas Padrão Iniciais do CEO (Dentistas Especialistas por Cadeiras)
export const ESCALAS_PADRAO_CEO: EscalaProfissionalCentro[] = [
	{
		id: 'esc-ceo-01',
		nome: 'Dr. André Guimarães',
		registro: 'CRO 7410',
		centro: 'CEO',
		especialidade: 'Endodontia',
		diasSemana: ['SEG', 'TER', 'QUA'],
		horarioInicio: '07:30',
		horarioFim: '12:00',
		duracaoMinutos: 35,
		vagasPorTurno: 8,
		consultorio: 'CADEIRA ODONTOLÓGICA 01 — ENDODONTIA',
		status: 'ATIVA'
	},
	{
		id: 'esc-ceo-02',
		nome: 'Dra. Camila Vasconcelos',
		registro: 'CRO 8421',
		centro: 'CEO',
		especialidade: 'Cirurgia Bucomaxilofacial',
		diasSemana: ['TER', 'QUI', 'SEX'],
		horarioInicio: '08:00',
		horarioFim: '12:30',
		duracaoMinutos: 40,
		vagasPorTurno: 7,
		consultorio: 'CADEIRA ODONTOLÓGICA 02 — CIRURGIA',
		status: 'ATIVA'
	},
	{
		id: 'esc-ceo-03',
		nome: 'Dr. Rodrigo Barreto',
		registro: 'CRO 9155',
		centro: 'CEO',
		especialidade: 'Periodontia',
		diasSemana: ['SEG', 'QUA', 'SEX'],
		horarioInicio: '13:00',
		horarioFim: '17:00',
		duracaoMinutos: 30,
		vagasPorTurno: 8,
		consultorio: 'CADEIRA ODONTOLÓGICA 03 — PERIODONTIA',
		status: 'ATIVA'
	},
	{
		id: 'esc-ceo-04',
		nome: 'Dra. Larissa Tavares',
		registro: 'CRO 10240',
		centro: 'CEO',
		especialidade: 'Odontopediatria',
		diasSemana: ['TER', 'QUA', 'QUI'],
		horarioInicio: '08:00',
		horarioFim: '12:00',
		duracaoMinutos: 30,
		vagasPorTurno: 8,
		consultorio: 'CADEIRA ODONTOLÓGICA 04 — ODONTOPEDIATRIA',
		status: 'ATIVA'
	},
	{
		id: 'esc-ceo-05',
		nome: 'Dr. Marcelo Fagundes',
		registro: 'CRO 6780',
		centro: 'CEO',
		especialidade: 'Pacientes com Necessidades Especiais (PNE)',
		diasSemana: ['SEG', 'QUI'],
		horarioInicio: '08:00',
		horarioFim: '12:00',
		duracaoMinutos: 45,
		vagasPorTurno: 5,
		consultorio: 'CADEIRA ODONTOLÓGICA 05 — ATENDIMENTO PNE',
		status: 'ATIVA'
	},
	{
		id: 'esc-ceo-06',
		nome: 'Dra. Patricia Mendonça',
		registro: 'CRO 8930',
		centro: 'CEO',
		especialidade: 'Prótese Dentária',
		diasSemana: ['SEG', 'TER', 'SEX'],
		horarioInicio: '13:00',
		horarioFim: '17:00',
		duracaoMinutos: 30,
		vagasPorTurno: 8,
		consultorio: 'CADEIRA ODONTOLÓGICA 06 — PRÓTESE',
		status: 'ATIVA'
	}
];

const MAPA_DIAS_JS: Record<number, 'DOM' | 'SEG' | 'TER' | 'QUA' | 'QUI' | 'SEX' | 'SAB'> = {
	0: 'DOM',
	1: 'SEG',
	2: 'TER',
	3: 'QUA',
	4: 'QUI',
	5: 'SEX',
	6: 'SAB'
};

/**
 * Gera slots de horários de um turno com base no início, fim e duração
 */
export function gerarSlotsTurno(horarioInicio: string, horarioFim: string, duracaoMinutos: number): string[] {
	const slots: string[] = [];
	const [hIni, mIni] = horarioInicio.split(':').map(Number);
	const [hFim, mFim] = horarioFim.split(':').map(Number);

	let totalMinutos = hIni * 60 + mIni;
	const totalMinutosFim = hFim * 60 + mFim;

	while (totalMinutos + duracaoMinutos <= totalMinutosFim) {
		const h = Math.floor(totalMinutos / 60);
		const m = totalMinutos % 60;
		slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
		totalMinutos += duracaoMinutos;
	}

	return slots.length > 0 ? slots : [horarioInicio];
}

/**
 * ALGORITMO DETERMINÍSTICO DE ALOCAÇÃO AUTOMÁTICA DE VAGAS POR MÉDICO / DENTISTA ESPECÍFICO E CENTRO
 * 
 * 1. Identifica a escala real do profissional selecionado no respectivo centro (CEM ou CEO).
 * 2. Determina a janela de dias permitida conforme a gravidade e prioridade SUS.
 * 3. Varre a agenda do médico dia a dia verificando se ele atende naquele dia da semana.
 * 4. Para cada dia de atendimento, varre os slots de horários verificando ocupação.
 * 5. Aloca o paciente no primeiro slot livre e compatível com as diretrizes do SUS.
 */
export function alocarVagaPorProfissionalEEscala(params: {
	centro: TipoCentro;
	medicoNome?: string;
	especialidade?: string;
	prioridade: PrioridadeClinica;
	agendamentosExistentes?: AgendamentoOcupado[];
	escalasCustomizadas?: EscalaProfissionalCentro[];
	dataBase?: Date;
}): ResultadoAlocacaoAutomatica {
	const {
		centro,
		medicoNome,
		especialidade,
		prioridade,
		agendamentosExistentes = [],
		escalasCustomizadas,
		dataBase = new Date()
	} = params;

	const escalasAtivas = (escalasCustomizadas && escalasCustomizadas.length > 0)
		? escalasCustomizadas
		: (centro === 'CEO' ? ESCALAS_PADRAO_CEO : ESCALAS_PADRAO_CEM);

	// 1. Encontra a escala do médico selecionado ou o melhor especialista do Centro
	let escala: EscalaProfissionalCentro | undefined;

	if (medicoNome) {
		escala = escalasAtivas.find(e => e.nome.toLowerCase() === medicoNome.toLowerCase() && e.status === 'ATIVA');
	}

	if (!escala && especialidade) {
		escala = escalasAtivas.find(
			e => e.especialidade.toLowerCase() === especialidade.toLowerCase() && e.status === 'ATIVA'
		);
	}

	if (!escala) {
		escala = escalasAtivas[0];
	}

	const centroNomeCompleto = centro === 'CEO'
		? 'Centro Municipal de Especialidades Odontológicas (CEO)'
		: 'Centro Municipal de Especialidades Médicas (CEM)';

	// 2. Determina a janela de dias por prioridade clínica SUS
	let diasOffsetInicial = 0;
	let prazoLegalSus = 'Até 30 dias corridos';
	let fundamentacao = 'Portaria SUS: Demanda clínica eletiva com fila regular';

	switch (prioridade) {
		case 'EMERGENCIA':
			diasOffsetInicial = 0; // Mesmo dia ou primeiro dia de escala útil
			prazoLegalSus = 'Atendimento Imediato (Até 24 horas)';
			fundamentacao = `Portaria SUS: Demanda de emergência com risco iminente de agravo. Alocado no primeiro horário livre da escala de ${escala.nome}.`;
			break;
		case 'URGENTE':
			diasOffsetInicial = 1; // 1 a 3 dias úteis
			prazoLegalSus = 'Até 72 horas úteis';
			fundamentacao = `Portaria SUS: Demanda com gravidade moderada/alta. Alocado na primeira janela da escala de ${escala.nome}.`;
			break;
		case 'PRIORITARIA':
			diasOffsetInicial = 7; // 7 a 10 dias
			prazoLegalSus = 'Até 7 a 10 dias';
			fundamentacao = `Portaria SUS: Prioridade legal (Idosos, Gestantes, PNE ou Suspeita Oncológica). Escala de ${escala.nome}.`;
			break;
		case 'ELETIVA':
		default:
			diasOffsetInicial = 14; // 14 a 30 dias
			prazoLegalSus = '15 a 30 dias úteis';
			fundamentacao = `Portaria SUS: Atendimento ambulatorial programado. Escala regular de ${escala.nome}.`;
			break;
	}

	// 3. Varredura da agenda do profissional: busca pelo dia em que ele atende e tem vaga livre
	const dataCursor = new Date(dataBase);
	dataCursor.setDate(dataCursor.getDate() + diasOffsetInicial);

	const maxDiasBusca = 60; // Limite de 60 dias para busca de vaga
	let diaEncontrado: string | null = null;
	let horaEncontrada: string | null = null;

	const slotsDoTurno = gerarSlotsTurno(escala.horarioInicio, escala.horarioFim, escala.duracaoMinutos);

	for (let diaOffset = 0; diaOffset < maxDiasBusca; diaOffset++) {
		const diaSemanaNum = dataCursor.getDay();
		const diaSemanaSigla = MAPA_DIAS_JS[diaSemanaNum];

		// Se o profissional atende neste dia da semana (e não é domingo ou sábado fora de escala)
		if (diaSemanaSigla && escala.diasSemana.includes(diaSemanaSigla as any)) {
			const dataIso = dataCursor.toISOString().substring(0, 10);

			// Agendamentos já marcados para este médico nesta data
			const ocupadosNoDia = agendamentosExistentes.filter(
				ag => ag.data === dataIso && (!ag.medicoNome || ag.medicoNome.toLowerCase() === escala!.nome.toLowerCase())
			);

			const horasOcupadas = new Set(ocupadosNoDia.map(ag => ag.hora));

			// Busca o primeiro slot livre do turno do médico
			for (const slot of slotsDoTurno) {
				if (!horasOcupadas.has(slot)) {
					diaEncontrado = dataIso;
					horaEncontrada = slot;
					break;
				}
			}

			if (diaEncontrado && horaEncontrada) {
				break;
			}
		}

		dataCursor.setDate(dataCursor.getDate() + 1);
	}

	// Fallback de segurança se toda a grade de 60 dias estiver lotada
	if (!diaEncontrado || !horaEncontrada) {
		const fallbackDate = new Date(dataBase);
		fallbackDate.setDate(fallbackDate.getDate() + diasOffsetInicial + 1);
		diaEncontrado = fallbackDate.toISOString().substring(0, 10);
		horaEncontrada = escala.horarioInicio;
	}

	const [ano, mes, dia] = diaEncontrado.split('-');
	const dataFormatada = `${dia}/${mes}/${ano}`;

	const diffTime = Math.abs(new Date(diaEncontrado + 'T12:00:00').getTime() - new Date(dataBase).getTime());
	const diasAteAtendimento = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	const diasAtendimentoStr = escala.diasSemana.join(', ');
	const justificativaCompleta = `${fundamentacao} Profissional: ${escala.nome} (${escala.registro}), escala em ${diasAtendimentoStr} das ${escala.horarioInicio} às ${escala.horarioFim}. Vaga alocada no ${escala.consultorio}.`;

	return {
		data: diaEncontrado,
		dataFormatada,
		hora: horaEncontrada,
		medicoNome: escala.nome,
		registro: escala.registro,
		especialidade: escala.especialidade,
		centro,
		centroNome: centroNomeCompleto,
		consultorio: escala.consultorio,
		prioridade,
		diasAteAtendimento,
		prazoLegalSus,
		justificativaEscala: justificativaCompleta
	};
}
