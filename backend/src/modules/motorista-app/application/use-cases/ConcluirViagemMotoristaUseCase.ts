/**
 * `POST /motorista-app/viagens/:id/concluir` — motorista finaliza sua viagem.
 *
 * Wrapper sobre `ViagensTfdUseCases.concluir`. Mesmas validações + efeitos
 * colaterais: atualiza hodômetro do veículo, incrementa contagem do motorista
 * e marca solicitações alocadas como REALIZADA.
 */
import type { Request } from 'express';
import { NotFound } from '../../../../shared/errors';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import type { ViagensTfdUseCases } from '../../../tfd/application/viagens';
import { mapViagemMotorista, type ViagemMotoristaDto } from './_viagemMapper';
import type { MotoristaAuthContext } from '../../presentation/middlewares/authenticateMotorista';

export class ConcluirViagemMotoristaUseCase {
  constructor(private readonly viagensTfd: ViagensTfdUseCases) {}

  async exec(
    auth: MotoristaAuthContext,
    req: Request,
    viagemId: string,
    kmFinalHodometro: number,
  ): Promise<ViagemMotoristaDto> {
    const exists = await prisma.viagemFrota.findFirst({
      where: { id: viagemId, motoristaId: auth.motoristaId },
      select: { id: true },
    });
    if (!exists) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');

    const scope: AccessScope = { kind: 'PREFEITURA', prefeituraId: auth.prefeituraId };
    await this.viagensTfd.concluir(scope, req, auth.atendenteId, viagemId, { kmFinalHodometro });

    const v = await prisma.viagemFrota.findUnique({
      where: { id: viagemId },
      include: {
        veiculo: true,
        motorista: { select: { id: true, atendente: { select: { matricula: true } } } },
        passageiros: {
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
        },
      },
    });
    return mapViagemMotorista(v!, auth.nome, auth.matricula);
  }
}
