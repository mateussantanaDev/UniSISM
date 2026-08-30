import { randomUUID } from 'crypto';
import type {
  AtendimentoUbsItem,
  ChamadaPainelUbs,
  PrioridadeUbs,
  StatusAtendimentoUbs,
  TipoAtendimentoUbs,
} from '../../domain/entities/AtendimentoUbsFila';
import { PRIORIDADE_PESO } from '../../domain/entities/AtendimentoUbsFila';

export class FilaUbsRepository {
  // Armazenamento em memória com isolamento por prefeitura e UBS
  private readonly items = new Map<string, AtendimentoUbsItem>();
  private readonly chamadas = new Map<string, ChamadaPainelUbs[]>(); // ubsId -> lista de chamadas
  private readonly sequenciais = new Map<string, number>(); // "data:ubsId:prefixo" -> número

  private getSequencialKey(data: string, ubsId: string, prefixo: string): string {
    return `${data}:${ubsId}:${prefixo}`;
  }

  private gerarSenha(data: string, ubsId: string, prioridade: PrioridadeUbs): string {
    let prefixo = 'GER';
    if (prioridade === 'URGENCIA') prefixo = 'URG';
    else if (prioridade === 'SUPER_PRIORIDADE_80') prefixo = '80';
    else if (
      prioridade === 'GESTANTE_LACTANTE' ||
      prioridade === 'PCD' ||
      prioridade === 'TEA' ||
      prioridade === 'IDOSO_60'
    ) {
      prefixo = 'PRI';
    }

    const key = this.getSequencialKey(data, ubsId, prefixo);
    const atual = (this.sequenciais.get(key) ?? 0) + 1;
    this.sequenciais.set(key, atual);

    const numStr = String(atual).padStart(3, '0');
    return `${prefixo}-${numStr}`;
  }

  async adicionar(input: {
    ubsId: string;
    ubsNome?: string;
    prefeituraId?: string;
    data?: string;
    pacienteId: string;
    pacienteNome: string;
    pacienteCpf: string;
    pacienteCartaoSus?: string;
    pacienteDataNasc?: string;
    pacienteSexo?: string;
    pacienteTelefone?: string;
    tipoAtendimento: TipoAtendimentoUbs;
    prioridade: PrioridadeUbs;
    medicoId?: string | null;
    medicoNome?: string | null;
    crm?: string | null;
    consultorio: string;
    queixaBreve?: string;
    criadoPorId?: string;
    criadoPorNome?: string;
  }): Promise<AtendimentoUbsItem> {
    const now = new Date();
    const dataYmd = input.data || now.toISOString().slice(0, 10);
    const senha = this.gerarSenha(dataYmd, input.ubsId, input.prioridade);

    const item: AtendimentoUbsItem = {
      id: randomUUID(),
      senha,
      ubsId: input.ubsId,
      ubsNome: input.ubsNome,
      prefeituraId: input.prefeituraId,
      data: dataYmd,
      horarioChegada: now.toISOString(),
      pacienteId: input.pacienteId,
      pacienteNome: input.pacienteNome,
      pacienteCpf: input.pacienteCpf,
      pacienteCartaoSus: input.pacienteCartaoSus,
      pacienteDataNasc: input.pacienteDataNasc,
      pacienteSexo: input.pacienteSexo,
      pacienteTelefone: input.pacienteTelefone,
      tipoAtendimento: input.tipoAtendimento,
      prioridade: input.prioridade,
      medicoId: input.medicoId || null,
      medicoNome: input.medicoNome || null,
      crm: input.crm || null,
      consultorio: input.consultorio || 'Consultório 01',
      queixaBreve: input.queixaBreve || '',
      status: 'AGUARDANDO',
      chamadoEm: null,
      iniciadoEm: null,
      finalizadoEm: null,
      criadoPorId: input.criadoPorId,
      criadoPorNome: input.criadoPorNome,
      criadoEm: now.toISOString(),
      atualizadoEm: now.toISOString(),
    };

    this.items.set(item.id, item);
    return item;
  }

  async obterPorId(id: string): Promise<AtendimentoUbsItem | null> {
    return this.items.get(id) ?? null;
  }

