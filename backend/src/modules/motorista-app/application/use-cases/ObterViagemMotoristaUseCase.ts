/**
 * `GET /motorista-app/viagens/:id` — detalhe de uma viagem.
 *
 * Filtro automático: `viagem.motoristaId = auth.motoristaId`.
 * Viagem inexistente OU de outro motorista → 404 VIAGEM_NAO_ENCONTRADA
 * (sem distinção, para evitar enumeração).
 */
import { NotFound } from '../../../../shared/errors';
import { prisma } from '../../../../infrastructure/database/prisma';
import { mapViagemMotorista, type ViagemMotoristaDto } from './_viagemMapper';
import type { MotoristaAuthContext } from '../../presentation/middlewares/authenticateMotorista';

const INCLUDE = {
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
};

export class ObterViagemMotoristaUseCase {
  async exec(auth: MotoristaAuthContext, id: string): Promise<ViagemMotoristaDto> {
    const v = await prisma.viagemFrota.findFirst({
      where: { id, motoristaId: auth.motoristaId },
      include: INCLUDE,
    });
    if (!v) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    return mapViagemMotorista(v, auth.nome, auth.matricula);
  }
}
