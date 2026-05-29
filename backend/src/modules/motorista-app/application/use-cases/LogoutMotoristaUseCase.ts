/**
 * Logout do app do motorista.
 *
 * Como o JWT é stateless (sem refresh), o "logout" aqui faz:
 *  1. Limpa `motorista.fcmToken` (paramos de enviar push pro device).
 *  2. Registra evento na cadeia TFD.
 *
 * O token JWT em si continua válido até expirar — o app DEVE apagar o
 * SecureStorage local. Em incidente, gestor desativa o motorista
 * (status=INATIVO) pra forçar invalidação na próxima chamada (o middleware
 * authenticateMotorista checa status a cada request).
 */
import type { Request } from 'express';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { ITfdAuditLogger } from '../../../tfd/infrastructure/TfdAuditLogger';
import type { MotoristaAuthContext } from '../../presentation/middlewares/authenticateMotorista';

export class LogoutMotoristaUseCase {
  constructor(private readonly audit: ITfdAuditLogger) {}

  async exec(auth: MotoristaAuthContext, req: Request): Promise<void> {
    await prisma.motoristaTFD.update({
      where: { id: auth.motoristaId },
      data: { fcmToken: null },
    });

    await this.audit.registrar({
      prefeituraId: auth.prefeituraId,
      acao: 'MOTORISTA_LOGOUT',
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
