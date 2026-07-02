/**
 * Dossiê médico (read-only) consumido pelo app paciente.
 *
 * v0.14: hardening LGPD/CFM completo.
 *
 *   1. **Audit dual** — toda leitura grava:
 *      - `auditoria_logs` (LGPD 5 anos): granular por endpoint
 *      - `paciente_prontuario_audit` (CFM 20 anos, imutável via trigger SQL):
 *        ação `LEITURA_DOSSIE` com snapshot do que foi acessado
 *
 *   2. **Enum mapping completo** — `_mapTipoAtendimento` agora suporta os 7
 *      valores reais do PEC (CONSULTA_MEDICA, ENFERMAGEM, VACINACAO, CURATIVO,
 *      ODONTOLOGICO, PROCEDIMENTO, ACOLHIMENTO) sem perda de informação.
 *
 *   3. **Sanitização de texto** — campos free-text (queixa, conduta, observação)
 *      passam por `sanitizeText()`: strip de HTML tags, control chars, zero-width
 *      Unicode, normalização CRLF, cap em 4000 chars.
 *
 *   4. **Paginação cursor** — `cursor`/`limit` opcionais em atendimentos/vacinas/exames
 *      (default 50, max 100) pra evitar payload gigante em históricos longos.
 *
 *   5. **Campos completos** — `via` (vacina), `categoria`/`unidadeExecutora` (exame).
 *
 *   6. **Concat seguro** em `medicamentosUsoContinuo` (sem `undefined undefined`).
 *
 * Filtros automáticos por `pacienteId` (escopo: o próprio CPF).
 */
import { prisma } from '../../../../infrastructure/database/prisma';
import { logger } from '../../../../infrastructure/logger';
import { sanitizeText } from '../../../../shared/sanitizeText';
import { NotFound } from '../../../../shared/errors';
import type { IAuditLogger } from '../../../../infrastructure/audit/PrismaAuditLogger';

export interface DossieResumoDto {
  totalEncaminhamentos: number;
  totalAtendimentos: number;
  totalVacinas: number;
  totalExames: number;
  tipoSanguineo: string | null;
  alergias: string[];
  condicoesCronicas: string[];
  medicamentosUsoContinuo: string[];
}

/** Tipo de atendimento — agora suporta TODOS os valores do enum PEC. */
export type AtendimentoTipoApp =
  | 'CONSULTA_MEDICA'
  | 'ENFERMAGEM'
  | 'VACINACAO'
  | 'CURATIVO'
  | 'ODONTOLOGICO'
  | 'PROCEDIMENTO'
  | 'ACOLHIMENTO';

export interface AtendimentoDto {
  id: string;
  data: string; // ISO 8601
  tipo: AtendimentoTipoApp;
  localNome: string;
  profissionalNome: string;
  profissionalEspecialidade: string | null;
  queixaPrincipal: string | null;
  cid10: string | null;
  cid10Descricao: string | null;
  condutaResumida: string | null;
}

export interface VacinacaoDto {
  id: string;
  vacina: string;
  dose: string;
  aplicadaEm: string;
  localAplicacao: string;
  lote: string | null;
  fabricante: string | null;
  via: string | null; // INTRAMUSCULAR | ORAL | SUBCUTANEA | ...
  aplicadorNome: string | null;
}

export interface ExameDto {
  id: string;
  nome: string;
  realizadoEm: string;
  solicitanteNome: string;
  unidadeExecutora: string | null;
  categoria: string | null; // LABORATORIAL | IMAGEM | FUNCIONAL | OUTROS
  alterado: boolean;
  resultadoStatus: 'NORMAL' | 'ALTERADO' | 'CRITICO' | 'PENDENTE';
  resultadoResumo: string | null;
  observacoes: string | null;
}

export interface PaginacaoCursor {
  /** ID do último item recebido na página anterior. */
  cursor?: string;
  /** Default 50, máximo 100. */
  limit?: number;
}

