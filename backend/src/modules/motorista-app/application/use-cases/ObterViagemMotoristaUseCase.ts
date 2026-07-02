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
  // Pacientes que solicitaram vaga via app (Face 3) — relação separada.
  solicitacoesPaciente: {
    where: { status: { in: ['APROVADA' as const, 'EMBARCADA' as const] } },
    include: {
      conta: { select: { id: true, cpf: true, nome: true, telefone: true } },
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

    // Batch-load dos Pacientes (entidade clínica) por CPF — dá ao motorista
    // o nome/UBS oficial em vez do snapshot da PacienteConta (app).
    const cpfs = (v.solicitacoesPaciente ?? [])
      .map((s: any) => s.conta?.cpf)
      .filter((c: string | undefined): c is string => !!c);
    const pacientes = cpfs.length
      ? await prisma.paciente.findMany({
          where: { cpf: { in: cpfs }, deletadoEm: null },
          select: {
            id: true,
            cpf: true,
            nome: true,
            dataNascimento: true,
            telefone: true,
            ubs: { select: { id: true, nome: true, municipio: true, endereco: true } },
          },
        })
      : [];
    const pacientesPorCpf = new Map(pacientes.map((p) => [p.cpf, p]));

    return mapViagemMotorista(v, auth.nome, auth.matricula, pacientesPorCpf);
  }
}
