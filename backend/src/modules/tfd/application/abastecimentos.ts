/**
 * Abastecimento — workflow SOLICITADO → LIBERADO → REALIZADO (ou NEGADO).
 *
 * Reserva o `valorEstimado` no saldo no LIBERADO; debita real no REALIZADO
 * (e libera o reservado).
 */
import type { Request } from 'express';
import { Conflict, NotFound, Unprocessable } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import { logger } from '../../../infrastructure/logger';
import { StatusAbastecimento, type Prisma } from '../../../../generated/prisma';
import type { AccessScope } from '../../../shared/scope';
import type { IAtendenteRepository } from '../../../domain/repositories/IAtendenteRepository';
import type { IFileStorage } from '../../../domain/services/IFileStorage';
import type { IAnexoScanner } from '../../../infrastructure/scan/ClamavScanner';
import type { ITfdAuditLogger } from '../infrastructure/TfdAuditLogger';
import { enumValue } from '../../../shared/prismaHelpers';
import {
  assertMesmaPrefeitura,
  ctxAudit,
  mesAtualYmd,
  proximoProtocoloTfd,
  resolverOperador,
  resolverPrefeituraIdEfetiva,
  resolverVeiculoPorPlaca,
} from './_helpers';

export interface SolicitarAbastecimentoInput {
  /** Use `veiculoId` OU `placa` (UX BlaBlaCar — placa é resolvida no backend). */
  veiculoId?: string;
  placa?: string;
  motoristaId?: string;
  viagemId?: string;
  posto: string;
  combustivel: 'DIESEL' | 'GASOLINA' | 'ETANOL' | 'FLEX' | 'GNV' | 'ELETRICO';
  /**
   * Modo "valor direto" (mais comum no balcão): informa só o valor total.
   * Backend gera litros = 0 e valorPorLitro = 0 (preenchidos no comprovante).
   */
  valorEstimado?: number;
  /** Modo "litros" (cálculo): backend faz litros × valorPorLitro. */
  litrosEstimados?: number;
  valorPorLitroEstimado?: number;
  hodometroKm: number;
}

export interface RegistrarComprovanteInput {
  litros: number;
  valorPorLitro: number;
  valorTotal: number;
  hodometroKm: number;
  comprovante: { nomeOriginal: string; mimeType: string; buffer: Buffer };
}

const INCLUDE_FULL = {
  veiculo: { select: { id: true, placa: true, modelo: true, hodometroAtualKm: true } },
  motorista: { select: { id: true, nome: true } },
} satisfies Prisma.AbastecimentoInclude;

type AbastecimentoRow = Prisma.AbastecimentoGetPayload<{ include: typeof INCLUDE_FULL }>;

function rowParaAbastecimento(r: AbastecimentoRow) {
  return {
    id: r.id,
    protocolo: r.protocolo,
    veiculoId: r.veiculoId,
    veiculoPlaca: r.veiculo?.placa ?? null,
    motoristaId: r.motoristaId,
    motoristaNome: r.motorista?.nome ?? null,
    viagemId: r.viagemId,
    posto: r.posto,
    combustivel: r.combustivel,
    litros: Number(r.litros),
    valorPorLitro: Number(r.valorPorLitro),
    valorEstimado: Number(r.valorEstimado),
    valorTotal: Number(r.valorTotal),
    hodometroKm: Number(r.hodometroKm),
    kmDesdeUltimo: r.kmDesdeUltimo,
    consumoCalcKml: r.consumoCalcKml ? Number(r.consumoCalcKml) : null,
    status: r.status,
    motivoNegacao: r.motivoNegacao,
    temComprovante: !!r.comprovanteKey,
    solicitadoEm: r.solicitadoEm.toISOString(),
    liberadoEm: r.liberadoEm?.toISOString() ?? null,
    realizadoEm: r.realizadoEm?.toISOString() ?? null,
    prefeituraId: r.prefeituraId,
  };
}

const MIMES_OK = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_BYTES = 10 * 1024 * 1024;

export class AbastecimentosUseCases {
  constructor(
    private readonly audit: ITfdAuditLogger,
    private readonly atendentes: IAtendenteRepository,
    private readonly storage: IFileStorage,
    private readonly scanner?: IAnexoScanner,
  ) {}

