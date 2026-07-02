import { prisma } from '../database/prisma';
import { getCache } from './Cache';
import { logger } from '../logger';

export async function invalidarCacheArvorePorUbs(ubsId: string): Promise<void> {
  try {
    const ubs = await prisma.ubs.findUnique({
      where: { id: ubsId },
      select: { prefeituraId: true },
    });
    if (ubs) {
      const cache = getCache();
      await cache.delByPrefix(`arvore:${ubs.prefeituraId}:`);
      await cache.delByPrefix(`arvore:GLOBAL:`);
      logger.info(
        { prefeituraId: ubs.prefeituraId, ubsId },
        '✓ [Cache] Cache da árvore invalidado para a prefeitura e GLOBAL.'
      );
    }
  } catch (err) {
    logger.warn({ err, ubsId }, '⚠️ falha ao invalidar cache da árvore por ubs');
  }
}
