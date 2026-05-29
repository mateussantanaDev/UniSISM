import { prisma } from '../../infrastructure/database/prisma';
import { Conflict, Forbidden, NotFound, Unprocessable } from '../../shared/errors';
import { ensurePrefeituraAcessivel, ensureUbsAcessivel, type AccessScope } from '../../shared/scope';
import type { IPasswordHasher } from '../../domain/services/IPasswordHasher';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';
import type { RoleAtendente } from '../../../generated/prisma';

export interface CreateUsuarioInput {
  nome: string;
  email: string;
  matricula: string;
  cpf: string;
  senha: string;
  role: RoleAtendente;
  ubsId?: string;
  prefeituraId?: string;
  telefone?: string;
  cargo?: string;
  funcao?: string;
}

/**
 * Regras de criação:
 *  - DESENVOLVEDOR pode criar qualquer role em qualquer prefeitura/UBS.
 *  - ADMIN pode criar usuários da própria prefeitura (UBS, atendentes, reguladores,
 *    gestores TFD, atendentes TFD e outros admins da MESMA prefeitura). NÃO pode
 *    criar DESENVOLVEDOR.
 *  - Outros roles não chegam aqui (bloqueados pelo middleware requireRole).
 *
 * Coerência por role do criado:
 *  - DESENVOLVEDOR: ignora ubsId/prefeituraId.
 *  - ADMIN / REGULADOR_SMS / GESTOR_TFD / ATENDENTE_TFD: exige prefeituraId,
 *    ubsId deve ser null.
 *  - ATENDENTE_UBS / COORDENADOR_UBS: exige ubsId; prefeituraId herdado da UBS.
 *  - MOTORISTA_TFD: rejeitado aqui — usar POST /v1/tfd/motoristas, que cria
 *    MotoristaTFD + Atendente vinculado + senha provisória atomicamente.
 */
export class CreateUsuarioUseCase {
  constructor(
    private readonly hasher: IPasswordHasher,
    private readonly audit?: IAuditLogger,
  ) {}

  async exec(criadorScope: AccessScope, criadorId: string, input: CreateUsuarioInput) {
    if (input.senha.length < 8) {
      throw Unprocessable('SENHA_FRACA', 'Senha precisa de ao menos 8 caracteres');
    }

    if (input.role === 'DESENVOLVEDOR' && criadorScope.kind !== 'GLOBAL') {
      throw Forbidden(
        'PERMISSAO_INSUFICIENTE',
        'Apenas DESENVOLVEDOR pode criar outro DESENVOLVEDOR',
      );
    }

    let ubsId: string | null = null;
    let prefeituraId: string | null = null;

    switch (input.role) {
      case 'DESENVOLVEDOR':
        ubsId = null;
        prefeituraId = null;
        break;
      case 'ADMIN':
      case 'REGULADOR_SMS':
      case 'GESTOR_TFD':
      case 'ATENDENTE_TFD': {
        if (!input.prefeituraId) {
          throw Unprocessable('PREFEITURA_OBRIGATORIA', 'prefeituraId é obrigatório para esse role');
        }
        const pref = await prisma.prefeitura.findUnique({ where: { id: input.prefeituraId } });
        if (!pref) throw NotFound('PREFEITURA_NAO_ENCONTRADA', 'Prefeitura não encontrada');
        ensurePrefeituraAcessivel(criadorScope, pref.id);
        prefeituraId = pref.id;
        break;
      }
      case 'ATENDENTE_UBS':
      case 'COORDENADOR_UBS': {
        if (!input.ubsId) {
          throw Unprocessable('UBS_OBRIGATORIA', 'ubsId é obrigatório para esse role');
        }
        const ubs = await prisma.ubs.findUnique({ where: { id: input.ubsId } });
        if (!ubs) throw NotFound('UBS_NAO_ENCONTRADA', 'UBS não encontrada');
        ensureUbsAcessivel(criadorScope, { id: ubs.id, prefeituraId: ubs.prefeituraId });
        ubsId = ubs.id;
        prefeituraId = ubs.prefeituraId;
        break;
      }
      case 'MOTORISTA_TFD':
        throw Unprocessable(
          'ROTA_INCORRETA_MOTORISTA',
          'Motoristas TFD devem ser criados via POST /v1/tfd/motoristas (cria também o cadastro operacional e senha provisória).',
        );
    }

    const matricula = input.matricula.toUpperCase();
    const email = input.email.toLowerCase();

    const dup = await prisma.atendente.findFirst({
      where: { OR: [{ matricula }, { email }, { cpf: input.cpf }] },
    });
    if (dup) throw Conflict('USUARIO_DUPLICADO', 'Matrícula, e-mail ou CPF já cadastrados');

    const senhaHash = await this.hasher.hash(input.senha);

    const criado = await prisma.atendente.create({
      data: {
        nome: input.nome,
        email,
        matricula,
        cpf: input.cpf,
        telefone: input.telefone ?? null,
        cargo: input.cargo ?? 'ATENDENTE DE REGULAÇÃO',
        funcao: input.funcao ?? 'Operador do canal de ingestão de encaminhamentos',
        role: input.role,
        senhaHash,
        ubsId,
        prefeituraId,
        criadoPorId: criadorId,
      },
      include: { ubs: { include: { prefeitura: true } }, prefeitura: true },
    });

    await this.audit?.registrar({
      acao: 'CRIAR_USUARIO',
      recurso: 'Atendente',
      recursoId: criado.id,
      atendenteId: criadorId,
      payload: {
        matricula: criado.matricula,
        role: criado.role,
        ubsId: criado.ubsId,
        prefeituraId: criado.prefeituraId ?? criado.ubs?.prefeituraId,
      },
    });

    return {
      id: criado.id,
      nome: criado.nome,
      matricula: criado.matricula,
      email: criado.email,
      role: criado.role,
      ubs: criado.ubs ? { id: criado.ubs.id, nome: criado.ubs.nome } : null,
      prefeitura: criado.ubs?.prefeitura ?? criado.prefeitura,
    };
  }
}
