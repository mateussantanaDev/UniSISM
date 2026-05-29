import { prisma } from '../../infrastructure/database/prisma';
import { Conflict, NotFound } from '../../shared/errors';
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
import { Prisma } from '../../../generated/prisma';

export interface CreateUbsInput {
  nome: string;
  municipio: string;
  uf: string;
  prefeituraId: string;
  endereco?: string;
  cnes?: string;

  // Novos campos (v0.13)
  bairro?: string;
  cep?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  horarios?: HorariosFuncionamento;
  observacoes?: string;
}

export interface AuditContext {
  atendenteId: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Cria UBS — Face 2/Admin.
 *
 * Validações:
 *   - prefeituraId pertence ao scope
 *   - CNES único (P2002 catch)
 *   - CEP 8 dígitos
 *   - Telefone/WhatsApp 10/11/13 dígitos
 *   - Email regex razoável + ≤180 chars
 *   - Latitude [-90, 90] / Longitude [-180, 180]
 *   - Horários JSON estruturado (dias válidos + HH:MM + abre<fecha)
 *
 * Audit log: `CRIAR_UBS` com snapshot dos campos.
 */
export class CreateUbsUseCase {
  constructor(private readonly audit?: IAuditLogger) {}

  async exec(scope: AccessScope, input: CreateUbsInput, ctx?: AuditContext) {
    const prefeitura = await prisma.prefeitura.findUnique({
      where: { id: input.prefeituraId },
    });
    if (!prefeitura) throw NotFound('PREFEITURA_NAO_ENCONTRADA', 'Prefeitura não encontrada');
    ensurePrefeituraAcessivel(scope, prefeitura.id);

    // Validações dos novos campos
    valOrThrow('cep', validarCep(input.cep));
    valOrThrow('telefone', validarTelefoneBr(input.telefone));
    valOrThrow('whatsapp', validarTelefoneBr(input.whatsapp));
    valOrThrow('email', validarEmail(input.email));
    valOrThrow('latitude', validarLatitude(input.latitude));
    valOrThrow('longitude', validarLongitude(input.longitude));
    valOrThrow('horarios', validarHorarios(input.horarios));
    // Coordenadas: as duas, ou nenhuma (não faz sentido só uma)
    if ((input.latitude == null) !== (input.longitude == null)) {
      throw new Error('Latitude e longitude devem ser informadas juntas ou ambas vazias');
    }

    if (input.cnes) {
      const exists = await prisma.ubs.findUnique({ where: { cnes: input.cnes } });
      if (exists) throw Conflict('UBS_DUPLICADA', 'CNES já cadastrado');
    }

    const data: Prisma.UbsCreateInput = {
      nome: input.nome,
      municipio: input.municipio,
      uf: input.uf,
      prefeitura: { connect: { id: input.prefeituraId } },
      ...(input.endereco !== undefined ? { endereco: input.endereco } : {}),
      ...(input.cnes !== undefined ? { cnes: input.cnes } : {}),
      ...(input.bairro !== undefined ? { bairro: input.bairro } : {}),
      ...(input.cep !== undefined && input.cep !== '' ? { cep: normalizarCep(input.cep) } : {}),
      ...(input.telefone !== undefined && input.telefone !== ''
        ? { telefone: normalizarTelefone(input.telefone) }
        : {}),
      ...(input.whatsapp !== undefined && input.whatsapp !== ''
        ? { whatsapp: normalizarTelefone(input.whatsapp) }
        : {}),
      ...(input.email !== undefined && input.email !== ''
        ? { email: input.email.trim().toLowerCase() }
        : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.horarios !== undefined
        ? { horarios: input.horarios as Prisma.InputJsonValue }
        : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes } : {}),
    };

    let criada;
    try {
      criada = await prisma.ubs.create({ data });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Race: outro admin criou com mesmo CNES entre o pre-check e o create.
        throw Conflict('UBS_DUPLICADA', 'CNES já cadastrado');
      }
      throw err;
    }

    if (ctx) {
      await this.audit?.registrar({
        acao: 'CRIAR_UBS',
        recurso: 'Ubs',
        recursoId: criada.id,
        atendenteId: ctx.atendenteId,
        payload: {
          nome: criada.nome,
          municipio: criada.municipio,
          uf: criada.uf,
          prefeituraId: criada.prefeituraId,
          camposPreenchidos: Object.keys(data).filter((k) => k !== 'prefeitura'),
        },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    }

    return criada;
  }
}
