/**
 * CRUD admin de Banners SMS (CMS) — Face 2 / Admin.
 *
 * RBAC:
 *   - DESENVOLVEDOR (GLOBAL): pode criar/editar/excluir QUALQUER banner.
 *     Pode setar `prefeituraId` ou deixar global.
 *   - ADMIN / REGULADOR_SMS (PREFEITURA): pode criar/editar/excluir banners
 *     da SUA prefeitura. Não pode criar banner GLOBAL nem mexer em banner
 *     de outra prefeitura.
 *
 * Audit log: CRIAR_BANNER, EDITAR_BANNER, DELETAR_BANNER em `auditoria_logs`,
 * com snapshot antes/depois nos UPDATEs.
 *
 * Validações:
 *   - HTTPS-only em imagemUrl/ctaUrl (Android bloqueia http://)
 *   - URL parseável + ≤500 chars
 *   - titulo 3-80 chars, corpo 3-400 chars, ctaLabel ≤30 chars
 *   - expiraEm > publicadoEm
 *   - prioridadeOrdem em [-100, 1000]
 *   - sanitização anti-XSS em titulo + corpo
 *   - prefeituraId (se setada) deve existir
 */
import { Prisma } from '../../../generated/prisma';
import { Conflict, Forbidden, NotFound } from '../../shared/errors';
import { prisma } from '../../infrastructure/database/prisma';
import type { AccessScope } from '../../shared/scope';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';
import {
  LIMITES_BANNER,
  validarUrlHttps,
  validarExpiraEm,
  validarTamanho,
  valOrThrow,
} from '../../shared/bannerValidators';
import { sanitizeText } from '../../shared/sanitizeText';

export type BannerTone = 'URGENTE' | 'CAMPANHA' | 'INFO' | 'ATENCAO';