  async atualizar(id: string, partial: Partial<AtendimentoUbsItem>): Promise<AtendimentoUbsItem | null> {
    const item = this.items.get(id);
    if (!item) return null;

    const atualizado: AtendimentoUbsItem = {
      ...item,
      ...partial,
      atualizadoEm: new Date().toISOString(),
    };

    this.items.set(id, atualizado);
    return atualizado;
  }

  async listar(filtros: {
    data?: string;
    ubsId?: string;
    medicoId?: string;
    status?: StatusAtendimentoUbs;
    busca?: string;
  }): Promise<AtendimentoUbsItem[]> {
    const nowYmd = new Date().toISOString().slice(0, 10);
    const dataAlvo = filtros.data || nowYmd;

    let lista = Array.from(this.items.values()).filter((item) => item.data === dataAlvo);

    if (filtros.ubsId) {
      lista = lista.filter((item) => item.ubsId === filtros.ubsId);
    }

    if (filtros.medicoId) {
      lista = lista.filter((item) => item.medicoId === filtros.medicoId);
    }

    if (filtros.status) {
      lista = lista.filter((item) => item.status === filtros.status);
    }

    if (filtros.busca) {
      const q = filtros.busca.toLowerCase();
      lista = lista.filter(
        (item) =>
          item.pacienteNome.toLowerCase().includes(q) ||
          item.pacienteCpf.includes(q) ||
          (item.pacienteCartaoSus && item.pacienteCartaoSus.includes(q)) ||
          item.senha.toLowerCase().includes(q) ||
          (item.medicoNome && item.medicoNome.toLowerCase().includes(q)),
      );
    }

    // Algoritmo de Ordenação SUS Inteligente:
    // 1. Status ativo em atendimento (EM_ATENDIMENTO)
    // 2. Chamados recentes (CHAMADO)
    // 3. Aguardando atendimento: ORDENADO POR PESO DE PRIORIDADE ASC (1 a 7), seguido por HORÁRIO DE CHEGADA ASC
    // 4. Concluídos / Faltosos / Cancelados no final
    return lista.sort((a, b) => {
      const statusOrder: Record<StatusAtendimentoUbs, number> = {
        EM_ATENDIMENTO: 1,
        CHAMADO: 2,
        AGUARDANDO: 3,
        CONCLUIDO: 4,
        FALTOU: 5,
        CANCELADO: 6,
      };

      const diffStatus = statusOrder[a.status] - statusOrder[b.status];
      if (diffStatus !== 0) return diffStatus;

      // Se ambos estão aguardando, aplica a prioridade legal/clínica
      if (a.status === 'AGUARDANDO') {
        const pesoA = PRIORIDADE_PESO[a.prioridade] ?? 7;
        const pesoB = PRIORIDADE_PESO[b.prioridade] ?? 7;
        if (pesoA !== pesoB) {
          return pesoA - pesoB; // menor peso = maior prioridade
        }
        // Se mesma prioridade, critério de desempate = ordem cronológica de chegada
        return new Date(a.horarioChegada).getTime() - new Date(b.horarioChegada).getTime();
      }

      // Para os demais status, ordena pelo horário mais recente
      return new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime();
    });
  }

  async registrarChamada(chamada: ChamadaPainelUbs): Promise<void> {
    const lista = this.chamadas.get(chamada.ubsId) ?? [];
    const novaLista = [chamada, ...lista.filter((c) => c.atendimentoId !== chamada.atendimentoId)].slice(0, 10);
    this.chamadas.set(chamada.ubsId, novaLista);
  }

  async obterUltimasChamadas(ubsId: string, limite = 5): Promise<{
    chamadaAtual: ChamadaPainelUbs | null;
    ultimasChamadas: ChamadaPainelUbs[];
  }> {
    const lista = this.chamadas.get(ubsId) ?? [];
    const chamadaAtual = lista.length > 0 ? (lista[0] ?? null) : null;
    const ultimasChamadas = lista.slice(1, limite + 1);

    return {
      chamadaAtual,
      ultimasChamadas,
    };
  }
}

export const filaUbsRepository = new FilaUbsRepository();
