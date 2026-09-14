import { prisma } from '../../infrastructure/database/prisma';
import { Forbidden, NotFound, Unprocessable } from '../../shared/errors';
import type { IPasswordHasher } from '../../domain/services/IPasswordHasher';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';
import type { AccessScope } from '../../shared/scope';
import { ensurePrefeituraAcessivel } from '../../shared/scope';

/**
 * Admin define uma nova senha pro usuário (provisória). Todas as sessões ativas
 * são revogadas. O usuário deve trocar a senha no próximo login (flag
 * `senhaAlteradaEm` retroage pra forçar expiração).
 */
export class ResetarSenhaUsuarioUseCase {
  constructor(
    private readonly hasher: IPasswordHasher,
    private readonly audit?: IAuditLogger,
  ) {}

  async exec(
    scope: AccessScope,
    editorId: string,
    alvoId: string,
    novaSenha: string,
  ): Promise<void> {
    if (novaSenha.length < 8) {
      throw Unprocessable('SENHA_FRACA', 'Nova senha deve ter ao menos 8 caracteres');
    }

    const alvo = await prisma.atendente.findUnique({
      where: { id: alvoId },
      include: { ubs: true },
    });
    if (!alvo || alvo.deletadoEm) {
      throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');
    }
    if (alvo.role === 'DESENVOLVEDOR' && scope.kind !== 'GLOBAL') {
      throw Forbidden('PERMISSAO_INSUFICIENTE', 'Apenas DEV pode resetar senha de outro DEV');
    }
    const alvoPref = alvo.prefeituraId ?? alvo.ubs?.prefeituraId;
    if (alvoPref) ensurePrefeituraAcessivel(scope, alvoPref);

    const hash = await this.hasher.hash(novaSenha);
    await prisma.atendente.update({
      where: { id: alvoId },
      data: { senhaHash: hash, senhaAlteradaEm: new Date() },
    });

    // Revoga todas as sessões
    await prisma.sessao.updateMany({
      where: { atendenteId: alvoId, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });
    await prisma.refreshToken.updateMany({
      where: { atendenteId: alvoId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });

    await this.audit?.registrar({
      acao: 'RESETAR_SENHA_USUARIO',
      recurso: 'Atendente',
      recursoId: alvoId,
      atendenteId: editorId,
      payload: { matricula: alvo.matricula },
    });
  }
}
