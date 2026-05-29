/**
 * Banners SMS — comunicados/campanhas exibidos na home do app paciente.
 * Read-only do lado do paciente; CRUD admin via Face 2 (futuro — endpoints separados).
 *
 * Filtro automático:
 *   - ativo = true
 *   - (expiraEm IS NULL OR expiraEm > now())
 *   - (prefeituraId IS NULL OR prefeituraId = paciente.ubsVinculada.prefeituraId)
 *     → banners globais aparecem pra todos; específicos só pra prefeitura dona
 */
import { prisma } from '../../../../infrastructure/database/prisma';
import { NotFound } from '../../../../shared/errors';
import { logger } from '../../../../infrastructure/logger';
import { sanitizeText } from '../../../../shared/sanitizeText';

export interface SmsBannerDto {
  id: string;
  titulo: string;
  corpo: string;
  tone: 'URGENTE' | 'CAMPANHA' | 'INFO' | 'ATENCAO';
  publicadoEm: string;
  expiraEm: string | null;
  imagemUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  prioridadeOrdem: number;
}

/** Resolve a prefeituraId do paciente via UBS vinculada. */
async function _prefeituraIdDoPaciente(contaId: string): Promise<string | null> {
  const conta = await prisma.pacienteConta.findUnique({
    where: { id: contaId },
    include: { ubsVinculada: { select: { prefeituraId: true } } },
  });
  return conta?.ubsVinculada?.prefeituraId ?? null;
}

export class ListarBannersAtivosUseCase {
  async exec(contaId: string): Promise<SmsBannerDto[]> {
    const prefeituraId = await _prefeituraIdDoPaciente(contaId);
    const now = new Date();

    const rows = await prisma.smsBanner.findMany({
      where: {
        ativo: true,
        OR: [{ expiraEm: null }, { expiraEm: { gt: now } }],
        AND: prefeituraId
          ? [{ OR: [{ prefeituraId: null }, { prefeituraId }] }]
          : [{ prefeituraId: null }],
      },
      orderBy: [{ prioridadeOrdem: 'desc' }, { publicadoEm: 'desc' }],
      take: 20,
    });

    return rows.map(_toDto);
  }
}

export class ObterBannerUseCase {
  async exec(bannerId: string, contaId: string): Promise<SmsBannerDto> {
    const banner = await prisma.smsBanner.findUnique({ where: { id: bannerId } });
    if (!banner || !banner.ativo) {
      throw NotFound('BANNER_NAO_ENCONTRADO', 'Aviso não encontrado.');
    }
    if (banner.expiraEm && banner.expiraEm.getTime() <= Date.now()) {
      throw NotFound('BANNER_NAO_ENCONTRADO', 'Este aviso já expirou.');
    }
    // Filtro por prefeitura (anti-leak).
    if (banner.prefeituraId) {
      const pref = await _prefeituraIdDoPaciente(contaId);
      if (pref !== banner.prefeituraId) {
        throw NotFound('BANNER_NAO_ENCONTRADO', 'Aviso não encontrado.');
      }
    }
    return _toDto(banner);
  }
}

export class MarcarBannerVistoUseCase {
  async exec(bannerId: string, contaId: string): Promise<void> {
    // Idempotente — UPSERT. Falha silenciosa em caso de bannerId inválido.
    try {
      await prisma.smsBannerView.upsert({
        where: { bannerId_contaId: { bannerId, contaId } },
        create: { bannerId, contaId },
        update: {},
      });
    } catch (err) {
      logger.debug({ err, bannerId, contaId }, '[banner-view] falhou silenciosamente');
    }
  }
}

function _toDto(b: {
  id: string;
  titulo: string;
  corpo: string;
  tone: 'URGENTE' | 'CAMPANHA' | 'INFO' | 'ATENCAO';
  publicadoEm: Date;
  expiraEm: Date | null;
  imagemUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  prioridadeOrdem: number;
}): SmsBannerDto {
  return {
    id: b.id,
    // Defesa em profundidade: backend admin já sanitiza no create/update,
    // mas re-sanitizamos aqui pra casos: (a) banners legados pré v0.15,
    // (b) eventual bypass de admin no futuro.
    titulo: sanitizeText(b.titulo, 80) ?? '',
    corpo: sanitizeText(b.corpo, 400) ?? '',
    tone: b.tone,
    publicadoEm: b.publicadoEm.toISOString(),
    expiraEm: b.expiraEm?.toISOString() ?? null,
    imagemUrl: b.imagemUrl,
    ctaLabel: sanitizeText(b.ctaLabel, 30),
    ctaUrl: b.ctaUrl,
    prioridadeOrdem: b.prioridadeOrdem,
  };
}
