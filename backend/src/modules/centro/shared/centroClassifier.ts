/**
 * Classificador semântico e regulatório de Especialidades e Procedimentos dos Centros (CEM vs CEO).
 */

export const ESPECIALIDADES_ODONTO: readonly string[] = [
  // Especialidades e áreas da Odontologia
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
  // Procedimentos e termos odontológicos comuns
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
  'maxil',
];

export interface ItemClassificavelCentro {
  nome?: string;
  especialidade?: string;
  medicoNome?: string;
  profissionalAgendado?: string;
  localAgendamento?: string;
  canalRoteamento?: string | null;
  destinoRegulacao?: string | null;
  filaDestino?: string | null;
  solicitacao?: {
    especialidadeSolicitada?: string;
    crm?: string;
    medicoSolicitante?: string;
  };
  documentosObrigatorios?: string[];
  crm?: string;
}

/**
 * Determina com precisão se uma especialidade, procedimento, agendamento ou escala pertence ao CEO (Odontologia)
 * ou ao CEM (Médico).
 *
 * 1. Tag explícita ('CENTRO:CEO' ou 'CENTRO:CEM' nos documentosObrigatorios) tem precedência absoluta.
 * 2. canalRoteamento / destinoRegulacao / filaDestino explícitos.
 * 3. Registro profissional no conselho (CRO = Odonto, CRM = Médico).
 * 4. Local de agendamento (Cadeira Odontológica, CEO).
 * 5. Classificação semântica inteligente por palavras-chave com normalização.
 */
export function isEspecialidadeOdonto(
  item: ItemClassificavelCentro | string,
): boolean {
  if (typeof item === 'string') {
    const nomeLower = item.toLowerCase().trim();
    if (/\bcro\b/i.test(nomeLower) || nomeLower.startsWith('cro')) return true;
    if (/\bcrm\b/i.test(nomeLower) || nomeLower.startsWith('crm')) return false;
    if (nomeLower.includes('cadeira') || nomeLower.includes('ceo')) return true;
    return ESPECIALIDADES_ODONTO.some((o) => (o === 'pne' ? /\bpne\b/i.test(nomeLower) : nomeLower.includes(o)));
  }

  // 1. Tag explícita em documentosObrigatorios
  const docs = item.documentosObrigatorios || [];
  if (docs.includes('CENTRO:CEO')) return true;
  if (docs.includes('CENTRO:CEM')) return false;

  // 2. Flags explícitas de canal e rota
  if (
    item.canalRoteamento === 'CENTRO_ODONTOLOGICO' ||
    item.destinoRegulacao === 'CENTRO_ODONTOLOGICO' ||
    item.filaDestino === 'CEO'
  ) {
    return true;
  }

  // 3. Registro de conselho profissional
  const crmUpper = (item.crm || item.solicitacao?.crm || '').toUpperCase();
  if (crmUpper.includes('CRO')) return true;

  // 4. Local de agendamento
  const localUpper = (item.localAgendamento || '').toUpperCase();
  if (localUpper.includes('CADEIRA') || localUpper.includes('CEO') || localUpper.includes('ODONTO')) {
    return true;
  }

  // 5. Checagem semântica de nome / especialidade / médico
  const texto = [
    item.nome || '',
    item.especialidade || '',
    item.solicitacao?.especialidadeSolicitada || '',
    item.medicoNome || '',
    item.profissionalAgendado || '',
  ].join(' ').toLowerCase().trim();

  if (/\bcro\b/i.test(texto)) return true;

  return ESPECIALIDADES_ODONTO.some((o) => (o === 'pne' ? /\bpne\b/i.test(texto) : texto.includes(o)));
}

/**
 * Filtra uma lista de especialidades, procedimentos ou escalas para o Centro ativo (CEO ou CEM).
 */
export function filterEspecialidadesByCentro<T extends ItemClassificavelCentro>(
  lista: T[],
  centro?: string,
): T[] {
  if (!centro) return lista;
  const centroNorm = centro.toUpperCase();
  const ehCeo = centroNorm === 'CEO' || centroNorm === 'CENTRO_ODONTOLOGICO';

  return lista.filter((item) => {
    const eOdonto = isEspecialidadeOdonto(item);
    return ehCeo ? eOdonto : !eOdonto;
  });
}