export interface PaginadoResult<T> {
  items: T[];
  nextCursor: string | null;
}

export interface DossieAuditContext {
  contaId: string;
  cpfDigits: string;
  ip?: string | null;
  userAgent?: string | null;
}

const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 100;

/** Acha o paciente clínico pelo CPF (dígitos) da conta. */
async function _pacienteIdPorCpf(cpfDigits: string): Promise<string | null> {
  const p = await prisma.paciente.findUnique({
    where: { cpf: cpfDigits },
    select: { id: true },
  });
  return p?.id ?? null;
}

/**
 * Grava audit dual (LGPD + CFM) para uma leitura do dossiê.
 * Falha em qualquer um dos audits **não** quebra o endpoint (best-effort).
 */
async function _auditLeitura(
  audit: IAuditLogger,
  acaoLgpd: string,
  pacienteId: string | null,
  ctx: DossieAuditContext,
  payloadExtra: Record<string, unknown>,
): Promise<void> {
  const cpfMasked = ctx.cpfDigits.slice(0, 4) + '***';

  // 1. LGPD (5 anos) — `auditoria_logs`
  await audit.registrar({
    acao: acaoLgpd,
    recurso: 'PacienteProntuario',
    recursoId: pacienteId ?? undefined,
    atendenteId: null,
    payload: { contaId: ctx.contaId, cpfMasked, ...payloadExtra },
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  // 2. CFM (20 anos) — `paciente_prontuario_audit` (imutável via trigger)
  if (!pacienteId) return; // sem paciente clínico, não há prontuário a registrar
  try {
    await prisma.pacienteProntuarioAudit.create({
      data: {
        pacienteId,
        autorId: ctx.contaId,
        autorNome: 'PACIENTE',
        autorPapel: 'PACIENTE · App',
        acao: 'LEITURA_DOSSIE',
        dados: { endpoint: acaoLgpd, cpfMasked, ...payloadExtra },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error(
      { err, pacienteId, contaId: ctx.contaId, acao: acaoLgpd },
      '[cfm-audit] falha ao gravar paciente_prontuario_audit (LEITURA_DOSSIE)',
    );
  }
}

export class DossieResumoUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(ctx: DossieAuditContext): Promise<DossieResumoDto> {
    const pacienteId = await _pacienteIdPorCpf(ctx.cpfDigits);

    if (!pacienteId) {
      // Sem PEC vinculado → dados zerados (em vez de 404). UI mostra estados vazios.
      // Audit LGPD ainda assim (rastreio de tentativa sem PEC).
      await _auditLeitura(this.audit, 'DOSSIE_RESUMO_LIDO', null, ctx, {
        encontrouPaciente: false,
      });
      return {
        totalEncaminhamentos: 0,
        totalAtendimentos: 0,
        totalVacinas: 0,
        totalExames: 0,
        tipoSanguineo: null,
        alergias: [],
        condicoesCronicas: [],
        medicamentosUsoContinuo: [],
      };
    }

    const [paciente, totalEncs, totalAt, totalVac, totalEx] = await Promise.all([
      prisma.paciente.findUnique({
        where: { id: pacienteId },
        include: {
          alergias: { select: { substancia: true } },
          condicoesCronicas: { where: { ativo: true }, select: { descricao: true } },
          medicamentosEmUso: {
            where: { ativo: true },
            select: { nome: true, dosagem: true, frequencia: true },
          },
        },
      }),
      prisma.encaminhamento.count({ where: { pacienteId, deletadoEm: null } }),
      prisma.atendimento.count({ where: { pacienteId } }),
      prisma.vacinaAplicada.count({ where: { pacienteId } }),
      prisma.exameRealizado.count({ where: { pacienteId } }),
    ]);

    const dto: DossieResumoDto = {
      totalEncaminhamentos: totalEncs,
      totalAtendimentos: totalAt,
      totalVacinas: totalVac,
      totalExames: totalEx,
      tipoSanguineo: _formatarTipoSanguineo(paciente?.grupoSanguineo),
      alergias: (paciente?.alergias ?? [])
        .map((a) => sanitizeText(a.substancia, 200) ?? '')
        .filter((s) => s.length > 0),
      condicoesCronicas: (paciente?.condicoesCronicas ?? [])
        .map((c) => sanitizeText(c.descricao, 200) ?? '')
        .filter((s) => s.length > 0),
      medicamentosUsoContinuo: (paciente?.medicamentosEmUso ?? [])
        .map((m) => _formatarMedicamento(m))
        .filter((s) => s.length > 0),
    };

    await _auditLeitura(this.audit, 'DOSSIE_RESUMO_LIDO', pacienteId, ctx, {
      totals: {
        encaminhamentos: totalEncs,
        atendimentos: totalAt,
        vacinas: totalVac,
        exames: totalEx,
      },
    });

    return dto;
  }
}

export class DossieAtendimentosUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(
    ctx: DossieAuditContext,
    pag: PaginacaoCursor = {},
  ): Promise<PaginadoResult<AtendimentoDto>> {
    const pacienteId = await _pacienteIdPorCpf(ctx.cpfDigits);
    if (!pacienteId) {
      await _auditLeitura(this.audit, 'DOSSIE_ATENDIMENTOS_LIDOS', null, ctx, {
        encontrouPaciente: false,
      });
      return { items: [], nextCursor: null };
    }

    const limit = Math.min(Math.max(pag.limit ?? LIMIT_DEFAULT, 1), LIMIT_MAX);
    const cursorClause = pag.cursor ? { id: pag.cursor } : undefined;

    const rows = await prisma.atendimento.findMany({
      where: { pacienteId },
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
      take: limit + 1, // +1 pra detectar próxima página
      ...(cursorClause ? { cursor: cursorClause, skip: 1 } : {}),
    });

    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;
    const items: AtendimentoDto[] = pageRows.map((r) => ({
      id: r.id,
      data: r.data.toISOString(),
      tipo: _mapTipoAtendimento(r.tipo),
      localNome: sanitizeText(r.unidade, 200) ?? '',
      profissionalNome: sanitizeText(r.profissional, 200) ?? '',
      profissionalEspecialidade: sanitizeText(r.especialidade, 200),
      queixaPrincipal: sanitizeText(r.queixaPrincipal, 2000),
      cid10: r.cid10,
      // Backend não tem dicionário CID embarcado — descrição vem null.
      // Frontend pode resolver com lib local (ex: CID-10 pt-BR) se quiser.
      cid10Descricao: null,
      condutaResumida: sanitizeText(r.conduta, 4000),
    }));

    await _auditLeitura(this.audit, 'DOSSIE_ATENDIMENTOS_LIDOS', pacienteId, ctx, {
      paginacao: { limit, cursor: pag.cursor ?? null, retornados: items.length, hasNext },
    });

    return {
      items,
      nextCursor: hasNext && pageRows.length > 0 ? pageRows[pageRows.length - 1]!.id : null,
    };
  }
}

export class DossieVacinacoesUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(
    ctx: DossieAuditContext,
    pag: PaginacaoCursor = {},
  ): Promise<PaginadoResult<VacinacaoDto>> {
    const pacienteId = await _pacienteIdPorCpf(ctx.cpfDigits);
    if (!pacienteId) {
      await _auditLeitura(this.audit, 'DOSSIE_VACINAS_LIDAS', null, ctx, {
        encontrouPaciente: false,
      });
      return { items: [], nextCursor: null };
    }

    const limit = Math.min(Math.max(pag.limit ?? LIMIT_DEFAULT, 1), LIMIT_MAX);
    const cursorClause = pag.cursor ? { id: pag.cursor } : undefined;

    const rows = await prisma.vacinaAplicada.findMany({
      where: { pacienteId },
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursorClause ? { cursor: cursorClause, skip: 1 } : {}),
    });

    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;
    const items: VacinacaoDto[] = pageRows.map((r) => ({
      id: r.id,
      vacina: sanitizeText(r.vacina, 120) ?? '',
      dose: sanitizeText(r.dose, 40) ?? '',
      aplicadaEm: r.data.toISOString(),
      localAplicacao: sanitizeText(r.unidade, 200) ?? '',
      lote: sanitizeText(r.lote, 60),
      // Schema atual não tem `fabricante` — campo nullable na resposta (futuro: lookup
      // por lote em tabela de farmacovigilância).
      fabricante: null,
      via: r.via,
      aplicadorNome: sanitizeText(r.aplicador, 200),
    }));

    await _auditLeitura(this.audit, 'DOSSIE_VACINAS_LIDAS', pacienteId, ctx, {
      paginacao: { limit, cursor: pag.cursor ?? null, retornados: items.length, hasNext },
    });

    return {
      items,
      nextCursor: hasNext && pageRows.length > 0 ? pageRows[pageRows.length - 1]!.id : null,
    };
  }
}

export class DossieExamesUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(
    ctx: DossieAuditContext,
    pag: PaginacaoCursor = {},
  ): Promise<PaginadoResult<ExameDto>> {
    const pacienteId = await _pacienteIdPorCpf(ctx.cpfDigits);
    if (!pacienteId) {
      await _auditLeitura(this.audit, 'DOSSIE_EXAMES_LIDOS', null, ctx, {
        encontrouPaciente: false,
      });
      return { items: [], nextCursor: null };
    }

    const limit = Math.min(Math.max(pag.limit ?? LIMIT_DEFAULT, 1), LIMIT_MAX);
    const cursorClause = pag.cursor ? { id: pag.cursor } : undefined;

    const rows = await prisma.exameRealizado.findMany({
      where: { pacienteId },
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursorClause ? { cursor: cursorClause, skip: 1 } : {}),
    });

    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;
    const items: ExameDto[] = pageRows.map((r) => ({
      id: r.id,
      nome: sanitizeText(r.tipo, 200) ?? '',
      realizadoEm: r.data.toISOString(),
      solicitanteNome: sanitizeText(r.solicitante, 200) ?? '',
      unidadeExecutora: sanitizeText(r.unidadeExecutora, 200),
      categoria: r.categoria,
      alterado: r.resultado === 'ALTERADO' || r.resultado === 'CRITICO',
      resultadoStatus: r.resultado,
      resultadoResumo: sanitizeText(r.observacao, 4000),
      observacoes: null,
    }));

    await _auditLeitura(this.audit, 'DOSSIE_EXAMES_LIDOS', pacienteId, ctx, {
      paginacao: { limit, cursor: pag.cursor ?? null, retornados: items.length, hasNext },
    });

    return {
      items,
      nextCursor: hasNext && pageRows.length > 0 ? pageRows[pageRows.length - 1]!.id : null,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Detalhe (item único) — v0.18.2+
// ─────────────────────────────────────────────────────────────────────────
//
// Cada `Obter*` segue o mesmo padrão:
//   1. Resolve pacienteId via CPF (anti-enum: sem PEC → 404)
//   2. findUnique({ id })
//   3. Se item de outro paciente → 404 (anti-enum, audit registra _FORA_DO_ESCOPO)
//   4. Audit dual (LGPD 5 anos + CFM 20 anos, ação `LEITURA_DOSSIE_*_DETALHE`)
//   5. Retorna DTO **idêntico** ao item da lista (Flutter reusa o mesmo model)

export class ObterAtendimentoUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(id: string, ctx: DossieAuditContext): Promise<AtendimentoDto> {
    const pacienteId = await _pacienteIdPorCpf(ctx.cpfDigits);
    if (!pacienteId) {
      await _auditLeitura(this.audit, 'DOSSIE_ATENDIMENTO_DETALHE_NAO_EXISTE', null, ctx, {
        id,
        motivo: 'sem PEC vinculado',
      });
      throw NotFound('ATENDIMENTO_NAO_ENCONTRADO', 'Atendimento não encontrado.');
    }

    const r = await prisma.atendimento.findUnique({ where: { id } });
    if (!r) {
      await _auditLeitura(this.audit, 'DOSSIE_ATENDIMENTO_DETALHE_NAO_EXISTE', pacienteId, ctx, { id });
      throw NotFound('ATENDIMENTO_NAO_ENCONTRADO', 'Atendimento não encontrado.');
    }
    if (r.pacienteId !== pacienteId) {
      // Anti-enumeration cross-paciente — CRÍTICO pra LGPD
      await _auditLeitura(this.audit, 'DOSSIE_ATENDIMENTO_DETALHE_FORA_DO_ESCOPO', pacienteId, ctx, {
        id,
        donoPacienteId: r.pacienteId,
      });
      throw NotFound('ATENDIMENTO_NAO_ENCONTRADO', 'Atendimento não encontrado.');
    }

    const dto: AtendimentoDto = {
      id: r.id,
      data: r.data.toISOString(),
      tipo: _mapTipoAtendimento(r.tipo),
      localNome: sanitizeText(r.unidade, 200) ?? '',
      profissionalNome: sanitizeText(r.profissional, 200) ?? '',
      profissionalEspecialidade: sanitizeText(r.especialidade, 200),
      queixaPrincipal: sanitizeText(r.queixaPrincipal, 2000),
      cid10: r.cid10,
      cid10Descricao: null,
      condutaResumida: sanitizeText(r.conduta, 4000),
    };

    await _auditLeitura(this.audit, 'DOSSIE_ATENDIMENTO_DETALHE_LIDO', pacienteId, ctx, {
      atendimentoId: r.id,
      tipo: r.tipo,
    });
    return dto;
  }
}

export class ObterVacinacaoUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(id: string, ctx: DossieAuditContext): Promise<VacinacaoDto> {
    const pacienteId = await _pacienteIdPorCpf(ctx.cpfDigits);
    if (!pacienteId) {
      await _auditLeitura(this.audit, 'DOSSIE_VACINACAO_DETALHE_NAO_EXISTE', null, ctx, {
        id,
        motivo: 'sem PEC vinculado',
      });
      throw NotFound('VACINACAO_NAO_ENCONTRADA', 'Vacinação não encontrada.');
    }

    const r = await prisma.vacinaAplicada.findUnique({ where: { id } });
    if (!r) {
      await _auditLeitura(this.audit, 'DOSSIE_VACINACAO_DETALHE_NAO_EXISTE', pacienteId, ctx, { id });
      throw NotFound('VACINACAO_NAO_ENCONTRADA', 'Vacinação não encontrada.');
    }
    if (r.pacienteId !== pacienteId) {
      await _auditLeitura(this.audit, 'DOSSIE_VACINACAO_DETALHE_FORA_DO_ESCOPO', pacienteId, ctx, {
        id,
        donoPacienteId: r.pacienteId,
      });
      throw NotFound('VACINACAO_NAO_ENCONTRADA', 'Vacinação não encontrada.');
    }

    const dto: VacinacaoDto = {
      id: r.id,
      vacina: sanitizeText(r.vacina, 120) ?? '',
      dose: sanitizeText(r.dose, 40) ?? '',
      aplicadaEm: r.data.toISOString(),
      localAplicacao: sanitizeText(r.unidade, 200) ?? '',
      lote: sanitizeText(r.lote, 60),
      fabricante: null,
      via: r.via,
      aplicadorNome: sanitizeText(r.aplicador, 200),
    };

    await _auditLeitura(this.audit, 'DOSSIE_VACINACAO_DETALHE_LIDO', pacienteId, ctx, {
      vacinacaoId: r.id,
      vacina: r.vacina,
    });
    return dto;
  }
}

