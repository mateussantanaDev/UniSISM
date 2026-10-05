import { CalcularAlocacaoVagaCentroUseCase } from './CalcularAlocacaoVagaCentroUseCase';
import { validarReservaCentro } from '../../shared/reservaCentro';
import { dataHoraRecife } from '../../shared/dataCentro';
import { resolverProfissionalCentro } from '../../shared/profissionalCentro';
import { TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import { calcularOtimizacaoAgendamento } from '../../../gestao/application/use-cases/OtimizadorVagas';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound, Unprocessable } from '../../../../shared/errors';

export interface DesmarcarReagendarInput {
  encaminhamentoId: string;
  acao: 'DESMARCAR' | 'REAGENDAR';
  motivo: string;
  atendente: {
    id: string;
    nome: string;
  };
}

export class DesmarcarReagendarConsultaUseCase {
  async exec(input: DesmarcarReagendarInput, scope: AccessScope): Promise<Encaminhamento> {
    const row = await prisma.encaminhamento.findUnique({
      where: { id: input.encaminhamentoId },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    if (!row) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }

    ensureUbsAcessivel(scope, { id: row.ubsId, prefeituraId: row.ubs?.prefeituraId ?? '' });

    if (['EM_ATENDIMENTO','CONCLUIDO'].includes(row.statusAtendimentoCentro || '')) throw Unprocessable('ATENDIMENTO_INICIADO','Não é possível cancelar ou reagendar um atendimento já iniciado');
    if (input.acao === 'DESMARCAR') {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.eventoTimeline.create({
          data: {
            encaminhamentoId: row.id,
            tipo: TipoEventoTimeline.OBSERVACAO,
            titulo: 'Consulta Desmarcada pela Recepção',
            descricao: `Agendamento cancelado. Motivo: ${input.motivo}`,
            autor: input.atendente.nome,
            autorPapel: 'Recepção · Centro de Especialidades',
          },
        });

        const res = await tx.encaminhamento.update({
          where: { id: row.id },
          data: {
            status: 'AGUARDANDO_REGULACAO',
            presencaRegistradaEm:null, chamadaTriagemEm:null, chamadaMedicoEm:null,
            agendamentoPrevisto: null,
            profissionalAgendado: null,
            profissionalAgendadoId: null,
            statusAtendimentoCentro: null,
          },
          include: INCLUDE_ENCAMINHAMENTO_FULL,
        });

        await tx.auditoriaLog.create({
          data: {
            acao: 'CENTRO_DESMARCAR_CONSULTA',
            recurso: 'CENTRO_ESPECIALIDADES',
            recursoId: row.id,
            atendenteId: input.atendente.id,
            payload: {
              protocolo: row.protocolo,
              motivo: input.motivo,
            },
          },
        });

        return res;
      });

      return rowParaEncaminhamento(updated);
    } else {
      // REAGENDAR
      const enc = rowParaEncaminhamento(row);
      const resultado = await new CalcularAlocacaoVagaCentroUseCase().exec({medicoId:row.profissionalAgendadoId || undefined, medicoNome:row.profissionalAgendado || undefined, especialidade:row.especialidadeSolicitada, tipoServico:row.tipoServico, centro:row.canalRoteamento === 'CENTRO_ODONTOLOGICO' ? 'CEO' : 'CEM'}, scope);
      if (!resultado.alocacao) throw Unprocessable('SEM_VAGA_DISPONIVEL',resultado.mensagem || 'Sem vaga disponível');
      const a = resultado.alocacao;
      const otimizado = {dateStr:a.data,timeStr:a.hora,dateTime:dataHoraRecife(a.data,a.hora),doctor:{nome:a.medicoNome}};

      const profissional = await resolverProfissionalCentro(row.ubsId, otimizado.doctor.nome);
      const updated = await prisma.$transaction(async (tx) => {
        if (!profissional) throw Unprocessable('PROFISSIONAL_OBRIGATORIO','Profissional não vinculado');
        const escala = await validarReservaCentro(tx, {prefeituraId:row.ubs.prefeituraId, profissionalId:profissional.id, especialidade:row.especialidadeSolicitada, tipoServico:row.tipoServico, data:otimizado.dateTime, ignorarId:row.id});
        await tx.eventoTimeline.create({
          data: {
            encaminhamentoId: row.id,
            tipo: TipoEventoTimeline.AGENDADO,
            titulo: 'Consulta Reagendada · Centro',
            descricao: `Reagendado para ${otimizado.dateStr} às ${otimizado.timeStr}. Médico: ${otimizado.doctor.nome}. Motivo: ${input.motivo}`,
            autor: input.atendente.nome,
            autorPapel: 'Recepção · Centro de Especialidades',
          },
        });

        const res = await tx.encaminhamento.update({
          where: { id: row.id },
          data: {
            agendamentoPrevisto: otimizado.dateTime,
            profissionalAgendado: otimizado.doctor.nome,
            profissionalAgendadoId: profissional?.id ?? null,
            statusAtendimentoCentro: 'AGENDADO',
            necessitaTriagem:escala.necessitaTriagem,
            presencaRegistradaEm:null, triagemRealizada:false, triagemEm:null, chamadaTriagemEm:null, chamadaMedicoEm:null,
          },
          include: INCLUDE_ENCAMINHAMENTO_FULL,
        });

        await tx.auditoriaLog.create({
          data: {
            acao: 'CENTRO_REAGENDAR_CONSULTA',
            recurso: 'CENTRO_ESPECIALIDADES',
            recursoId: row.id,
            atendenteId: input.atendente.id,
            payload: {
              protocolo: row.protocolo,
              novaData: otimizado.dateStr,
              horario: otimizado.timeStr,
              medico: otimizado.doctor.nome,
              motivo: input.motivo,
            },
          },
        });

        return res;
      });

      return rowParaEncaminhamento(updated);
    }
  }
}
