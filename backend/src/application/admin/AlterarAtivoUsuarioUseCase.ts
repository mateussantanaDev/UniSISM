import { authorizeUsuarioManagement } from './authorizeUsuarioManagement';
import { prisma } from '../../infrastructure/database/prisma';
import { Conflict, Forbidden, NotFound } from '../../shared/errors';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';
import type { AccessScope } from '../../shared/scope';
import { ensurePrefeituraAcessivel } from '../../shared/scope';

export class AlterarAtivoUsuarioUseCase {
  constructor(private readonly audit?: IAuditLogger) {}

  async exec(
    scope: AccessScope,
    editorId: string,
    alvoId: string,
    ativo: boolean,
  ): Promise<{ id: string; ativo: boolean }> {
    if (editorId === alvoId && !ativo) {
      throw Conflict('AUTO_DESATIVACAO_PROIBIDA', 'Você não pode desativar a própria conta');
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
      throw Forbidden('PERMISSAO_INSUFICIENTE', 'Apenas DEV pode alterar outro DEV');
    }
    const alvoPref = alvo.prefeituraId ?? alvo.ubs?.prefeituraId;
    if (alvoPref) ensurePrefeituraAcessivel(scope, alvoPref);

    const atualizado = await prisma.atendente.update({
      where: { id: alvoId },
      data: { ativo },
    });

    if (!ativo) {
      // revoga sessões se desativou
      await prisma.sessao.updateMany({
        where: { atendenteId: alvoId, revogadaEm: null },
        data: { revogadaEm: new Date() },
      });
    }

    await this.audit?.registrar({
      acao: ativo ? 'ATIVAR_USUARIO' : 'DESATIVAR_USUARIO',
      recurso: 'Atendente',
      recursoId: alvoId,
      atendenteId: editorId,
      payload: { matricula: alvo.matricula, novoEstado: ativo },
    });

    return { id: atualizado.id, ativo: atualizado.ativo };
  }
}
