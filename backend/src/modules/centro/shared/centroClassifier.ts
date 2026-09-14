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
  documentosObrigatorios?: string[];
  crm?: string;
}

/**
 * Determina com precisão se uma especialidade, procedimento ou escala pertence ao CEO (Odontologia)
 * ou ao CEM (Médico).
 *
 * 1. Tag explícita ('CENTRO:CEO' ou 'CENTRO:CEM' nos documentosObrigatorios) tem precedência absoluta.
 * 2. Registro profissional no conselho (CRO = Odonto, CRM = Médico).
 * 3. Classificação semântica inteligente por palavras-chave com normalização.
 */
export function isEspecialidadeOdonto(
  item: ItemClassificavelCentro | string,
): boolean {
  if (typeof item === 'string') {
    const nomeLower = item.toLowerCase().trim();
    if (/\bcro\b/i.test(nomeLower) || nomeLower.startsWith('cro')) return true;
    if (/\bcrm\b/i.test(nomeLower) || nomeLower.startsWith('crm')) return false;
    return ESPECIALIDADES_ODONTO.some((o) => (o === 'pne' ? /\bpne\b/i.test(nomeLower) : nomeLower.includes(o)));
  }

  // 1. Tag explícita em documentosObrigatorios
  const docs = item.documentosObrigatorios || [];
  if (docs.includes('CENTRO:CEO')) return true;
  if (docs.includes('CENTRO:CEM')) return false;

  // 2. Registro de conselho profissional
  if (item.crm) {
    const crmUpper = item.crm.toUpperCase();
    if (crmUpper.includes('CRO')) return true;
    if (crmUpper.includes('CRM')) return false;
  }

  // 3. Checagem semântica de nome / especialidade
  const texto = (item.nome || item.especialidade || '').toLowerCase().trim();
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

