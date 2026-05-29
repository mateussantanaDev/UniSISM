/**
 * `POST /motorista-app/viagens/:viagemId/passageiros/:pid/presenca` —
 * chamada digital do motorista.
 *
 * Wrapper sobre `ViagensTfdUseCases.marcarPresenca`. Adiciona:
 *   1. Guard: viagem é do motorista logado.
 *   2. Status da viagem ∈ {AGENDADA, EM_ANDAMENTO} (gestor permite mais).
 *   3. Touch em `viagem.atualizadoEm` (cursor sync incremental do app).
 *   4. Retorna shape específico do app (PassageiroDto).
 */
import type { Request } from 'express';
import { Conflict, NotFound, Unprocessable } from '../../../../shared/errors';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import type { ViagensTfdUseCases } from '../../../tfd/application/viagens';
import { mapPassageiro, type PassageiroDto } from './_viagemMapper';
import type { MotoristaAuthContext } from '../../presentation/middlewares/authenticateMotorista';

export type PresencaInput = 'AGUARDANDO' | 'CONFIRMADO' | 'EMBARCADO' | 'AUSENTE' | 'DESISTIU';

const PRESENCAS_VALIDAS = new Set<PresencaInput>([
  'AGUARDANDO',
  'CONFIRMADO',
  'EMBARCADO',
  'AUSENTE',
  'DESISTIU',
]);

const PRESENCAS_VIA_GESTOR = new Set<PresencaInput>([
  'CONFIRMADO',
  'EMBARCADO',
  'AUSENTE',
  'DESISTIU',
]);

export class MarcarPresencaMotoristaUseCase {
  constructor(private readonly viagensTfd: ViagensTfdUseCases) {}

  async exec(
    auth: MotoristaAuthContext,
    req: Request,
    viagemId: string,
    passageiroId: string,
    presenca: string,
    observacao: string | null,
  ): Promise<PassageiroDto> {
    if (!PRESENCAS_VALIDAS.has(presenca as PresencaInput)) {
      throw Unprocessable('PAYLOAD_INVALIDO', `presenca inválida: ${presenca}`);
    }
    if ((presenca === 'AUSENTE' || presenca === 'DESISTIU') && !observacao?.trim()) {
      throw Unprocessable('OBSERVACAO_OBRIGATORIA', 'Diga o motivo da ausência/desistência');
    }

    const viagem = await prisma.viagemFrota.findFirst({
      where: { id: viagemId, motoristaId: auth.motoristaId },
      select: { id: true, status: true },
    });
    if (!viagem) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    if (viagem.status !== 'AGENDADA' && viagem.status !== 'EM_ANDAMENTO') {
      throw Conflict('STATUS_INVALIDO', `Viagem ${viagem.status} não aceita marcação de presença`);
    }

    // 'AGUARDANDO' não é aceito pelo use case do gestor — só os 4 valores ativos.
    // Mas o app pode mandar AGUARDANDO pra "resetar" — nesse caso fazemos update
    // direto + touch + auditoria leve.
    if (PRESENCAS_VIA_GESTOR.has(presenca as PresencaInput)) {
      const scope: AccessScope = { kind: 'PREFEITURA', prefeituraId: auth.prefeituraId };
      await this.viagensTfd.marcarPresenca(
        scope,
        req,
        auth.atendenteId,
        viagemId,
        passageiroId,
        presenca as 'CONFIRMADO' | 'EMBARCADO' | 'AUSENTE' | 'DESISTIU',
        observacao ?? undefined,
      );
    } else {
      // AGUARDANDO — escrita direta + audit (sem cadeia, é estado neutro)
      const pass = await prisma.viagemPassageiro.findUnique({ where: { id: passageiroId } });
      if (!pass || pass.viagemId !== viagemId) {
        throw NotFound('PASSAGEIRO_NAO_ENCONTRADO', 'Passageiro não encontrado');
      }
      await prisma.viagemPassageiro.update({
        where: { id: passageiroId },
        data: {
          presenca: 'AGUARDANDO',
          observacao: null,
          marcadoEm: new Date(),
          marcadoPorId: auth.atendenteId,
        },
      });
    }

    // Touch — força atualizadoEm da viagem (cursor sync) mesmo que o use case
    // do gestor só tenha mexido em viagem_passageiros. Update com data:{} dispara
    // o @updatedAt do Prisma sem alterar outros campos.
    await prisma.viagemFrota.update({
      where: { id: viagemId },
      data: {},
    });

    const updated = await prisma.viagemPassageiro.findUnique({
      where: { id: passageiroId },
      include: {
        paciente: {
          select: {
            id: true,
            nome: true,
            cpf: true,
            dataNascimento: true,
            telefone: true,
            ubs: { select: { id: true, nome: true, municipio: true, endereco: true } },
          },
        },
        solicitacao: {
          select: {
            id: true,
            protocolo: true,
            prioridade: true,
            destino: true,
            unidadeDestino: true,
          },
        },
      },
    });
    return mapPassageiro(updated);
  }
}
