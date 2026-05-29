/**
 * `GET /motorista-app/minhas-viagens` — viagens do motorista logado.
 *
 * Filtros:
 *   - `desde` (ISO 8601 UTC): só viagens com `atualizadoEm >= desde`
 *     (sync incremental — app guarda `X-Server-Time` da response anterior).
 *   - `status`: csv de StatusViagemFrota (`AGENDADA,EM_ANDAMENTO`).
 *   - `limit`: 1..100 (default 50).
 *
 * Filtro automático: `viagem.motoristaId = auth.motoristaId`.
 *
 * Shape de saída: alinhado com o `Viagem` do app Flutter
 * (lib/domain/models/viagem.dart). Coordenadas geográficas viraram null —
 * o schema atual não armazena lat/lng (fase futura).
 */
import { prisma } from '../../../../infrastructure/database/prisma';
import { mapViagemMotorista, type ViagemMotoristaDto } from './_viagemMapper';
import type { MotoristaAuthContext } from '../../presentation/middlewares/authenticateMotorista';
import type { Prisma, StatusViagemFrota } from '../../../../../generated/prisma';

export interface ListarMinhasViagensInput {
  desde?: string; // ISO 8601 UTC
  status?: string; // csv: "AGENDADA,EM_ANDAMENTO"
  limit?: number;
}

const STATUS_VALIDOS = new Set<StatusViagemFrota>([
  'AGENDADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'CANCELADA',
]);

export class ListarMinhasViagensUseCase {
  async exec(
    auth: MotoristaAuthContext,
    input: ListarMinhasViagensInput,
  ): Promise<ViagemMotoristaDto[]> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);

    const where: Prisma.ViagemFrotaWhereInput = {
      motoristaId: auth.motoristaId,
      prefeituraId: auth.prefeituraId,
    };

    if (input.desde) {
      const dt = new Date(input.desde);
      if (!Number.isNaN(dt.getTime())) {
        where.atualizadoEm = { gte: dt };
      }
    }

    if (input.status) {
      const filtros = input.status
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is StatusViagemFrota => STATUS_VALIDOS.has(s as StatusViagemFrota));
      if (filtros.length > 0) where.status = { in: filtros };
    }

    const rows = await prisma.viagemFrota.findMany({
      where,
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
      orderBy: [{ data: 'asc' }, { horaSaida: 'asc' }],
      take: limit,
    });

    const nomeMot = auth.nome;
    const matriculaMot = auth.matricula;

    return rows.map((r) => mapViagemMotorista(r, nomeMot, matriculaMot));
  }
}
