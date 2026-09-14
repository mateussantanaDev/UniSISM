import { prisma } from '../../infrastructure/database/prisma';
import { Conflict, Forbidden, NotFound } from '../../shared/errors';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';
import type { AccessScope } from '../../shared/scope';
import { ensurePrefeituraAcessivel, ensureUbsAcessivel } from '../../shared/scope';

import type { RoleAtendente } from '../../../generated/prisma';

export interface UpdateUsuarioInput {
  nome?: string;
  email?: string;
  telefone?: string;
  cargo?: string;
  funcao?: string;
  role?: RoleAtendente;
  tipoUnidade?: string | null;
  unidadeId?: string | null;
  ubsId?: string | null;
  prefeituraId?: string | null;
}

/**
 * Edita campos de um usuário.
 */
export class UpdateUsuarioUseCase {
  constructor(private readonly audit?: IAuditLogger) {}

  async exec(scope: AccessScope, editorId: string, alvoId: string, input: UpdateUsuarioInput) {
    const alvo = await prisma.atendente.findUnique({
      where: { id: alvoId },
      include: { ubs: true, prefeitura: true },
    });
    if (!alvo || alvo.deletadoEm) {
      throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');
    }

    // Escopo: editor deve ter acesso ao escopo atual do alvo.
    if (alvo.role !== 'DESENVOLVEDOR') {
      const alvoPref = alvo.prefeituraId ?? alvo.ubs?.prefeituraId;
      if (alvoPref) ensurePrefeituraAcessivel(scope, alvoPref);
    } else if (scope.kind !== 'GLOBAL') {
      throw Forbidden('PERMISSAO_INSUFICIENTE', 'Apenas DESENVOLVEDOR pode editar outro DEV');
    }

    // Validação de novo ubsId/prefeituraId (se vier)
    if (input.ubsId !== undefined && input.ubsId !== null) {
      const ubs = await prisma.ubs.findUnique({ where: { id: input.ubsId } });
      if (!ubs) throw NotFound('UBS_NAO_ENCONTRADA', 'UBS não encontrada');
      ensureUbsAcessivel(scope, { id: ubs.id, prefeituraId: ubs.prefeituraId });
    }
    if (input.prefeituraId !== undefined && input.prefeituraId !== null) {
      const pref = await prisma.prefeitura.findUnique({ where: { id: input.prefeituraId } });
      if (!pref) throw NotFound('PREFEITURA_NAO_ENCONTRADA', 'Prefeitura não encontrada');
      ensurePrefeituraAcessivel(scope, pref.id);
    }

    // Unicidade de email
    if (input.email && input.email.toLowerCase() !== alvo.email) {
      const exists = await prisma.atendente.findUnique({
        where: { email: input.email.toLowerCase() },
      });
      if (exists) throw Conflict('USUARIO_DUPLICADO', 'Email já cadastrado');
    }

    const data: Record<string, unknown> = {};
    if (input.nome !== undefined) data['nome'] = input.nome;
    if (input.email !== undefined) data['email'] = input.email.toLowerCase();
    if (input.telefone !== undefined) data['telefone'] = input.telefone || null;
    if (input.role !== undefined) data['role'] = input.role;
    if (input.tipoUnidade !== undefined) data['tipoUnidade'] = input.tipoUnidade;
    if (input.unidadeId !== undefined) data['unidadeId'] = input.unidadeId;
    if (input.ubsId !== undefined) data['ubsId'] = input.ubsId;
    if (input.prefeituraId !== undefined) data['prefeituraId'] = input.prefeituraId;

    if (input.cargo !== undefined) {
      data['cargo'] = input.cargo;
    } else if (input.role !== undefined || input.tipoUnidade !== undefined) {
      const tipo = (input.tipoUnidade ?? alvo.tipoUnidade)?.toUpperCase();
      const role = input.role ?? alvo.role;
      if (tipo === 'CEO') {
        if (role === 'COORDENADOR_UBS') data['cargo'] = 'Coordenador(a) do CEO';
        else if (role === 'ADMIN') data['cargo'] = 'Diretor(a) / Gestor Geral do CEO';
        else if (role === 'MEDICO') data['cargo'] = 'Cirurgião-Dentista Especialista';
        else if (role === 'MEDICO_ESPECIALISTA') data['cargo'] = 'Cirurgião-Dentista Plantonista';
        else if (role === 'ATENDENTE_CENTRO' || role === 'ATENDENTE_UBS') data['cargo'] = 'Atendente / Recepção CEO';
        else if (role === 'REGULADOR_SMS') data['cargo'] = 'Regulador(a) do CEO';
      } else if (tipo === 'CEM') {
        if (role === 'COORDENADOR_UBS') data['cargo'] = 'Coordenador(a) do CEM';
        else if (role === 'ADMIN') data['cargo'] = 'Diretor(a) / Gestor Geral do CEM';
        else if (role === 'MEDICO') data['cargo'] = 'Médico(a) Especialista';
        else if (role === 'MEDICO_ESPECIALISTA') data['cargo'] = 'Médico(a) Plantonista';
        else if (role === 'ATENDENTE_CENTRO' || role === 'ATENDENTE_UBS') data['cargo'] = 'Atendente / Recepção CEM';
        else if (role === 'REGULADOR_SMS') data['cargo'] = 'Regulador(a) do CEM';
      }
    }

    if (input.funcao !== undefined) {
      data['funcao'] = input.funcao;
    }

    const atualizado = await prisma.atendente.update({
      where: { id: alvoId },
      data,
      include: { ubs: { include: { prefeitura: true } }, prefeitura: true },
    });

    await this.audit?.registrar({
      acao: 'EDITAR_USUARIO',
      recurso: 'Atendente',
      recursoId: alvoId,
      atendenteId: editorId,
      payload: { campos: Object.keys(data) },
    });

    return {
      id: atualizado.id,
      nome: atualizado.nome,
      matricula: atualizado.matricula,
      email: atualizado.email,
      role: atualizado.role,
      cargo: atualizado.cargo,
      funcao: atualizado.funcao,
      tipoUnidade: atualizado.tipoUnidade,
      unidadeId: atualizado.unidadeId ?? atualizado.ubsId ?? null,
      ativo: atualizado.ativo,
      ubs: atualizado.ubs ? { id: atualizado.ubs.id, nome: atualizado.ubs.nome } : null,
      prefeitura: atualizado.prefeitura ?? atualizado.ubs?.prefeitura ?? null,
    };
  }
}
