/**
 * Edição de UBS.
 *
 * Regras:
 *   - DESENVOLVEDOR: qualquer UBS.
 *   - ADMIN: apenas UBSs da sua prefeitura.
 *   - Campos editáveis: TODOS exceto prefeituraId (UBS muda de prefeitura ≠ outra unidade).
 *   - Audit log com snapshot antes/depois (LGPD/CFM rastreabilidade administrativa).
 */
import { Prisma } from '../../../generated/prisma';
import { Conflict, NotFound } from '../../shared/errors';
import { prisma } from '../../infrastructure/database/prisma';
import { ensurePrefeituraAcessivel, type AccessScope } from '../../shared/scope';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';
import {
  validarCep,
  validarTelefoneBr,
  validarEmail,
  validarLatitude,
  validarLongitude,
  validarHorarios,
  normalizarCep,
  normalizarTelefone,
  valOrThrow,
  type HorariosFuncionamento,
} from '../../shared/ubsValidators';

export interface UpdateUbsInput {
  nome?: string;
  municipio?: string;
  uf?: string;
  endereco?: string | null;
  cnes?: string | null;
  ativa?: boolean;

  // Novos campos (v0.13)
  bairro?: string | null;
  cep?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  horarios?: HorariosFuncionamento | null;
  observacoes?: string | null;
}

export interface AuditContext {
  atendenteId: string;
  ip?: string | null;
  userAgent?: string | null;
}

export class UpdateUbsUseCase {
  constructor(private readonly audit?: IAuditLogger) {}

  async exec(
    scope: AccessScope,
    editorId: string,
    ubsId: string,
    input: UpdateUbsInput,
    ctxExtra?: { ip?: string | null; userAgent?: string | null },
  ): Promise<{ id: string; nome: string; ativa: boolean }> {
    const alvo = await prisma.ubs.findUnique({ where: { id: ubsId } });
    if (!alvo || alvo.deletadoEm) {
      throw NotFound('UBS_NAO_ENCONTRADA', 'UBS não encontrada');
    }
    ensurePrefeituraAcessivel(scope, alvo.prefeituraId);

    // Validações dos campos novos
    valOrThrow('cep', validarCep(input.cep));
    valOrThrow('telefone', validarTelefoneBr(input.telefone));
    valOrThrow('whatsapp', validarTelefoneBr(input.whatsapp));
    valOrThrow('email', validarEmail(input.email));
    valOrThrow('latitude', validarLatitude(input.latitude));
    valOrThrow('longitude', validarLongitude(input.longitude));
    valOrThrow('horarios', validarHorarios(input.horarios));

    if (input.cnes !== undefined && input.cnes !== null && input.cnes !== alvo.cnes) {
      const dup = await prisma.ubs.findUnique({ where: { cnes: input.cnes } });
      if (dup && dup.id !== ubsId) {
        throw Conflict('UBS_DUPLICADA', 'CNES já cadastrado');
      }
    }

    const data: Prisma.UbsUpdateInput = {};
    if (input.nome !== undefined) data.nome = input.nome;
    if (input.municipio !== undefined) data.municipio = input.municipio;
    if (input.uf !== undefined) data.uf = input.uf;
    if (input.endereco !== undefined) data.endereco = input.endereco;
    if (input.cnes !== undefined) data.cnes = input.cnes;
    if (input.ativa !== undefined) data.ativa = input.ativa;

    // Novos campos
    if (input.bairro !== undefined) data.bairro = input.bairro;
    if (input.cep !== undefined) {
      data.cep = input.cep === null || input.cep === '' ? null : normalizarCep(input.cep);
    }
    if (input.telefone !== undefined) {
      data.telefone =
        input.telefone === null || input.telefone === ''
          ? null
          : normalizarTelefone(input.telefone);
    }
    if (input.whatsapp !== undefined) {
      data.whatsapp =
        input.whatsapp === null || input.whatsapp === ''
          ? null
          : normalizarTelefone(input.whatsapp);
    }
    if (input.email !== undefined) {
      data.email =
        input.email === null || input.email === ''
          ? null
          : input.email.trim().toLowerCase();
    }
    if (input.latitude !== undefined) data.latitude = input.latitude;
    if (input.longitude !== undefined) data.longitude = input.longitude;
    if (input.horarios !== undefined) {
      data.horarios =
        input.horarios === null ? Prisma.JsonNull : (input.horarios as Prisma.InputJsonValue);
    }
    if (input.observacoes !== undefined) data.observacoes = input.observacoes;

    // Coordenadas: as duas ou nenhuma
    const novaLat = data.latitude !== undefined ? data.latitude : alvo.latitude;
    const novaLng = data.longitude !== undefined ? data.longitude : alvo.longitude;
    if ((novaLat == null) !== (novaLng == null)) {
      throw new Error('Latitude e longitude devem ser informadas juntas ou ambas vazias');
    }

    let atualizada;
    try {
      atualizada = await prisma.ubs.update({ where: { id: ubsId }, data });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw Conflict('UBS_DUPLICADA', 'CNES já cadastrado');
      }
      throw err;
    }

    // Audit com snapshot antes/depois (delta calculável p/ auditor)
    await this.audit?.registrar({
      acao: 'EDITAR_UBS',
      recurso: 'Ubs',
      recursoId: ubsId,
      atendenteId: editorId,
      payload: {
        prefeituraId: alvo.prefeituraId,
        camposAlterados: Object.keys(data),
        antes: _snapshot(alvo),
        depois: _snapshot(atualizada),
      },
      ip: ctxExtra?.ip ?? null,
      userAgent: ctxExtra?.userAgent ?? null,
    });

    return { id: atualizada.id, nome: atualizada.nome, ativa: atualizada.ativa };
  }
}

/** Snapshot dos campos relevantes para audit (sem timestamps). */
function _snapshot(u: {
  nome: string;
  municipio: string;
  uf: string;
  endereco: string | null;
  cnes: string | null;
  ativa: boolean;
  bairro: string | null;
  cep: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  horarios: Prisma.JsonValue;
  observacoes: string | null;
}): Record<string, unknown> {
  return {
    nome: u.nome,
    municipio: u.municipio,
    uf: u.uf,
    endereco: u.endereco,
    cnes: u.cnes,
    ativa: u.ativa,
    bairro: u.bairro,
    cep: u.cep,
    telefone: u.telefone,
    whatsapp: u.whatsapp,
    email: u.email,
    latitude: u.latitude != null ? u.latitude.toString() : null,
    longitude: u.longitude != null ? u.longitude.toString() : null,
    horarios: u.horarios,
    observacoes: u.observacoes,
  };
}