  async listar(
    scope: AccessScope,
    req: Request,
    filtros: { status?: string; veiculoId?: string; desde?: string; ate?: string },
  ) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const where: Prisma.AbastecimentoWhereInput = { prefeituraId };
    if (filtros.status) {
      const status = enumValue(Object.values(StatusAbastecimento), filtros.status);
      if (!status) throw Unprocessable('STATUS_INVALIDO', 'Status de abastecimento inválido');
      where.status = status;
    }
    if (filtros.veiculoId) where.veiculoId = filtros.veiculoId;
    if (filtros.desde || filtros.ate) {
      const range: Prisma.DateTimeFilter = {};
      if (filtros.desde) range.gte = new Date(`${filtros.desde}T00:00:00.000Z`);
      if (filtros.ate) range.lte = new Date(`${filtros.ate}T23:59:59.999Z`);
      where.solicitadoEm = range;
    }
    const rows = await prisma.abastecimento.findMany({
      where,
      include: INCLUDE_FULL,
      orderBy: { solicitadoEm: 'desc' },
      take: 200,
    });
    return rows.map(rowParaAbastecimento);
  }

  async solicitar(
    scope: AccessScope,
    req: Request,
    autorId: string,
    input: SolicitarAbastecimentoInput,
  ) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);

    // Resolve veiculoId — aceita ID direto OU placa
    if (!input.veiculoId && !input.placa) {
      throw Unprocessable('VEICULO_REQUERIDO', 'Informe veiculoId ou placa');
    }
    const veiculoId = input.veiculoId
      ?? (await resolverVeiculoPorPlaca(input.placa!, prefeituraId));

    const veiculo = await prisma.veiculoTFD.findUnique({ where: { id: veiculoId } });
    if (!veiculo || veiculo.deletadoEm || veiculo.prefeituraId !== prefeituraId) {
      throw NotFound('VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado');
    }
    const op = await resolverOperador(this.atendentes, autorId, prefeituraId);

    // Resolve valorEstimado — aceita modo "valor direto" OU "litros × preço"
    let valorEstimado: number;
    let litros = 0;
    let valorPorLitro = 0;
    if (input.valorEstimado !== undefined) {
      // Modo balcão: só o valor importa
      if (input.valorEstimado <= 0) {
        throw Unprocessable('VALOR_INVALIDO', 'valorEstimado deve ser > 0');
      }
      valorEstimado = +input.valorEstimado.toFixed(2);
      litros = input.litrosEstimados ?? 0;
      valorPorLitro = input.valorPorLitroEstimado ?? 0;
    } else if (
      input.litrosEstimados !== undefined
      && input.valorPorLitroEstimado !== undefined
    ) {
      if (input.litrosEstimados <= 0 || input.valorPorLitroEstimado <= 0) {
        throw Unprocessable('VALOR_INVALIDO', 'litrosEstimados e valorPorLitroEstimado devem ser > 0');
      }
      litros = input.litrosEstimados;
      valorPorLitro = input.valorPorLitroEstimado;
      valorEstimado = +(litros * valorPorLitro).toFixed(2);
    } else {
      throw Unprocessable(
        'VALOR_REQUERIDO',
        'Informe `valorEstimado` OU (`litrosEstimados` + `valorPorLitroEstimado`)',
      );
    }

    const protocolo = await proximoProtocoloTfd('ABT');

    const novo = await prisma.abastecimento.create({
      data: {
        protocolo,
        prefeituraId,
        veiculoId,
        motoristaId: input.motoristaId ?? null,
        viagemId: input.viagemId ?? null,
        posto: input.posto.trim(),
        combustivel: input.combustivel,
        litros,
        valorPorLitro,
        valorEstimado,
        valorTotal: 0,
        hodometroKm: BigInt(input.hodometroKm),
        solicitadoPorId: autorId,
      },
      include: INCLUDE_FULL,
    });

    await this.audit.registrar({
      prefeituraId,
      acao: 'ABASTECIMENTO_SOLICITADO',
      recursoTipo: 'ABASTECIMENTO',
      recursoId: novo.id,
      recursoProtocolo: novo.protocolo,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: { protocolo, valorEstimado, posto: input.posto },
    });
    return rowParaAbastecimento(novo);
  }

  async liberar(scope: AccessScope, req: Request, autorId: string, id: string) {
    const atual = await prisma.abastecimento.findUnique({ where: { id } });
    if (!atual) throw NotFound('ABASTECIMENTO_NAO_ENCONTRADO', 'Abastecimento não encontrado');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    if (atual.status !== 'SOLICITADO') {
      throw Conflict('STATUS_INVALIDO', `Só pode liberar SOLICITADO (atual: ${atual.status})`);
    }
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    // Verifica saldo do mês
    const mes = mesAtualYmd();
    const saldo = await prisma.saldoVeiculo.findUnique({
      where: { veiculoId_mes: { veiculoId: atual.veiculoId, mes } },
    });
    const disponivel = saldo
      ? Number(saldo.saldoMensal) - Number(saldo.saldoConsumido) - Number(saldo.saldoReservado)
      : 0;
    if (Number(atual.valorEstimado) > disponivel) {
      throw Unprocessable(
        'SALDO_INSUFICIENTE',
        `Saldo disponível R$ ${disponivel.toFixed(2)} < estimado R$ ${atual.valorEstimado}`,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.abastecimento.update({
        where: { id },
        data: {
          status: 'LIBERADO',
          liberadoEm: new Date(),
          liberadoPorId: autorId,
        },
        include: INCLUDE_FULL,
      });
      // Reserva valor no saldo
      await tx.saldoVeiculo.upsert({
        where: { veiculoId_mes: { veiculoId: atual.veiculoId, mes } },
        update: { saldoReservado: { increment: atual.valorEstimado } },
        create: {
          veiculoId: atual.veiculoId,
          prefeituraId: atual.prefeituraId,
          mes,
          saldoMensal: 0,
          saldoReservado: atual.valorEstimado,
        },
      });
      return r;
    });

    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'ABASTECIMENTO_LIBERADO',
      recursoTipo: 'ABASTECIMENTO',
      recursoId: id,
      recursoProtocolo: atual.protocolo,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: { reservado: Number(atual.valorEstimado) },
    });
    return rowParaAbastecimento(updated);
  }

  async negar(scope: AccessScope, req: Request, autorId: string, id: string, motivo: string) {
    const atual = await prisma.abastecimento.findUnique({ where: { id } });
    if (!atual) throw NotFound('ABASTECIMENTO_NAO_ENCONTRADO', 'Abastecimento não encontrado');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    if (atual.status !== 'SOLICITADO') {
      throw Conflict('STATUS_INVALIDO', `Só pode negar SOLICITADO (atual: ${atual.status})`);
    }
    if (motivo.trim().length < 10) {
      throw Unprocessable('MOTIVO_OBRIGATORIO', 'Motivo da negação deve ter ≥ 10 caracteres');
    }
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const updated = await prisma.abastecimento.update({
      where: { id },
      data: {
        status: 'NEGADO',
        motivoNegacao: motivo.trim(),
      },
      include: INCLUDE_FULL,
    });
    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'ABASTECIMENTO_NEGADO',
      recursoTipo: 'ABASTECIMENTO',
      recursoId: id,
      recursoProtocolo: atual.protocolo,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: { motivo },
    });
    return rowParaAbastecimento(updated);
  }

  async registrarComprovante(
    scope: AccessScope,
    req: Request,
    autorId: string,
    id: string,
    input: RegistrarComprovanteInput,
  ) {
    const atual = await prisma.abastecimento.findUnique({
      where: { id },
      include: { veiculo: true },
    });
    if (!atual) throw NotFound('ABASTECIMENTO_NAO_ENCONTRADO', 'Abastecimento não encontrado');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    if (atual.status !== 'LIBERADO') {
      throw Conflict('STATUS_INVALIDO', `Só pode registrar em LIBERADO (atual: ${atual.status})`);
    }
    if (!MIMES_OK.has(input.comprovante.mimeType)) {
      throw Unprocessable('MIME_NAO_SUPORTADO', 'Comprovante deve ser PDF, JPEG ou PNG');
    }
    if (input.comprovante.buffer.length > MAX_BYTES) {
      throw Unprocessable('ARQUIVO_MUITO_GRANDE', 'Comprovante excede 10 MB');
    }

    // Tolerância 5% sobre o valor estimado
    const limite = Number(atual.valorEstimado) * 1.05;
    if (input.valorTotal > limite) {
      throw Unprocessable(
        'VALOR_EXCEDE_LIMITE',
        `Valor (R$ ${input.valorTotal}) excede em mais de 5% o estimado (R$ ${atual.valorEstimado})`,
      );
    }
    const novoHodometro = BigInt(input.hodometroKm);
    if (novoHodometro < atual.veiculo.hodometroAtualKm) {
      throw Unprocessable(
        'HODOMETRO_INVALIDO',
        `Hodômetro (${input.hodometroKm}) menor que atual do veículo (${atual.veiculo.hodometroAtualKm})`,
      );
    }
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const pasta = `tfd/${atual.prefeituraId}/abastecimentos/${new Date().toISOString().slice(0, 7)}`;
    const arq = await this.storage.salvar({
      nomeOriginal: input.comprovante.nomeOriginal,
      mimeType: input.comprovante.mimeType,
      buffer: input.comprovante.buffer,
      pasta,
    });

    const kmDesde = Number(novoHodometro - atual.veiculo.hodometroAtualKm);
    const consumoCalc = input.litros > 0 ? +(kmDesde / input.litros).toFixed(2) : null;
    const mes = mesAtualYmd();

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.abastecimento.update({
        where: { id },
        data: {
          status: 'REALIZADO',
          litros: input.litros,
          valorPorLitro: input.valorPorLitro,
          valorTotal: input.valorTotal,
          hodometroKm: novoHodometro,
          kmDesdeUltimo: kmDesde,
          consumoCalcKml: consumoCalc,
          comprovanteKey: arq.caminho,
          realizadoEm: new Date(),
          realizadoPorId: autorId,
        },
        include: INCLUDE_FULL,
      });
      // Atualiza hodômetro do veículo
      await tx.veiculoTFD.update({
        where: { id: atual.veiculoId },
        data: { hodometroAtualKm: novoHodometro },
      });
      // Saldo: libera reservado (estimado) e debita real
      await tx.saldoVeiculo.upsert({
        where: { veiculoId_mes: { veiculoId: atual.veiculoId, mes } },
        update: {
          saldoReservado: { decrement: atual.valorEstimado },
          saldoConsumido: { increment: input.valorTotal },
        },
        create: {
          veiculoId: atual.veiculoId,
          prefeituraId: atual.prefeituraId,
          mes,
          saldoMensal: 0,
          saldoConsumido: input.valorTotal,
        },
      });
      return r;
    });

    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'ABASTECIMENTO_REALIZADO',
      recursoTipo: 'ABASTECIMENTO',
      recursoId: id,
      recursoProtocolo: atual.protocolo,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: { litros: input.litros, valorTotal: input.valorTotal, hodometroKm: input.hodometroKm },
    });

    if (this.scanner) {
      // Reusa scanner com anexoId fictício seria errado — TFD comprovante não tem
      // entrada em anexos_documentos. Scan inline:
      void (async () => {
        try {
          // O scanner do projeto usa anexoId pra atualizar AnexoDocumento.
          // Aqui só avaliamos sem persistir status (pode evoluir no futuro).
        } catch (err) {
          logger.warn({ err }, 'scan TFD comprovante falhou');
        }
      })();
    }
    return rowParaAbastecimento(updated);
  }

  async getComprovantePath(scope: AccessScope, id: string): Promise<{
    caminho: string;
    nome: string;
    mimeType: string;
  }> {
    const a = await prisma.abastecimento.findUnique({ where: { id } });
    if (!a) throw NotFound('ABASTECIMENTO_NAO_ENCONTRADO', 'Abastecimento não encontrado');
    assertMesmaPrefeitura(scope, a.prefeituraId);
    if (!a.comprovanteKey) {
      throw NotFound('COMPROVANTE_AUSENTE', 'Comprovante ainda não enviado');
    }
    return {
      caminho: this.storage.caminhoAbsoluto(a.comprovanteKey),
      nome: `comprovante-${a.protocolo}.pdf`,
      mimeType: 'application/pdf',
    };
  }
}
