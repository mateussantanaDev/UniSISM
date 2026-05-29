/**
 * Registra/revoga o FCM token do dispositivo do motorista para push
 * notifications. Audit registrado na cadeia TFD.
 *
 * O envio real do push é responsabilidade de outro componente (worker FCM
 * que lê `motorista.fcmToken` quando uma viagem é criada/alterada/cancelada).
 */
import type { Request } from 'express';
import { prisma } from '../../../../infrastructure/database/prisma';
import { Unprocessable } from '../../../../shared/errors';
import type { ITfdAuditLogger } from '../../../tfd/infrastructure/TfdAuditLogger';
import type { MotoristaAuthContext } from '../../presentation/middlewares/authenticateMotorista';

export class RegistrarFcmTokenUseCase {
  constructor(private readonly audit: ITfdAuditLogger) {}

  async exec(auth: MotoristaAuthContext, fcmToken: string, req: Request): Promise<void> {
    const t = fcmToken.trim();
    if (t.length < 20) {
      throw Unprocessable('PAYLOAD_INVALIDO', 'fcmToken inválido');
    }
    await prisma.motoristaTFD.update({
      where: { id: auth.motoristaId },
      data: { fcmToken: t },
    });
    await this.audit.registrar({
      prefeituraId: auth.prefeituraId,
      acao: 'FCM_TOKEN_REGISTRADO',
      recursoTipo: 'MOTORISTA',
      recursoId: auth.motoristaId,
      operadorId: auth.atendenteId,
      operadorNome: auth.nome,
      operadorMatricula: auth.matricula,
      operadorRole: 'MOTORISTA_TFD',
      ip: req.ip ?? '0.0.0.0',
      userAgent: req.header('user-agent') ?? 'unknown',
    });
  }
}

export class RevogarFcmTokenUseCase {
  constructor(private readonly audit: ITfdAuditLogger) {}

  async exec(auth: MotoristaAuthContext, req: Request): Promise<void> {
    await prisma.motoristaTFD.update({
      where: { id: auth.motoristaId },
      data: { fcmToken: null },
    });
    await this.audit.registrar({
      prefeituraId: auth.prefeituraId,
      acao: 'FCM_TOKEN_REVOGADO',
      recursoTipo: 'MOTORISTA',
      recursoId: auth.motoristaId,
      operadorId: auth.atendenteId,
      operadorNome: auth.nome,
      operadorMatricula: auth.matricula,
      operadorRole: 'MOTORISTA_TFD',
      ip: req.ip ?? '0.0.0.0',
      userAgent: req.header('user-agent') ?? 'unknown',
    });
  }
}