export class ObterExameUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(id: string, ctx: DossieAuditContext): Promise<ExameDto> {
    const pacienteId = await _pacienteIdPorCpf(ctx.cpfDigits);
    if (!pacienteId) {
      await _auditLeitura(this.audit, 'DOSSIE_EXAME_DETALHE_NAO_EXISTE', null, ctx, {
        id,
        motivo: 'sem PEC vinculado',
      });
      throw NotFound('EXAME_NAO_ENCONTRADO', 'Exame não encontrado.');
    }

    const r = await prisma.exameRealizado.findUnique({ where: { id } });
    if (!r) {
      await _auditLeitura(this.audit, 'DOSSIE_EXAME_DETALHE_NAO_EXISTE', pacienteId, ctx, { id });
      throw NotFound('EXAME_NAO_ENCONTRADO', 'Exame não encontrado.');
    }
    if (r.pacienteId !== pacienteId) {
      await _auditLeitura(this.audit, 'DOSSIE_EXAME_DETALHE_FORA_DO_ESCOPO', pacienteId, ctx, {
        id,
        donoPacienteId: r.pacienteId,
      });
      throw NotFound('EXAME_NAO_ENCONTRADO', 'Exame não encontrado.');
    }

    const dto: ExameDto = {
      id: r.id,
      nome: sanitizeText(r.tipo, 200) ?? '',
      realizadoEm: r.data.toISOString(),
      solicitanteNome: sanitizeText(r.solicitante, 200) ?? '',
      unidadeExecutora: sanitizeText(r.unidadeExecutora, 200),
      categoria: r.categoria,
      alterado: r.resultado === 'ALTERADO' || r.resultado === 'CRITICO',
      resultadoStatus: r.resultado,
      resultadoResumo: sanitizeText(r.observacao, 4000),
      observacoes: null,
    };

