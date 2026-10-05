import type { AccessScope } from '../../../../shared/scope';
import { RelatoriosCentroUseCase, type RelatorioCentroInput } from './RelatoriosCentroUseCase';
import { dataLocalCentro } from '../../shared/escalaCentro';
export interface RelatorioBpaInput extends RelatorioCentroInput {}
export class RelatorioBpaUseCase {
  async exec(input: RelatorioBpaInput, scope: AccessScope) {
    const dados = await new RelatoriosCentroUseCase().dados(input, scope);
    const porEspecialidade: Record<string, number> = {}, porPrioridade: Record<string, number> = {}, porProcedimentoSigtap: Record<string, number> = {};
    const itens = dados.atendimentos.flatMap(a => {
      porEspecialidade[a.especialidade] = (porEspecialidade[a.especialidade] || 0) + 1;
      porPrioridade[a.prioridade] = (porPrioridade[a.prioridade] || 0) + 1;
      return a.procedimentosAdicionados.map(p => {
        const chave = `${p.codigoSigtap || 'Sem código'} - ${p.nome}`;
        porProcedimentoSigtap[chave] = (porProcedimentoSigtap[chave] || 0) + p.quantidade;
        return { protocolo: a.protocolo, pacienteNome: a.pacienteNome, pacienteCpf: a.pacienteCpf, pacienteCartaoSus: a.pacienteCartaoSus, especialidade: a.especialidade, codigoSigtap: p.codigoSigtap, procedimentoNome: p.nome, quantidade: p.quantidade, valorTotal: p.valorUnitario * p.quantidade, cid10: a.cid10, profissional: a.medicoNome, dataAgendada: dataLocalCentro(new Date(a.dataAtendimento)), origem: a.origem };
      });
    });
    return { periodo: dados.periodo, inicio: dados.inicio, fim: dados.fim, totalAtendimentos: dados.atendimentos.length, totalProcedimentos: itens.reduce((s, i) => s + i.quantidade, 0), porEspecialidade, porPrioridade, porProcedimentoSigtap, itens };
  }
}
