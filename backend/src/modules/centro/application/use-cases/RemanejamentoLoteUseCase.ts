import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { BadRequest } from '../../../../shared/errors';
import { dataValidaCentro, dataHoraCentro, somarDiasCentro, gerarSlotsEscala, escalaAtendeNaData } from '../../shared/escalaCentro';
import { validarReservaCentro } from '../../shared/reservaCentro';
export interface RemanejamentoLoteInput { medicoOrigem: string; dataOrigem: string; medicoDestino: string; dataDestino: string; notificarSms?: boolean; atendenteId: string; atendenteNome: string; }
export class RemanejamentoLoteUseCase {
  async exec(input: RemanejamentoLoteInput, scope: AccessScope) {
    if (!dataValidaCentro(input.dataOrigem) || !dataValidaCentro(input.dataDestino) || dataHoraCentro(somarDiasCentro(input.dataDestino, 1)) <= new Date()) throw BadRequest('DATA_INVALIDA', 'Informe datas válidas e um destino futuro.');
    if (input.medicoOrigem === input.medicoDestino && input.dataOrigem === input.dataDestino) throw BadRequest('DESTINO_IGUAL_ORIGEM', 'Selecione outro profissional ou outra data.');
    if (scope.kind === 'GLOBAL') throw BadRequest('PREFEITURA_OBRIGATORIA', 'Utilize uma conta vinculada à prefeitura para remanejar a agenda.');
    const prefeituraId = scope.prefeituraId;
    if (!prefeituraId) throw BadRequest('PREFEITURA_OBRIGATORIA', 'Prefeitura não identificada.');
    const profissionais = await prisma.atendente.findMany({ where: { prefeituraId, ativo: true, deletadoEm: null, role: { in: ['MEDICO', 'MEDICO_ESPECIALISTA'] }, OR: [{ nome: input.medicoOrigem }, { nome: input.medicoDestino }] } });
    const origem = profissionais.filter(p => p.nome === input.medicoOrigem), destino = profissionais.filter(p => p.nome === input.medicoDestino);
    if (origem.length !== 1 || destino.length !== 1) throw BadRequest('PROFISSIONAL_INVALIDO', 'Origem e destino devem identificar profissionais ativos desta prefeitura sem ambiguidade.');
    return prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`centro-agenda:${prefeituraId}`}))`;
      const encaminhamentos = await tx.encaminhamento.findMany({ where: { deletadoEm: null, status: 'APROVADO', statusAtendimentoCentro: 'AGENDADO', profissionalAgendadoId: origem[0]!.id, ...(scope.kind === 'UBS' ? { ubsId: scope.ubsId } : { ubs: { prefeituraId } }), agendamentoPrevisto: { gte: dataHoraCentro(input.dataOrigem), lt: dataHoraCentro(somarDiasCentro(input.dataOrigem, 1)) } }, orderBy: { agendamentoPrevisto: 'asc' } });
      const escalas = await tx.escalaEspecialista.findMany({ where: { prefeituraId, medicoId: destino[0]!.id, ativo: true } });
      for (const enc of encaminhamentos) {
        const escalasValidas = escalas.filter(e => e.especialidade === enc.especialidadeSolicitada && e.tipoServico === enc.tipoServico && escalaAtendeNaData(e, input.dataDestino));
        let horario: Date | undefined;
        for (const escala of escalasValidas) {
          for (const hora of gerarSlotsEscala(escala)) {
            const data = dataHoraCentro(input.dataDestino, hora);
            try { await validarReservaCentro(tx, { prefeituraId, profissionalId: destino[0]!.id, especialidade: enc.especialidadeSolicitada, tipoServico: escala.tipoServico, data, ignorarId: enc.id }); horario = data; break; }
            catch (e: any) { if (!['HORARIO_OCUPADO', 'HORARIO_PASSADO', 'HORARIO_FORA_ESCALA'].includes(e.code)) throw e; }
          }
          if (horario) break;
        }
        if (!horario) throw BadRequest('SEM_VAGAS_REMANEJAMENTO', 'O destino não tem vagas compatíveis para todos os pacientes. Nenhum remanejamento foi salvo.');
        await tx.encaminhamento.update({ where: { id: enc.id }, data: { profissionalAgendado: destino[0]!.nome, profissionalAgendadoId: destino[0]!.id, agendamentoPrevisto: horario, observacoesRegulacao: `Remanejado de ${input.medicoOrigem} (${input.dataOrigem}) para ${input.medicoDestino} (${input.dataDestino}).` } });
        await tx.eventoTimeline.create({ data: { encaminhamentoId: enc.id, tipo: 'AGENDADO', titulo: 'Remanejamento de agenda', descricao: `Consulta transferida para ${input.medicoDestino} em ${input.dataDestino}.`, autor: input.atendenteNome, autorPapel: 'Gestão do Centro' } });
      }
      await tx.auditoriaLog.create({ data: { acao: 'CENTRO_GESTAO_REMANEJAMENTO_LOTE', recurso: 'CENTRO_ESPECIALIDADES', atendenteId: input.atendenteId, payload: { ...input, totalRemanejados: encaminhamentos.length, smsEnviado: false } } });
      return { totalRemanejados: encaminhamentos.length, dataDestino: input.dataDestino, medicoDestino: input.medicoDestino, smsEnviado: false };
    }, { timeout: 20000 });
  }
}
