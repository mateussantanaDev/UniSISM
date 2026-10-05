import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { BadRequest } from '../../../../shared/errors';
import { NotificacaoPacienteService } from '../../../../infrastructure/services/NotificacaoPacienteService';
import { dataHoraCentro, dataValidaCentro, somarDiasCentro } from '../../shared/escalaCentro';
export interface NotificacaoAusenciaInput { medicoNome: string; dataAfetada: string; tipoMotivo: 'FALTA_MEDICA'|'MUDANCA_DIA'|'FERIAS_LICENCA'; novaData?: string; mensagem: string; canais?: { app?: boolean; sms?: boolean; whatsapp?: boolean; }; }
export class NotificacaoAusenciaMedicaUseCase {
  private readonly notificacoes = new NotificacaoPacienteService();
  async exec(input: NotificacaoAusenciaInput, atendenteId: string, scope: AccessScope) {
    if (!dataValidaCentro(input.dataAfetada) || input.novaData && !dataValidaCentro(input.novaData)) throw BadRequest('DATA_INVALIDA', 'Informe uma data válida.');
    if (input.canais?.sms || input.canais?.whatsapp || input.canais?.app === false) throw BadRequest('CANAL_INDISPONIVEL', 'Este aviso pode ser registrado somente no aplicativo do paciente.');
    const periodo = { gte: dataHoraCentro(input.dataAfetada), lt: dataHoraCentro(somarDiasCentro(input.dataAfetada, 1)) };
    return prisma.$transaction(async tx => {
      const encs = await tx.encaminhamento.findMany({ where: { deletadoEm: null, status: 'APROVADO', statusAtendimentoCentro: 'AGENDADO', agendamentoPrevisto: periodo, profissionalAgendado: { equals: input.medicoNome, mode: 'insensitive' }, ...(scope.kind === 'GLOBAL' ? {} : scope.kind === 'UBS' ? { ubsId: scope.ubsId } : { ubs: { prefeituraId: scope.prefeituraId } }) } });
      const antigos = await tx.agendamentoCentro.findMany({ where: { status: 'AGUARDANDO', dataAgendamento: periodo, medicoNome: { equals: input.medicoNome, mode: 'insensitive' }, ...(scope.kind === 'GLOBAL' ? {} : scope.kind === 'UBS' ? { paciente: { ubsId: scope.ubsId } } : { prefeituraId: scope.prefeituraId }) }, include: { paciente: true } });
      const vistos = new Set<string>();
      for (const p of [...encs.map(e => ({ cpf: e.pacienteCpf, nome: e.pacienteNome, id: e.id })), ...antigos.map(a => ({ cpf: a.paciente.cpf, nome: a.paciente.nome, id: undefined }))]) {
        const cpf = p.cpf.replace(/\D/g, ''); if (!cpf || vistos.has(cpf)) continue;
        await this.notificacoes.notificarNaTransacao(tx, { cpfPaciente: cpf, pacienteNome: p.nome, encaminhamentoId: p.id, tipo: 'AGENDADO', titulo: 'Aviso sobre seu atendimento', corpo: input.mensagem, payload: { motivo: input.tipoMotivo, novaData: input.novaData ?? null } });
        vistos.add(cpf);
      }
      await tx.auditoriaLog.create({ data: { acao: 'CENTRO_NOTIFICACAO_AUSENCIA_MEDICA', recurso: 'CENTRO_ESPECIALIDADES', atendenteId, payload: { medicoNome: input.medicoNome, dataAfetada: input.dataAfetada, totalNotificados: vistos.size, canal: 'APP' } } });
      return { sucesso: true, totalNotificados: vistos.size, pacientesNotificados: vistos.size, dataDisparo: new Date().toISOString(), canal: 'APP' };
    }, { timeout: 20000 });
  }
}
