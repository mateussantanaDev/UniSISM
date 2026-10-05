import { validarReservaCentro } from '../../shared/reservaCentro';
import { prisma } from '../../../../infrastructure/database/prisma';
import { NotFound, BadRequest } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';
import { type EscalaEspecialista, Prisma } from '../../../../../generated/prisma';
import { filterEspecialidadesByCentro } from '../../shared/centroClassifier';
import { validarEscala, dataHoraCentro, dataLocalCentro, somarDiasCentro, escalaAtendeNaData, gerarSlotsEscala } from '../../shared/escalaCentro';

export interface EscalaEspecialistaDTO {
  id?: string; medicoId?: string; medicoNome: string; crm: string; especialidade: string;
  tipoServico?: 'CONSULTA' | 'PROCEDIMENTO'; procedimentoId?: string;
  diasSemana?: string[]; horarioInicio: string; horarioFim: string; duracaoMinutos: number; vagasPorTurno: number;
  status?: 'ATIVA' | 'FERIAS' | 'LICENCA' | 'BLOQUEADA'; ativo?: boolean;
  tipoRecorrencia?: 'SEMANAL' | 'QUINZENAL' | 'DATAS_ESPECIFICAS' | 'MUTIRAO'; datasEspecificas?: string[]; isMutirao?: boolean;
  intervaloDias?: number; dataInicioRecorrencia?: string | null;
  ausenciaInicio?: string | null; ausenciaFim?: string | null; acaoAusencia?: 'FILA_ESPERA' | 'REMANEJAR' | null; observacoes?: string | null;
  pacientesAfetados?: number;
}
const dto = (e: EscalaEspecialista): EscalaEspecialistaDTO => ({ ...e, medicoId: e.medicoId ?? undefined, procedimentoId: e.procedimentoId ?? undefined, tipoRecorrencia: e.tipoRecorrencia as EscalaEspecialistaDTO['tipoRecorrencia'], intervaloDias: e.intervaloDias ?? undefined, acaoAusencia: e.acaoAusencia as EscalaEspecialistaDTO['acaoAusencia'] });
function verificarEscopo(scope: AccessScope, row: { prefeituraId: string | null }) {
  if (scope.kind !== 'GLOBAL' && (!scope.prefeituraId || scope.prefeituraId !== row.prefeituraId)) throw NotFound('ESCALA_NAO_ENCONTRADA', 'Escala não encontrada');
}
function payload(data: EscalaEspecialistaDTO): Prisma.EscalaEspecialistaUncheckedUpdateInput {
  return { medicoId: data.medicoId, medicoNome: data.medicoNome, crm: data.crm, especialidade: data.especialidade, tipoServico: data.tipoServico ?? 'CONSULTA', procedimentoId: data.procedimentoId, diasSemana: [...new Set(data.diasSemana ?? [])], horarioInicio: data.horarioInicio, horarioFim: data.horarioFim, duracaoMinutos: data.duracaoMinutos, vagasPorTurno: data.vagasPorTurno, status: data.status ?? 'ATIVA', ativo: data.ativo ?? true, tipoRecorrencia: data.tipoRecorrencia ?? 'SEMANAL', datasEspecificas: [...new Set(data.datasEspecificas ?? [])].sort(), isMutirao: data.tipoRecorrencia === 'MUTIRAO', intervaloDias: data.tipoRecorrencia === 'QUINZENAL' ? 14 : 7, dataInicioRecorrencia: data.dataInicioRecorrencia ?? null, ausenciaInicio: data.status === 'ATIVA' ? null : data.ausenciaInicio, ausenciaFim: data.status === 'ATIVA' ? null : data.ausenciaFim, acaoAusencia: data.status === 'ATIVA' ? null : data.acaoAusencia, observacoes: data.observacoes };
}
export class GestaoEscalasUseCase {
  async listarEscalas(scope: AccessScope, centro?: string): Promise<EscalaEspecialistaDTO[]> {
    const rows = await prisma.escalaEspecialista.findMany({ where: { ativo: true, ...(scope.kind === 'GLOBAL' ? {} : { prefeituraId: scope.prefeituraId ?? '__SEM_PREFEITURA__' }) }, orderBy: { medicoNome: 'asc' } });
    return filterEspecialidadesByCentro(rows, centro).map(dto);
  }
  async criarEscala(data: EscalaEspecialistaDTO & { prefeituraId?: string }, scope: AccessScope, atendenteId: string) {
    validarEscala(data);
    const prefeituraId = scope.kind === 'GLOBAL' ? data.prefeituraId : scope.prefeituraId;
    if (!prefeituraId) throw BadRequest('PREFEITURA_OBRIGATORIA', 'Informe a prefeitura da escala.');
    if (data.medicoId && !await prisma.atendente.findFirst({ where: { id: data.medicoId, prefeituraId, ativo: true, deletadoEm: null, role: { in: ['MEDICO', 'MEDICO_ESPECIALISTA'] } } })) throw BadRequest('PROFISSIONAL_INVALIDO', 'Selecione um profissional ativo desta prefeitura.');
    return prisma.$transaction(async tx => {
      const row = await tx.escalaEspecialista.create({ data: { ...(payload(data) as Prisma.EscalaEspecialistaUncheckedCreateInput), prefeituraId } });
      await tx.auditoriaLog.create({ data: { acao: 'CENTRO_GESTAO_CRIAR_ESCALA', recurso: 'CENTRO_ESPECIALIDADES', recursoId: row.id, atendenteId, payload: data as unknown as Prisma.InputJsonValue } });
      return dto(row);
    });
  }
  async atualizarEscala(id: string, change: Partial<EscalaEspecialistaDTO>, scope: AccessScope, atendenteId: string) {
    const existing = await prisma.escalaEspecialista.findUnique({ where: { id } });
    if (!existing?.ativo) throw NotFound('ESCALA_NAO_ENCONTRADA', 'Escala não encontrada');
    verificarEscopo(scope, existing);
    const data: EscalaEspecialistaDTO = { ...dto(existing), ...change };
    if (data.status === 'ATIVA') { data.ausenciaInicio = null; data.ausenciaFim = null; data.acaoAusencia = null; }
    validarEscala(data);
    if (data.medicoId && !await prisma.atendente.findFirst({ where: { id: data.medicoId, prefeituraId: existing.prefeituraId, ativo: true, deletadoEm: null, role: { in: ['MEDICO', 'MEDICO_ESPECIALISTA'] } } })) throw BadRequest('PROFISSIONAL_INVALIDO', 'Selecione um profissional ativo desta prefeitura.');
    return prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`centro-agenda:${existing.prefeituraId}`}))`;
      const row = await tx.escalaEspecialista.update({ where: { id }, data: payload(data) });
      let pacientesAfetados = 0;
      if (change.status && change.status !== 'ATIVA' && data.ausenciaInicio && data.ausenciaFim) {
        const afetados = await tx.encaminhamento.findMany({ where: { deletadoEm: null, ubs: { prefeituraId: existing.prefeituraId! }, status: 'APROVADO', statusAtendimentoCentro: 'AGENDADO', especialidadeSolicitada: existing.especialidade, ...(existing.medicoId ? { profissionalAgendadoId: existing.medicoId } : { profissionalAgendado: existing.medicoNome }), agendamentoPrevisto: { gte: dataHoraCentro(data.ausenciaInicio), lt: dataHoraCentro(somarDiasCentro(data.ausenciaFim, 1)) } }, orderBy: { agendamentoPrevisto: 'asc' } });
        if (afetados.length && !data.acaoAusencia) throw BadRequest('ACAO_AUSENCIA_OBRIGATORIA', 'Selecione o tratamento dos pacientes agendados no período.');
        const alternativas = data.acaoAusencia === 'REMANEJAR' ? await tx.escalaEspecialista.findMany({ where: { id: { not: id }, prefeituraId: existing.prefeituraId, ativo: true, especialidade: existing.especialidade, tipoServico: existing.tipoServico, ...(existing.medicoId ? { medicoId: { not: existing.medicoId } } : { medicoNome: { not: existing.medicoNome } }) }, orderBy: { medicoNome: 'asc' } }) : [];
        for (const enc of afetados) {
          let update: Prisma.EncaminhamentoUncheckedUpdateInput = { status: 'AGUARDANDO_REGULACAO', presencaRegistradaEm: null, triagemRealizada: false, triagemDados: Prisma.DbNull, chamadaTriagemEm: null, chamadaMedicoEm: null, agendamentoPrevisto: null, profissionalAgendadoId: null, profissionalAgendado: null, statusAtendimentoCentro: null, observacoesRegulacao: 'Retornado à fila por ausência do profissional. ' + (data.observacoes ?? '') };
          if (data.acaoAusencia === 'REMANEJAR') {
            let destino: { escala: EscalaEspecialista; instante: Date } | undefined;
            const inicio = dataLocalCentro(enc.agendamentoPrevisto!) < dataLocalCentro() ? dataLocalCentro() : dataLocalCentro(enc.agendamentoPrevisto!);
            for (let n = 0; n < 60 && !destino; n++) for (const alternativa of alternativas) {
              const dia = somarDiasCentro(inicio, n); if (!escalaAtendeNaData(alternativa, dia)) continue;
              for (const hora of gerarSlotsEscala(alternativa)) {
                const instante = dataHoraCentro(dia, hora); if (instante <= new Date()) continue;
                if (!alternativa.medicoId) continue;
                try {
                  await validarReservaCentro(tx, { prefeituraId: existing.prefeituraId!, profissionalId: alternativa.medicoId, especialidade: existing.especialidade, tipoServico: existing.tipoServico, data: instante, ignorarId: enc.id });
                  destino = { escala: alternativa, instante }; break;
                } catch(e: any) { if (!['HORARIO_OCUPADO', 'HORARIO_PASSADO', 'HORARIO_FORA_ESCALA'].includes(e.code)) throw e; }

              }
              if (destino) break;
            }
            if (!destino) throw BadRequest('SEM_VAGAS_REMANEJAMENTO', 'Não há vagas para remanejar todos os pacientes. Nenhuma alteração foi aplicada; escolha retornar à fila.');
            update = { presencaRegistradaEm: null, triagemRealizada: false, triagemDados: Prisma.DbNull, chamadaTriagemEm: null, chamadaMedicoEm: null, necessitaTriagem: destino.escala.necessitaTriagem, agendamentoPrevisto: destino.instante, profissionalAgendadoId: destino.escala.medicoId, profissionalAgendado: destino.escala.medicoNome, observacoesRegulacao: 'Remanejamento por ausência do profissional. ' + (data.observacoes ?? '') };
          }
          await tx.encaminhamento.update({ where: { id: enc.id }, data: update });
          await tx.eventoTimeline.create({ data: { encaminhamentoId: enc.id, tipo: 'AGENDADO', titulo: data.acaoAusencia === 'REMANEJAR' ? 'Remanejamento por ausência' : 'Retorno à fila por ausência', descricao: `${data.ausenciaInicio} a ${data.ausenciaFim}; ${data.observacoes ?? ''}`, autor: atendenteId, autorPapel: 'Gestão do Centro' } });
          pacientesAfetados++;
        }
      }
      await tx.auditoriaLog.create({ data: { acao: 'CENTRO_GESTAO_ATUALIZAR_ESCALA', recurso: 'CENTRO_ESPECIALIDADES', recursoId: id, atendenteId, payload: { ...change, pacientesAfetados } as Prisma.InputJsonValue } });
      return { ...dto(row), pacientesAfetados };
    }, { timeout: 20000 });
  }
  async deletarEscala(id: string, scope: AccessScope, atendenteId: string) {
    const row = await prisma.escalaEspecialista.findUnique({ where: { id } });
    if (!row?.ativo) throw NotFound('ESCALA_NAO_ENCONTRADA', 'Escala não encontrada');
    verificarEscopo(scope, row);
    if (await prisma.encaminhamento.count({ where: { deletadoEm: null, status: 'APROVADO', statusAtendimentoCentro: 'AGENDADO', ubs: { prefeituraId: row.prefeituraId! }, especialidadeSolicitada: row.especialidade, ...(row.medicoId ? { profissionalAgendadoId: row.medicoId } : { profissionalAgendado: row.medicoNome }), agendamentoPrevisto: { gte: new Date() } } })) throw BadRequest('ESCALA_COM_AGENDAMENTOS', 'Trate os pacientes agendados por meio de ausência ou remanejamento antes de inativar a escala.');
    await prisma.$transaction([prisma.escalaEspecialista.update({ where: { id }, data: { ativo: false } }), prisma.auditoriaLog.create({ data: { acao: 'CENTRO_GESTAO_DELETAR_ESCALA', recurso: 'CENTRO_ESPECIALIDADES', recursoId: id, atendenteId } })]);
  }
}
