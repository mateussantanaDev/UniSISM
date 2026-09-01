import type { PrioridadeClinica } from '$lib/api/types';

export type TipoCentro = 'CEM' | 'CEO';

export interface EscalaProfissionalCentro {
	id?: string;
	medicoId?: string;
	nome: string;
	registro: string; // CRM ou CRO
	centro: TipoCentro;
	especialidade: string;
	diasSemana: Array<'SEG' | 'TER' | 'QUA' | 'QUI' | 'SEX' | 'SAB' | string>;
	horarioInicio: string; // "08:00"
	horarioFim: string; // "12:00"
	duracaoMinutos: number; // Ex: 20 min (CEM) ou 30-40 min (CEO)
	vagasPorTurno: number;
	consultorio?: string;
	status?: 'ATIVA' | 'FERIAS' | 'LICENCA' | 'BLOQUEADA' | 'BLOQUEADA_PARCIAL';
}

export interface ResultadoAlocacaoAutomatica {
	data: string; // YYYY-MM-DD
	dataFormatada: string; // DD/MM/YYYY
	hora: string; // HH:MM
	medicoId?: string;
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

// Especialidades Oficiais SUS por Centro
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

// Escalas Padrão (Sem dados mockados — alimentadas 100% pelo banco de dados)
export const ESCALAS_PADRAO_CEM: EscalaProfissionalCentro[] = [];
export const ESCALAS_PADRAO_CEO: EscalaProfissionalCentro[] = [];

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

export function gerarSlotsTurno(inicio: string, fim: string, duracaoMinutos = 20): string[] {
	const slots: string[] = [];
	const [hIni = 8, mIni = 0] = inicio.split(':').map(Number);
	const [hFim = 12, mFim = 0] = fim.split(':').map(Number);

	let atual = hIni * 60 + mIni;
	const limite = hFim * 60 + mFim;

	while (atual + duracaoMinutos <= limite) {
		const h = Math.floor(atual / 60);
		const m = atual % 60;
		slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
		atual += duracaoMinutos;
	}

	return slots.length > 0 ? slots : [inicio];
}

export function formatarDataBr(iso: string): string {
	const [ano, mes, dia] = iso.split('-');
	return `${dia}/${mes}/${ano}`;
}

export function alocarVagaPorProfissionalEEscala(params: {
	centro: TipoCentro;
	medicoNome?: string;
	medicoId?: string;
	especialidade?: string;
	prioridade?: PrioridadeClinica;
	agendamentosExistentes?: AgendamentoOcupado[];
	escalasDisponiveis?: EscalaProfissionalCentro[];
	dataBase?: Date;
}): ResultadoAlocacaoAutomatica | null {
	const {
		centro,
		medicoNome,
		especialidade,
		prioridade = 'ELETIVA',
		agendamentosExistentes = [],
		escalasDisponiveis = [],
		dataBase = new Date()
	} = params;

	if (!medicoNome && !especialidade) {
		return null;
	}

	const escalasAtivas = escalasDisponiveis.filter(e => e.status === 'ATIVA' || !e.status);
	if (escalasAtivas.length === 0) {
		return null;
	}

	let escala: EscalaProfissionalCentro | undefined;
	if (medicoNome) {
		escala = escalasAtivas.find(e => e.nome.toLowerCase() === medicoNome.toLowerCase());
	}
	if (!escala && especialidade) {
		escala = escalasAtivas.find(e => e.especialidade.toLowerCase() === especialidade.toLowerCase());
	}
	if (!escala) {
		escala = escalasAtivas[0];
	}
	if (!escala) {
		return null;
	}

	const diasNumericos = Array.from(new Set(
		escala.diasSemana.map(d => DIA_SEMANA_MAP[d.trim().toUpperCase()]).filter(n => typeof n === 'number')
	));

	const slotsBase = gerarSlotsTurno(escala.horarioInicio, escala.horarioFim, escala.duracaoMinutos);
	const ehCeo = centro === 'CEO';

	let offsetDias = 15;
	let prazoTexto = 'Demanda Eletiva Regular (15 a 30 dias)';
	let justificativaTexto = `Portaria SUS: Atendimento programado. Escala regular de ${escala.nome}.`;

	if (prioridade === 'EMERGENCIA') {
		offsetDias = 0;
		prazoTexto = 'Atendimento Imediato (Mesmo Dia / 24h)';
		justificativaTexto = `Portaria SUS: Demanda de emergência com risco iminente de agravo. Alocado no primeiro horário imediato da escala de ${escala.nome}.`;
	} else if (prioridade === 'URGENTE') {
		offsetDias = 1;
		prazoTexto = 'Demanda Urgente (Até 72 horas)';
		justificativaTexto = `Portaria SUS: Condição clínica aguda com risco de evolução desfavorável. Priorizado nos primeiros dias da escala de ${escala.nome}.`;
	} else if (prioridade === 'PRIORITARIA') {
		offsetDias = 7;
		prazoTexto = 'Prioridade Legal SUS (7 a 10 dias)';
		justificativaTexto = `Portaria SUS: Lei nº 10.048/2000 (Idosos 60+, PCD, Gestantes, TEA). Encaixe prioritário na escala de ${escala.nome}.`;
	}

	let dataCursor = new Date(dataBase);
	dataCursor.setDate(dataCursor.getDate() + offsetDias);

	const ocupadosSet = new Set(
		agendamentosExistentes.map(a => `${a.data}_${a.hora}`)
	);

	let dataIsoFinal = '';
	let horaFinal = '';

	let maxTentativas = 60;
	while (maxTentativas > 0) {
		const diaSemanaCursor = dataCursor.getDay();
		if (diasNumericos.includes(diaSemanaCursor)) {
			const ano = dataCursor.getFullYear();
			const mes = String(dataCursor.getMonth() + 1).padStart(2, '0');
			const dia = String(dataCursor.getDate()).padStart(2, '0');
			const dataStr = `${ano}-${mes}-${dia}`;

			for (const slot of slotsBase) {
				const chave = `${dataStr}_${slot}`;
				if (!ocupadosSet.has(chave)) {
					dataIsoFinal = dataStr;
					horaFinal = slot;
					break;
				}
			}

			if (!horaFinal && prioridade === 'EMERGENCIA') {
				dataIsoFinal = dataStr;
				horaFinal = slotsBase[0] || escala.horarioInicio;
				justificativaTexto += ' [Encaixe de Emergência Autorizado]';
				break;
			}

			if (dataIsoFinal && horaFinal) {
				break;
			}
		}

		dataCursor.setDate(dataCursor.getDate() + 1);
		maxTentativas--;
	}

	if (!dataIsoFinal || !horaFinal) {
		const ano = dataCursor.getFullYear();
		const mes = String(dataCursor.getMonth() + 1).padStart(2, '0');
		const dia = String(dataCursor.getDate()).padStart(2, '0');
		dataIsoFinal = `${ano}-${mes}-${dia}`;
		horaFinal = escala.horarioInicio;
	}

	const consultorioFinal = escala.consultorio || (ehCeo ? `CADEIRA ODONTOLÓGICA 01 — ${escala.especialidade.toUpperCase()}` : `CONSULTÓRIO 01 — ${escala.especialidade.toUpperCase()}`);

	return {
		data: dataIsoFinal,
		dataFormatada: formatarDataBr(dataIsoFinal),
		hora: horaFinal,
		medicoId: escala.medicoId,
		medicoNome: escala.nome,
		registro: escala.registro,
		especialidade: escala.especialidade,
		centro,
		centroNome: ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro Municipal de Especialidades Médicas (CEM)',
		consultorio: consultorioFinal,
		prioridade,
		diasAteAtendimento: offsetDias,
		prazoLegalSus: prazoTexto,
		justificativaEscala: `${justificativaTexto} Profissional: ${escala.nome} (${escala.registro}), escala em ${escala.diasSemana.join(', ')} das ${escala.horarioInicio} às ${escala.horarioFim}. Vaga alocada no ${consultorioFinal}.`
	};
}