export interface AdminBannerDto {
  id: string;
  titulo: string;
  corpo: string;
  tone: BannerTone;
  publicadoEm: string;
  expiraEm: string | null;
  imagemUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  prioridadeOrdem: number;
  ativo: boolean;
  prefeituraId: string | null;
  totalVisualizacoes: number;
  criadoPorId: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CriarBannerInput {
  titulo: string;
  corpo: string;
  tone: BannerTone;
  publicadoEm?: string; // ISO 8601, default now
  expiraEm?: string | null;
  imagemUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  prioridadeOrdem?: number;
  prefeituraId?: string | null;
}

export interface AtualizarBannerInput {
  titulo?: string;
  corpo?: string;
  tone?: BannerTone;
  publicadoEm?: string;
  expiraEm?: string | null;
  imagemUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  prioridadeOrdem?: number;
  ativo?: boolean;
  // Note: prefeituraId NÃO é editável (mudaria escopo — banner novo se necessário)
}

export interface BannerAuditCtx {
  atendenteId: string;
  ip?: string | null;
  userAgent?: string | null;
}

const TONES_VALIDOS: ReadonlyArray<BannerTone> = ['URGENTE', 'CAMPANHA', 'INFO', 'ATENCAO'];

/** Garante que `prefeituraId` existe (se informado). */
async function _validarPrefeitura(prefeituraId: string | null | undefined): Promise<void> {
  if (!prefeituraId) return;
  const pref = await prisma.prefeitura.findUnique({ where: { id: prefeituraId } });
  if (!pref || pref.deletadoEm) {
    throw NotFound('PREFEITURA_NAO_ENCONTRADA', 'Prefeitura não encontrada');
  }
}

/**
 * Valida que o scope tem permissão pra criar/editar banner com a `prefeituraId` informada.
 * - GLOBAL (DEV): qualquer prefeituraId, incluindo null (banner global)
 * - PREFEITURA (ADMIN/REG): SÓ pode mexer em banner da sua prefeitura.
 *   Banner global (null) → bloqueado pra ADMIN.
 */
function _ensureBannerAcessivel(
  scope: AccessScope,
  bannerPrefeituraId: string | null,
): void {
  if (scope.kind === 'GLOBAL') return;
  if (scope.kind === 'PREFEITURA') {
    if (bannerPrefeituraId === null) {
      throw Forbidden(
        'FORA_DO_ESCOPO',
        'Apenas DESENVOLVEDOR pode criar/editar banners globais.',
      );
    }
    if (bannerPrefeituraId !== scope.prefeituraId) {
      throw Forbidden('FORA_DO_ESCOPO', 'Banner pertence a outra prefeitura.');
    }
    return;
  }
  // UBS scope → não deve mexer em banners (RBAC do controller filtra antes, mas defesa em profundidade)
  throw Forbidden('FORA_DO_ESCOPO', 'Sem permissão para gerenciar banners.');
}

function _toDto(b: {
  id: string;
  titulo: string;
  corpo: string;
  tone: BannerTone;
  publicadoEm: Date;
  expiraEm: Date | null;
  imagemUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  prioridadeOrdem: number;
  ativo: boolean;
  prefeituraId: string | null;
  criadoPorId: string;
  criadoEm: Date;
  atualizadoEm: Date;
  _count?: { visualizacoes: number };
}): AdminBannerDto {
  return {
    id: b.id,
    titulo: b.titulo,
    corpo: b.corpo,
    tone: b.tone,
    publicadoEm: b.publicadoEm.toISOString(),
    expiraEm: b.expiraEm?.toISOString() ?? null,
    imagemUrl: b.imagemUrl,
    ctaLabel: b.ctaLabel,
    ctaUrl: b.ctaUrl,
    prioridadeOrdem: b.prioridadeOrdem,
    ativo: b.ativo,
    prefeituraId: b.prefeituraId,
    totalVisualizacoes: b._count?.visualizacoes ?? 0,
    criadoPorId: b.criadoPorId,
    criadoEm: b.criadoEm.toISOString(),
    atualizadoEm: b.atualizadoEm.toISOString(),
  };
}

/**
 * Lista banners para o admin com contagem de visualizações.
 * Filtros por scope: PREFEITURA só vê banners da própria prefeitura.
 */
export class ListarBannersAdminUseCase {
  async exec(
    scope: AccessScope,
    filtros: { ativo?: boolean; expirados?: boolean } = {},
  ): Promise<AdminBannerDto[]> {
    const where: Prisma.SmsBannerWhereInput = {};

    // Scope: PREFEITURA → só própria
    if (scope.kind === 'PREFEITURA') {
      where.prefeituraId = scope.prefeituraId;
    }
    // (GLOBAL DEV vê todos; UBS RBAC bloqueia antes)

    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
    if (filtros.expirados === false) {
      where.OR = [{ expiraEm: null }, { expiraEm: { gt: new Date() } }];
    } else if (filtros.expirados === true) {
      where.expiraEm = { lt: new Date() };
    }

    const rows = await prisma.smsBanner.findMany({
      where,
      include: { _count: { select: { visualizacoes: true } } },
      orderBy: [{ prioridadeOrdem: 'desc' }, { publicadoEm: 'desc' }],
    });
    return rows.map(_toDto);
  }
}

export class ObterBannerAdminUseCase {
  async exec(scope: AccessScope, bannerId: string): Promise<AdminBannerDto> {
    const banner = await prisma.smsBanner.findUnique({
      where: { id: bannerId },
      include: { _count: { select: { visualizacoes: true } } },
    });
    if (!banner) throw NotFound('BANNER_NAO_ENCONTRADO', 'Banner não encontrado');
    _ensureBannerAcessivel(scope, banner.prefeituraId);
    return _toDto(banner);
  }
}

export class CriarBannerAdminUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(
    scope: AccessScope,
    input: CriarBannerInput,
    ctx: BannerAuditCtx,
  ): Promise<AdminBannerDto> {
    // 1. Validações básicas
    valOrThrow(validarTamanho(input.titulo, 'titulo', 3, LIMITES_BANNER.TITULO_MAX));
    valOrThrow(validarTamanho(input.corpo, 'corpo', 3, LIMITES_BANNER.CORPO_MAX));
    if (!TONES_VALIDOS.includes(input.tone)) {
      throw NotFound('VALIDATION_ERROR', 'tone deve ser URGENTE | CAMPANHA | INFO | ATENCAO');
    }
    valOrThrow(
      validarTamanho(input.ctaLabel ?? null, 'ctaLabel', 0, LIMITES_BANNER.CTA_LABEL_MAX),
    );
    valOrThrow(validarUrlHttps(input.imagemUrl ?? null, 'imagemUrl'));
    valOrThrow(validarUrlHttps(input.ctaUrl ?? null, 'ctaUrl'));

    // ctaUrl + ctaLabel devem vir juntos (CTA sem label não renderiza, label sem url não clica)
    const temLabel = !!(input.ctaLabel && input.ctaLabel.trim().length > 0);
    const temUrl = !!(input.ctaUrl && input.ctaUrl.trim().length > 0);
    if (temLabel !== temUrl) {
      throw NotFound(
        'VALIDATION_ERROR',
        'ctaLabel e ctaUrl devem ser preenchidos juntos (ou ambos vazios)',
      );
    }

    if (
      input.prioridadeOrdem !== undefined &&
      (input.prioridadeOrdem < LIMITES_BANNER.PRIORIDADE_MIN ||
        input.prioridadeOrdem > LIMITES_BANNER.PRIORIDADE_MAX)
    ) {
      throw NotFound(
        'VALIDATION_ERROR',
        `prioridadeOrdem deve estar entre ${LIMITES_BANNER.PRIORIDADE_MIN} e ${LIMITES_BANNER.PRIORIDADE_MAX}`,
      );
    }

    const publicadoEm = input.publicadoEm ? new Date(input.publicadoEm) : new Date();
    if (Number.isNaN(publicadoEm.getTime())) {
      throw NotFound('VALIDATION_ERROR', 'publicadoEm: data inválida');
    }
    const expiraEm = input.expiraEm ? new Date(input.expiraEm) : null;
    valOrThrow(validarExpiraEm(expiraEm, publicadoEm));

    // 2. Validar prefeitura existe + escopo
    await _validarPrefeitura(input.prefeituraId);
    _ensureBannerAcessivel(scope, input.prefeituraId ?? null);

    // 3. Sanitização (texto livre vai pro app paciente — XSS defesa em profundidade)
    const tituloSan = sanitizeText(input.titulo, LIMITES_BANNER.TITULO_MAX)!;
    const corpoSan = sanitizeText(input.corpo, LIMITES_BANNER.CORPO_MAX)!;
    const ctaLabelSan = sanitizeText(input.ctaLabel ?? null, LIMITES_BANNER.CTA_LABEL_MAX);

    // 4. Create
    const criado = await prisma.smsBanner.create({
      data: {
        titulo: tituloSan,
        corpo: corpoSan,
        tone: input.tone,
        publicadoEm,
        expiraEm,
        imagemUrl: input.imagemUrl ?? null,
        ctaLabel: ctaLabelSan,
        ctaUrl: input.ctaUrl ?? null,
        prioridadeOrdem: input.prioridadeOrdem ?? 0,
        prefeituraId: input.prefeituraId ?? null,
        criadoPorId: ctx.atendenteId,
        ativo: true,
      },
      include: { _count: { select: { visualizacoes: true } } },
    });

    await this.audit.registrar({
      acao: 'CRIAR_BANNER',
      recurso: 'SmsBanner',
      recursoId: criado.id,
      atendenteId: ctx.atendenteId,
      payload: {
        titulo: criado.titulo,
        tone: criado.tone,
        prefeituraId: criado.prefeituraId,
        prioridadeOrdem: criado.prioridadeOrdem,
        publicadoEm: criado.publicadoEm.toISOString(),
        expiraEm: criado.expiraEm?.toISOString() ?? null,
      },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return _toDto(criado);
  }
}

export class AtualizarBannerAdminUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(
    scope: AccessScope,
    bannerId: string,
    input: AtualizarBannerInput,
    ctx: BannerAuditCtx,
  ): Promise<AdminBannerDto> {
    const alvo = await prisma.smsBanner.findUnique({ where: { id: bannerId } });
    if (!alvo) throw NotFound('BANNER_NAO_ENCONTRADO', 'Banner não encontrado');
    _ensureBannerAcessivel(scope, alvo.prefeituraId);

    // Validações dos campos enviados
    if (input.titulo !== undefined) {
      valOrThrow(validarTamanho(input.titulo, 'titulo', 3, LIMITES_BANNER.TITULO_MAX));
    }
    if (input.corpo !== undefined) {
      valOrThrow(validarTamanho(input.corpo, 'corpo', 3, LIMITES_BANNER.CORPO_MAX));
    }
    if (input.tone !== undefined && !TONES_VALIDOS.includes(input.tone)) {
      throw NotFound('VALIDATION_ERROR', 'tone inválido');
    }
    if (input.ctaLabel !== undefined && input.ctaLabel !== null) {
      valOrThrow(
        validarTamanho(input.ctaLabel, 'ctaLabel', 0, LIMITES_BANNER.CTA_LABEL_MAX),
      );
    }
    if (input.imagemUrl !== undefined) {
      valOrThrow(validarUrlHttps(input.imagemUrl, 'imagemUrl'));
    }
    if (input.ctaUrl !== undefined) {
      valOrThrow(validarUrlHttps(input.ctaUrl, 'ctaUrl'));
    }
    if (
      input.prioridadeOrdem !== undefined &&
      (input.prioridadeOrdem < LIMITES_BANNER.PRIORIDADE_MIN ||
        input.prioridadeOrdem > LIMITES_BANNER.PRIORIDADE_MAX)
    ) {
      throw NotFound(
        'VALIDATION_ERROR',
        `prioridadeOrdem deve estar entre ${LIMITES_BANNER.PRIORIDADE_MIN} e ${LIMITES_BANNER.PRIORIDADE_MAX}`,
      );
    }

    // Calcula publicadoEm/expiraEm efetivos pra validar cruzamento
    const publicadoEmNovo = input.publicadoEm
      ? new Date(input.publicadoEm)
      : alvo.publicadoEm;
    if (Number.isNaN(publicadoEmNovo.getTime())) {
      throw NotFound('VALIDATION_ERROR', 'publicadoEm: data inválida');
    }
    const expiraEmNovo =
      input.expiraEm === undefined
        ? alvo.expiraEm
        : input.expiraEm === null
          ? null
          : new Date(input.expiraEm);
    valOrThrow(validarExpiraEm(expiraEmNovo, publicadoEmNovo));

    // Cruza CTA label/url efetivos
    const ctaLabelEfetivo = input.ctaLabel !== undefined ? input.ctaLabel : alvo.ctaLabel;
    const ctaUrlEfetivo = input.ctaUrl !== undefined ? input.ctaUrl : alvo.ctaUrl;
    const temLabel = !!(ctaLabelEfetivo && ctaLabelEfetivo.trim().length > 0);
    const temUrl = !!(ctaUrlEfetivo && ctaUrlEfetivo.trim().length > 0);
    if (temLabel !== temUrl) {
      throw NotFound(
        'VALIDATION_ERROR',
        'ctaLabel e ctaUrl devem ser preenchidos juntos (ou ambos vazios)',
      );
    }

    // Sanitização dos campos texto que mudaram
    const data: Prisma.SmsBannerUpdateInput = {};
    if (input.titulo !== undefined) {
      data.titulo = sanitizeText(input.titulo, LIMITES_BANNER.TITULO_MAX)!;
    }
    if (input.corpo !== undefined) {
      data.corpo = sanitizeText(input.corpo, LIMITES_BANNER.CORPO_MAX)!;
    }
    if (input.tone !== undefined) data.tone = input.tone;
    if (input.publicadoEm !== undefined) data.publicadoEm = publicadoEmNovo;
    if (input.expiraEm !== undefined) data.expiraEm = expiraEmNovo;
    if (input.imagemUrl !== undefined) data.imagemUrl = input.imagemUrl;
    if (input.ctaLabel !== undefined) {
      data.ctaLabel = sanitizeText(input.ctaLabel, LIMITES_BANNER.CTA_LABEL_MAX);
    }
    if (input.ctaUrl !== undefined) data.ctaUrl = input.ctaUrl;
    if (input.prioridadeOrdem !== undefined) data.prioridadeOrdem = input.prioridadeOrdem;
    if (input.ativo !== undefined) data.ativo = input.ativo;

    if (Object.keys(data).length === 0) {
      throw Conflict('NENHUMA_ALTERACAO', 'Nenhum campo para atualizar');
    }

    const atualizado = await prisma.smsBanner.update({
      where: { id: bannerId },
      data,
      include: { _count: { select: { visualizacoes: true } } },
    });

    await this.audit.registrar({
      acao: 'EDITAR_BANNER',
      recurso: 'SmsBanner',
      recursoId: bannerId,
      atendenteId: ctx.atendenteId,
      payload: {
        prefeituraId: alvo.prefeituraId,
        camposAlterados: Object.keys(data),
        antes: _snapshot(alvo),
        depois: _snapshot(atualizado),
      },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return _toDto(atualizado);
  }
}

export class DeletarBannerAdminUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(scope: AccessScope, bannerId: string, ctx: BannerAuditCtx): Promise<void> {
    const alvo = await prisma.smsBanner.findUnique({ where: { id: bannerId } });
    if (!alvo) throw NotFound('BANNER_NAO_ENCONTRADO', 'Banner não encontrado');
    _ensureBannerAcessivel(scope, alvo.prefeituraId);

    // Cascade: SmsBannerView é deletado pelo onDelete: Cascade do schema.
    await prisma.smsBanner.delete({ where: { id: bannerId } });

    await this.audit.registrar({
      acao: 'DELETAR_BANNER',
      recurso: 'SmsBanner',
      recursoId: bannerId,
      atendenteId: ctx.atendenteId,
      payload: {
        prefeituraId: alvo.prefeituraId,
        snapshot: _snapshot(alvo),
      },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }
}

function _snapshot(b: {
  titulo: string;
  corpo: string;
  tone: BannerTone;
  publicadoEm: Date;
  expiraEm: Date | null;
  imagemUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  prioridadeOrdem: number;
  ativo: boolean;
  prefeituraId: string | null;
}): Record<string, unknown> {
  return {
    titulo: b.titulo,
    corpo: b.corpo,
    tone: b.tone,
    publicadoEm: b.publicadoEm.toISOString(),
    expiraEm: b.expiraEm?.toISOString() ?? null,
    imagemUrl: b.imagemUrl,
    ctaLabel: b.ctaLabel,
    ctaUrl: b.ctaUrl,
    prioridadeOrdem: b.prioridadeOrdem,
    ativo: b.ativo,
    prefeituraId: b.prefeituraId,
  };
}
