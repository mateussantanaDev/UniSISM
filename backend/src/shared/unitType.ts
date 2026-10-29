export type TipoUnidade = 'CEO' | 'CEM' | 'UBS' | 'SMS' | 'TFD';

export interface UnidadeResolutionContext {
  tipoUnidade?: string | null;
  cargo?: string | null;
  funcao?: string | null;
  role?: string | null;
  unidadeNome?: string | null;
  ubs?: { nome?: string | null } | null;
}

export function isCentroType(tipo?: string | null): boolean {
  if (!tipo) return false;
  const upper = tipo.trim().toUpperCase();
  return (
    upper === 'CEM' ||
    upper === 'CEO' ||
    upper === 'CENTRO' ||
    upper.startsWith('CEM') ||
    upper.startsWith('CEO')
  );
}

export function resolverTipoUnidade(ctx: UnidadeResolutionContext): TipoUnidade {
  const explicit = ctx.tipoUnidade?.trim().toUpperCase();
  if (explicit === 'CEO' || explicit === 'CEM' || explicit === 'SMS' || explicit === 'TFD') {
    return explicit;
  }
  if (
    explicit === 'CENTRO' ||
    explicit === 'CENTRO_ESPECIALIDADES' ||
    explicit === 'CENTRO_MEDICO' ||
    explicit === 'CENTRO MUNICIPAL DE ESPECIALIDADES'
  ) {
    return 'CEM';
  }
  if (
    explicit === 'CENTRO_ODONTOLOGICO' ||
    explicit === 'CENTRO_ODONTO' ||
    explicit === 'CEO_ODONTO'
  ) {
    return 'CEO';
  }

  const cargo = (ctx.cargo || '').toUpperCase();
  const funcao = (ctx.funcao || '').toUpperCase();
  const ubsNome = (ctx.unidadeNome || ctx.ubs?.nome || '').toUpperCase();
  const combined = `${cargo} ${funcao} ${ubsNome}`;

  if (
    combined.includes('CEO') ||
    combined.includes('ODONTOL') ||
    combined.includes('DENTIST') ||
    combined.includes('BUCOMAXILO') ||
    combined.includes('ENDODONT')
  ) {
    return 'CEO';
  }

  if (
    combined.includes('CEM') ||
    combined.includes('CENTRO DE ESPECIALIDADES') ||
    combined.includes('CENTRO MUNICIPAL DE ESPECIALIDADES') ||
    combined.includes('ESPECIALIDADES MÉDICAS') ||
    combined.includes('ESPECIALIDADES MEDICAS') ||
    combined.includes('CENTRO MÉDICO') ||
    combined.includes('CENTRO MEDICO')
  ) {
    return 'CEM';
  }

  if (ctx.role === 'MEDICO_ESPECIALISTA' || ctx.role === 'ATENDENTE_CENTRO') {
    return 'CEM';
  }

  if (
    ctx.role === 'GESTOR_TFD' ||
    ctx.role === 'ATENDENTE_TFD' ||
    ctx.role === 'REGULADOR_TFD' ||
    ctx.role === 'MOTORISTA_TFD' ||
    combined.includes('TFD') ||
    combined.includes('TRATAMENTO FORA')
  ) {
    return 'TFD';
  }

  if (
    ctx.role === 'REGULADOR_SMS' ||
    combined.includes('SECRETARIA DE SAÚDE') ||
    combined.includes('SECRETARIA DE SAUDE') ||
    combined.includes('SECRETARIA MUNICIPAL')
  ) {
    return 'SMS';
  }

  if (explicit === 'UBS') {
    return 'UBS';
  }

  return 'UBS';
}
