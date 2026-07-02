/**
 * Exclusão administrativa (soft delete) de encaminhamento.
 *
 * Somente ADMIN (da prefeitura) ou DESENVOLVEDOR. Atendentes da UBS não podem
 * excluir — para cancelar uma solicitação em andamento, a Regulação deve
 * `REJEITAR` (transição auditável). O DELETE é reservado para casos administrativos:
 * duplicidade, erro grosseiro de cadastro, pedido do próprio paciente (LGPD).
 */
import { Forbidden, NotFound } from '../../shared/errors';
import { prisma } from '../../infrastructure/database/prisma';
import { whereByScopeViaUbs } from '../../infrastructure/database/scopeWhere';
import type { AccessScope } from '../../shared/scope';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';
import { invalidarCacheArvorePorUbs } from '../../infrastructure/cache/arvoreCacheInvalidator';


export class DeleteEncaminhamentoUseCase {
  constructor(private readonly audit?: IAuditLogger) {}

  async exec(
    scope: AccessScope,
    editorId: string,
    encaminhamentoId: string,
    motivo: string,
  ): Promise<void> {
    if (scope.kind === 'UBS') {
      throw Forbidden(
        'PERMISSAO_INSUFICIENTE',
        'Atendentes de UBS não podem excluir encaminhamento. Use rejeitar.',
      );
    }

    const alvo = await prisma.encaminhamento.findFirst({
      where: { id: encaminhamentoId, ...whereByScopeViaUbs(scope) },
    });
    if (!alvo || alvo.deletadoEm) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }

    await prisma.encaminhamento.update({
      where: { id: encaminhamentoId },
      data: { deletadoEm: new Date() },
    });

    // Registra evento administrativo na timeline (preserva trilha)
    await prisma.eventoTimeline.create({
      data: {
        encaminhamentoId,
        tipo: 'OBSERVACAO',
        titulo: 'Excluído administrativamente',
        descricao: motivo.trim() || 'Exclusão administrativa',
        autor: 'ADMINISTRADOR',
        autorPapel: 'Admin / Suporte',
      },
    });

    await this.audit?.registrar({
      acao: 'EXCLUIR_ENCAMINHAMENTO',
      recurso: 'Encaminhamento',
      recursoId: encaminhamentoId,
      atendenteId: editorId,
      payload: {
        protocolo: alvo.protocolo,
        statusAnterior: alvo.status,
        ubsId: alvo.ubsId,
        motivo: motivo.slice(0, 500),
      },
    });

    void invalidarCacheArvorePorUbs(alvo.ubsId);
  }
}