    await _auditLeitura(this.audit, 'DOSSIE_EXAME_DETALHE_LIDO', pacienteId, ctx, {
      exameId: r.id,
      tipo: r.tipo,
      resultado: r.resultado,
    });
    return dto;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Mapeia tipo do PEC pra tipo do app paciente.
 * v0.14: mapeamento 1:1 — preserva semântica original. Os 7 valores do enum
 * PEC são todos suportados pelo app.
 */
function _mapTipoAtendimento(t: string): AtendimentoTipoApp {
  switch (t) {
    case 'CONSULTA_MEDICA':
    case 'ENFERMAGEM':
    case 'VACINACAO':
    case 'CURATIVO':
    case 'ODONTOLOGICO':
    case 'PROCEDIMENTO':
    case 'ACOLHIMENTO':
      return t;
    default:
      // Defensive: enum desconhecido (migração futura) → fallback semântico
      logger.warn({ tipo: t }, '[dossie] tipo de atendimento desconhecido — fallback PROCEDIMENTO');
      return 'PROCEDIMENTO';
  }
}

function _formatarTipoSanguineo(g: string | undefined | null): string | null {
  if (!g || g === 'NAO_INFORMADO') return null;
  const map: Record<string, string> = {
    A_POSITIVO: 'A+',
    A_NEGATIVO: 'A-',
    B_POSITIVO: 'B+',
    B_NEGATIVO: 'B-',
    AB_POSITIVO: 'AB+',
    AB_NEGATIVO: 'AB-',
    O_POSITIVO: 'O+',
    O_NEGATIVO: 'O-',
  };
  return map[g] ?? null;
}

/**
 * Formata medicamento de uso contínuo. Trata campos opcionais/vazios
 * pra evitar "Nome  · undefined undefined".
 */
function _formatarMedicamento(m: {
  nome: string;
  dosagem: string | null;
  frequencia: string | null;
}): string {
  const nome = sanitizeText(m.nome, 120) ?? '';
  if (!nome) return '';
  const partes: string[] = [nome];
  const dosagem = sanitizeText(m.dosagem ?? null, 60);
  const frequencia = sanitizeText(m.frequencia ?? null, 120);
  if (dosagem) partes.push(dosagem);
  if (frequencia) partes.push(`· ${frequencia}`);
  return partes.join(' ');
}
