/**
 * Scanner de antivírus (ClamAV opcional).
 *
 * Uso:
 *   CLAMAV_HOST=localhost · CLAMAV_PORT=3310
 *
 * Quando env não está configurada, retorna um scanner no-op que marca
 * todo upload como LIMPO imediatamente (adequado para dev).
 *
 * Produção: configurar o daemon clamd + atualizações de assinatura
 * (docker image `clamav/clamav` já inclui freshclam).
 */
import NodeClam from 'clamscan';
import { env } from '../../shared/env';
import { prisma } from '../database/prisma';
import { logger } from '../logger';
import { avScanDuration, avScanInfectados } from '../metrics/prometheus';

export type ScanResultado = 'LIMPO' | 'INFECTADO' | 'FALHOU';

export interface IAnexoScanner {
  /** Escaneia e atualiza `AnexoDocumento.scanStatus`. Não bloqueia o fluxo principal. */
  escanearEAtualizar(anexoId: string, caminhoAbsoluto: string): Promise<ScanResultado>;
  isAtivo(): boolean;
}

class NoopScanner implements IAnexoScanner {
  async escanearEAtualizar(anexoId: string): Promise<ScanResultado> {
    // Em dev, marcamos como LIMPO imediatamente.
    await prisma.anexoDocumento.update({
      where: { id: anexoId },
      data: { scanStatus: 'LIMPO', scanEm: new Date() },
    });
    return 'LIMPO';
  }
  isAtivo(): boolean {
    return false;
  }
}

class ClamavScanner implements IAnexoScanner {
  private clamPromise: Promise<NodeClam> | null = null;

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  private getClam(): Promise<NodeClam> {
    if (this.clamPromise) return this.clamPromise;
    const init = new NodeClam().init({
      clamdscan: {
        host: this.host,
        port: this.port,
        timeout: 60_000,
      },
      preference: 'clamdscan',
    });
    this.clamPromise = init;
    return init;
  }

  async escanearEAtualizar(anexoId: string, caminhoAbsoluto: string): Promise<ScanResultado> {
    const fim = avScanDuration.startTimer();
    try {
      const clam = await this.getClam();
      const { isInfected } = await clam.scanFile(caminhoAbsoluto);
      const resultado: ScanResultado = isInfected ? 'INFECTADO' : 'LIMPO';
      if (isInfected) avScanInfectados.inc();
      await prisma.anexoDocumento.update({
        where: { id: anexoId },
        data: { scanStatus: resultado, scanEm: new Date() },
      });
      return resultado;
    } catch (err) {
      logger.warn({ err, anexoId }, 'ClamAV falhou — marcando como FALHOU');
      try {
        await prisma.anexoDocumento.update({
          where: { id: anexoId },
          data: { scanStatus: 'FALHOU', scanEm: new Date() },
        });
      } catch {
        /* ignora */
      }
      return 'FALHOU';
    } finally {
      fim();
    }
  }

  isAtivo(): boolean {
    return true;
  }
}

export function buildScanner(): IAnexoScanner {
  const host = env.CLAMAV_HOST;
  const port = env.CLAMAV_PORT;
  if (!host) {
    logger.info('scanner: no-op (ClamAV desativado — defina CLAMAV_HOST)');
    return new NoopScanner();
  }
  logger.info({ host, port }, 'scanner: ClamAV');
  return new ClamavScanner(host, port);
}
