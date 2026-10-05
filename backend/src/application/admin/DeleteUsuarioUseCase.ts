import { authorizeUsuarioManagement } from './authorizeUsuarioManagement';
import { prisma } from '../../infrastructure/database/prisma';
import { Conflict, Forbidden, NotFound } from '../../shared/errors';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';
import type { AccessScope } from '../../shared/scope';
import { ensurePrefeituraAcessivel } from '../../shared/scope';

/**
 * Soft delete de um usuário: marca `deletadoEm` + desativa + revoga sessões.
 * Nunca apaga fisicamente (retenção LGPD + audit).
 */
export class DeleteUsuarioUseCase {
  constructor(private readonly audit?: IAuditLogger) {}

  async exec(scope: AccessScope, editorId: string, alvoId: string) {
    if (editorId === alvoId) {
      throw Conflict('AUTO_EXCLUSAO_PROIBIDA', 'Você não pode desativar a própria conta');
    }

    const alvo = await prisma.atendente.findUnique({
      where: { id: alvoId },
      include: { ubs: true },
    });
    if (!alvo || alvo.deletadoEm) {
      throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');
    }
    await authorizeUsuarioManagement(editorId, alvo);

    if (alvo.role === 'DESENVOLVEDOR' && scope.kind !== 'GLOBAL') {
      throw Forbidden('PERMISSAO_INSUFICIENTE', 'Apenas DESENVOLVEDOR pode excluir outro DEV');
    }
    const alvoPref = alvo.prefeituraId ?? alvo.ubs?.prefeituraId;
    if (alvoPref) ensurePrefeituraAcessivel(scope, alvoPref);

    await prisma.$transaction(async (tx) => {
      await tx.atendente.update({
        where: { id: alvoId },
        data: { ativo: false, deletadoEm: new Date() },
      });
      await tx.sessao.updateMany({
        where: { atendenteId: alvoId, revogadaEm: null },
        data: { revogadaEm: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { atendenteId: alvoId, revogadoEm: null },
        data: { revogadoEm: new Date() },
      });
    });

    await this.audit?.registrar({
      acao: 'EXCLUIR_USUARIO',
      recurso: 'Atendente',
      recursoId: alvoId,
      atendenteId: editorId,
      payload: { matricula: alvo.matricula, role: alvo.role },
    });
  }
}
