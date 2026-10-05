import type { PrioridadeClinica } from '$lib/api/types';

export type TipoCentro = 'CEM' | 'CEO';

export interface EscalaProfissionalCentro {
	id?: string;
	medicoId?: string;
	nome: string;
	registro: string; // CRM ou CRO
	centro: TipoCentro;
	especialidade: string;
	diasSemana: Array<'SEG' | 'TER' | 'QUA' | 'QUI' | 'SEX' | 'SAB' | 'DOM' | string>;
	horarioInicio: string; // "08:00"
	horarioFim: string; // "12:00"
	duracaoMinutos: number; // Ex: 20 min (CEM) ou 30-40 min (CEO)
	vagasPorTurno: number;
	consultorio?: string;
	status?: 'ATIVA' | 'FERIAS' | 'LICENCA' | 'BLOQUEADA' | 'BLOQUEADA_PARCIAL';
	tipoRecorrencia?: 'SEMANAL' | 'QUINZENAL' | 'DATAS_ESPECIFICAS' | 'MUTIRAO';
	datasEspecificas?: string[];
	isMutirao?: boolean;
	intervaloDias?: number;
	dataInicioRecorrencia?: string;
	ausenciaInicio?: string | null;
	ausenciaFim?: string | null;
	tipoServico?: 'CONSULTA' | 'PROCEDIMENTO';
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

export function gerarSlotsTurno(inicio: string, fim: string, duracaoMinutos = 20, capacidade = Number.MAX_SAFE_INTEGER): string[] {
	const slots: string[] = [];
	if (!Number.isInteger(duracaoMinutos) || duracaoMinutos <= 0 || !Number.isInteger(capacidade) || capacidade <= 0) return [];
	const [hIni = 8, mIni = 0] = inicio.split(':').map(Number);
	const [hFim = 12, mFim = 0] = fim.split(':').map(Number);

	let atual = hIni * 60 + mIni;
	const limite = hFim * 60 + mFim;

	while (atual + duracaoMinutos <= limite && slots.length < capacidade) {
		const h = Math.floor(atual / 60);
		const m = atual % 60;
		slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
		atual += duracaoMinutos;
	}

	return slots;
}

export function formatarDataBr(iso: string): string {
	const [ano, mes, dia] = iso.split('-');
	return `${dia}/${mes}/${ano}`;
}

export function escalaAtendeNaData(escala: EscalaProfissionalCentro, data: Date): boolean {
	const iso = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Recife'}).format(data);
	if (escala.status && escala.status !== 'ATIVA' && (!escala.ausenciaInicio || !escala.ausenciaFim || iso >= escala.ausenciaInicio && iso <= escala.ausenciaFim)) return false;
	if (escala.tipoRecorrencia === 'DATAS_ESPECIFICAS' || escala.tipoRecorrencia === 'MUTIRAO' && escala.datasEspecificas?.length) return escala.datasEspecificas?.includes(iso) ?? false;
	const diaSemana = new Date(iso+'T12:00:00Z').getUTCDay();
	if (!escala.diasSemana.some(d => DIA_SEMANA_MAP[d.trim().toUpperCase()] === diaSemana)) return false;
	if (escala.tipoRecorrencia === 'QUINZENAL') {
		if (!escala.dataInicioRecorrencia) return false;
		const dias = Math.round((Date.parse(iso+'T12:00:00Z') - Date.parse(escala.dataInicioRecorrencia+'T12:00:00Z')) / 86400000);
		return dias >= 0 && Math.floor(dias / 7) % 2 === 0;
	}
	return true;
}

export function alocarVagaPorProfissionalEEscala(params: {
	centro: TipoCentro; medicoNome?: string; medicoId?: string; especialidade?: string;
	tipoServico?: 'CONSULTA' | 'PROCEDIMENTO'; prioridade?: PrioridadeClinica;
	agendamentosExistentes?: AgendamentoOcupado[]; escalasDisponiveis?: EscalaProfissionalCentro[]; dataBase?: Date;
}): ResultadoAlocacaoAutomatica | null {
	const { centro, medicoNome, medicoId, especialidade, tipoServico = 'CONSULTA', prioridade = 'ELETIVA', agendamentosExistentes = [], escalasDisponiveis = [], dataBase = new Date() } = params;
	if (!medicoNome && !medicoId && !especialidade) return null;
	const candidatas = escalasDisponiveis.filter(e => e.centro === centro && (!medicoId || e.medicoId === medicoId) && (medicoId || !medicoNome || e.nome.toLowerCase() === medicoNome.toLowerCase()) && (!especialidade || e.especialidade.toLowerCase() === especialidade.toLowerCase()) && (e.tipoServico || 'CONSULTA') === tipoServico);
	const base = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Recife'}).format(new Date(Math.max(dataBase.getTime(), Date.now())));
	for (let n=0; n<60; n++) {
		const cursor = new Date(base+'T12:00:00Z'); cursor.setUTCDate(cursor.getUTCDate()+n); const dia = cursor.toISOString().slice(0,10);
		const vagas = candidatas.filter(e => escalaAtendeNaData(e,cursor)).flatMap(e => gerarSlotsTurno(e.horarioInicio,e.horarioFim,e.duracaoMinutos,e.vagasPorTurno).map(hora => ({e,hora}))).sort((a,b)=>a.hora.localeCompare(b.hora));
		for (const {e,hora} of vagas) {
			if (Date.parse(dia+'T'+hora+':00-03:00') <= Date.now()) continue;
			const min = (h:string) => { const [hh,mm]=h.split(':').map(Number); return hh*60+mm; };
			if (agendamentosExistentes.some(a => a.data===dia && (!a.medicoNome || a.medicoNome===e.nome) && min(hora)<min(a.hora)+e.duracaoMinutos && min(hora)+e.duracaoMinutos>min(a.hora))) continue;
			return {data:dia,dataFormatada:formatarDataBr(dia),hora,medicoId:e.medicoId,medicoNome:e.nome,registro:e.registro,especialidade:e.especialidade,centro,centroNome:centro==='CEO'?'Centro de Especialidades Odontológicas (CEO)':'Centro de Especialidades Médicas (CEM)',consultorio:e.consultorio||'Sala a definir',prioridade,diasAteAtendimento:n,prazoLegalSus:'Primeira vaga disponível na escala',justificativaEscala:`Horário disponível de ${e.nome}. A reserva é confirmada pelo servidor ao salvar.`};
		}
	}
	return null;
}

export const TERMOS_ODONTO: readonly string[] = [
	'endodontia',
	'endo',
	'periodontia',
	'perio',
	'cirurgia bucomaxilofacial',
	'bucomaxilofacial',
	'bucomaxilo',
	'odontopediatria',
	'pacientes com necessidades especiais',
	'pne',
	'prótese dentária',
	'protese dentaria',
	'prótese',
	'protese',
	'estomatologia',
	'ortodontia',
	'odontologia',
	'saúde bucal',
	'saude bucal',
	'dentística',
	'dentistica',
	'cirurgia oral',
	'implante',
	'implantodontia',
	'radiologia odontológica',
	'traumatologia bucomaxilofacial',
	'ceo',
	'exodontia',
	'siso',
	'dente',
	'dentári',
	'dentari',
	'dentist',
	'restauração',
	'restauracao',
	'obturação',
	'obturacao',
	'canal',
	'raspagem',
	'profilaxia',
	'tartarectomia',
	'tártaro',
	'tartaro',
	'flúor',
	'fluor',
	'selante',
	'frenectomia',
	'frenotomia',
	'gengivoplastia',
	'gengivectomia',
	'cárie',
	'carie',
	'pulpotomia',
	'pulpectomia',
	'coroa',
	'apicectomia',
	'enxerto',
	'clareamento',
	'bucal',
	'boca',
	'alveoloplastia',
	'alveolo',
	'amálgama',
	'amalgama',
	'resina',
	'faceta',
	'odont',
	'cisto',
	'periapi',
	'periodo',
	'buco',
	'maxil'
];

export function isEspecialidadeOdonto(item: any): boolean {
	if (!item) return false;
	if (typeof item === 'string') {
		const str = item.toLowerCase().trim();
		if (/\bcro\b/i.test(str) || str.startsWith('cro')) return true;
		if (/\bcrm\b/i.test(str) || str.startsWith('crm')) return false;
		if (str.includes('cadeira') || str.includes('ceo')) return true;
		return TERMOS_ODONTO.some((t) => (t === 'pne' ? /\bpne\b/i.test(str) : str.includes(t)));
	}

	// 1. Rota/Canal explícitos
	const canal = (
		item.canalRoteamento ||
		item.destinoRegulacao ||
		item.filaDestino ||
		''
	).toUpperCase();
	if (canal === 'CEO' || canal === 'CENTRO_ODONTOLOGICO') return true;

	// 2. Registro no Conselho Profissional (CRO vs CRM)
	const registro = (item.registro || item.crm || item.solicitacao?.crm || '').toUpperCase();
	if (registro.includes('CRO')) return true;

	// 3. Local físico
	const local = (item.localAgendamento || item.consultorio || '').toUpperCase();
	if (local.includes('CADEIRA') || local.includes('CEO') || local.includes('ODONTO')) return true;

	// 4. Semântica por Especialidade / Nome
	const texto = [
		item.especialidade || '',
		item.nome || '',
		item.medicoNome || '',
		item.profissionalAgendado || '',
		item.solicitacao?.especialidadeSolicitada || '',
		item.solicitacao?.medicoSolicitante || ''
	]
		.join(' ')
		.toLowerCase()
		.trim();

	if (/\bcro\b/i.test(texto)) return true;

	return TERMOS_ODONTO.some((t) => (t === 'pne' ? /\bpne\b/i.test(texto) : texto.includes(t)));
}

export function pertenceAoOrgaoCentro(item: any, centro: TipoCentro): boolean {
	const eOdonto = isEspecialidadeOdonto(item);
	return centro === 'CEO' ? eOdonto : !eOdonto;
}
