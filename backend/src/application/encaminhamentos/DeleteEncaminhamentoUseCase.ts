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

    const editor = await prisma.atendente.findUnique({
      where: { id: editorId },
      select: { id: true, nome: true, role: true },
    });
    const editorNome = editor?.nome || 'Operador Responsável';
    const editorRole = editor?.role || 'ATENDENTE';

    await prisma.encaminhamento.update({
      where: { id: encaminhamentoId },
      data: {
        deletadoEm: new Date(),
        deletadoPorId: editorId,
        deletadoPorNome: editorNome,
        motivoExclusao: motivo.trim(),
      },
    });

    // Registra evento administrativo na timeline (preserva trilha completa)
    await prisma.eventoTimeline.create({
      data: {
        encaminhamentoId,
        tipo: 'OBSERVACAO',
        titulo: 'Excluído do Sistema',
        descricao: `Excluído por ${editorNome} (${editorRole}). Motivo: ${motivo.trim()}`,
        autor: editorNome,
        autorPapel: editorRole,
      },
    });

    await this.audit?.registrar({
      acao: 'EXCLUIR_ENCAMINHAMENTO',
      recurso: 'Encaminhamento',
      recursoId: encaminhamentoId,
      atendenteId: editorId,
      payload: {
        protocolo: alvo.protocolo,
        pacienteNome: alvo.pacienteNome,
        statusAnterior: alvo.status,
        ubsId: alvo.ubsId,
        operadorNome: editorNome,
        operadorRole: editorRole,
        motivo: motivo.slice(0, 500),
      },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_EXCLUIR_ENCAMINHAMENTO',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: encaminhamentoId,
        atendenteId: editorId,
        payload: {
          protocolo: alvo.protocolo,
          pacienteNome: alvo.pacienteNome,
          statusAnterior: alvo.status,
          ubsId: alvo.ubsId,
          operadorNome: editorNome,
          operadorRole: editorRole,
          motivo: motivo.trim(),
        },
      },
    });

    void invalidarCacheArvorePorUbs(alvo.ubsId);
  }
}
