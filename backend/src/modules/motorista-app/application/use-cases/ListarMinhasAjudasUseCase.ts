/**
 * `GET /motorista-app/ajudas-custo` — ajudas de custo das viagens do motorista.
 *
 * READ-ONLY. Quem cria/autoriza/paga é o gestor TFD via `/v1/tfd/ajudas-custo/*`.
 * Filtro: ajuda.viagem.motoristaId = auth.motoristaId.
 */
import { prisma } from '../../../../infrastructure/database/prisma';
import type { MotoristaAuthContext } from '../../presentation/middlewares/authenticateMotorista';

export interface AjudaCustoItemDto {
  categoria: string;
  descricao: string;
  valorBRL: number;
}

export interface AjudaCustoMotoristaDto {
  id: string;
  protocolo: string;
  viagemId: string;
  pacienteId: string;
  pacienteNome: string;
  itens: AjudaCustoItemDto[];
  valorTotalBRL: number;
  status: 'PENDENTE' | 'AUTORIZADA' | 'PAGA' | 'NEGADA' | 'CANCELADA';
  metodoPagamento: 'PIX' | 'TRANSFERENCIA' | 'DINHEIRO_RH' | null;
  motivoNegacao: string | null;
  criadaEm: string;
  autorizadaEm: string | null;
  pagaEm: string | null;
}

export class ListarMinhasAjudasUseCase {
  async exec(auth: MotoristaAuthContext): Promise<AjudaCustoMotoristaDto[]> {
    const rows = await prisma.ajudaCusto.findMany({
      where: {
        viagem: { motoristaId: auth.motoristaId },
        prefeituraId: auth.prefeituraId,
      },
      include: {
        paciente: { select: { nome: true } },
      },
      orderBy: { criadaEm: 'desc' },
      take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      protocolo: r.protocolo,
      viagemId: r.viagemId,
      pacienteId: r.pacienteId,
      pacienteNome: r.paciente.nome,
      itens: r.itens as unknown as AjudaCustoItemDto[],
      valorTotalBRL: Number(r.valorTotal),
      status: r.status,
      metodoPagamento: r.metodoPagamento ?? null,
      motivoNegacao: r.motivoNegacao ?? null,
      criadaEm: r.criadaEm.toISOString(),
      autorizadaEm: r.autorizadaEm?.toISOString() ?? null,
      pagaEm: r.pagaEm?.toISOString() ?? null,
    }));
  }
}
