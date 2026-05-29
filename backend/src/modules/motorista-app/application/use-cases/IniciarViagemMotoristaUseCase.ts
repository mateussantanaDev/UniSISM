/**
 * `POST /motorista-app/viagens/:id/iniciar` — motorista inicia sua viagem.
 *
 * Wrapper sobre `ViagensTfdUseCases.iniciar` (equivalente do gestor) que:
 *   1. Garante que a viagem pertence ao motorista logado (404 senão).
 *   2. Aplica as MESMAS validações do gestor (CNH vencida, hodômetro etc.).
 *   3. Audit log com `operadorRole='MOTORISTA_TFD'` e `operadorId=atendenteId`
 *      do motorista (não do gestor) — cadeia íntegra para o TJ.
 */
import type { Request } from 'express';
import { NotFound } from '../../../../shared/errors';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import type { ViagensTfdUseCases } from '../../../tfd/application/viagens';
import { mapViagemMotorista, type ViagemMotoristaDto } from './_viagemMapper';
import type { MotoristaAuthContext } from '../../presentation/middlewares/authenticateMotorista';

export class IniciarViagemMotoristaUseCase {
  constructor(private readonly viagensTfd: ViagensTfdUseCases) {}

  async exec(
    auth: MotoristaAuthContext,
    req: Request,
    viagemId: string,
    kmInicialHodometro: number,
  ): Promise<ViagemMotoristaDto> {
    // Guard: viagem é minha?
    const exists = await prisma.viagemFrota.findFirst({
      where: { id: viagemId, motoristaId: auth.motoristaId },
      select: { id: true },
    });
    if (!exists) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');

    // Reaproveita o use case do gestor — todas as validações idem.
    const scope: AccessScope = { kind: 'PREFEITURA', prefeituraId: auth.prefeituraId };
    await this.viagensTfd.iniciar(scope, req, auth.atendenteId, viagemId, kmInicialHodometro);

    // Re-fetch no formato motorista (shape diferente do gestor).
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
