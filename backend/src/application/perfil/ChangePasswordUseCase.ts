import { BadRequest, NotFound, Unauthorized } from '../../shared/errors';
import type { IAtendenteRepository } from '../../domain/repositories/IAtendenteRepository';
import type { IPasswordHasher } from '../../domain/services/IPasswordHasher';
import type { ISessaoRepository } from '../../domain/repositories/ISessaoRepository';

export class ChangePasswordUseCase {
  constructor(
    private readonly atendentes: IAtendenteRepository,
    private readonly sessoes: ISessaoRepository,
    private readonly hasher: IPasswordHasher,
  ) {}

  async exec(atendenteId: string, senhaAtual: string, novaSenha: string): Promise<void> {
    if (novaSenha.length < 8) {
      throw BadRequest('SENHA_FRACA', 'A nova senha deve ter ao menos 8 caracteres');
    }
    const a = await this.atendentes.buscarPorId(atendenteId);
    if (!a) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const ok = await this.hasher.compare(senhaAtual, a.senhaHash);
    if (!ok) throw Unauthorized('SENHA_ATUAL_INCORRETA', 'Senha atual incorreta');
    if (senhaAtual === novaSenha) {
      throw BadRequest('SENHA_REUTILIZADA', 'Escolha uma senha diferente da senha atual');
    }

    const novoHash = await this.hasher.hash(novaSenha);
    await this.atendentes.atualizarSenha(atendenteId, novoHash);
    await this.sessoes.revogarTodas(atendenteId);
    await this.atendentes.registrarAtividade(atendenteId, 'Senha alterada');
  }
}
