import { TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento, SinaisVitaisTriagem } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound } from '../../../../shared/errors';

export interface ChamarTriagemInput {
  encaminhamentoId: string;
  enfermeiro: {
    id: string;
    nome: string;
    coren?: string;
  };
  consultorio?: string;
}

export interface RealizarTriagemInput {
  encaminhamentoId: string;
  enfermeiro: {
    id: string;
    nome: string;
    coren?: string;
  };
  sinaisVitais: SinaisVitaisTriagem;
  consultorio?: string;
}

export interface ListarFilaTriagemInput {
  centro?: 'CEM' | 'CEO' | 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO';
  data?: string; // YYYY-MM-DD
  status?: 'PENDENTE' | 'CHAMADO' | 'CONCLUIDO' | 'TODOS';
}

export class TriagemEnfermagemUseCase {
  async chamarTriagem(input: ChamarTriagemInput, scope: AccessScope): Promise<Encaminhamento> {
    const row = await prisma.encaminhamento.findUnique({
      where: { id: input.encaminhamentoId },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    if (!row) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }

    ensureUbsAcessivel(scope, { id: row.ubsId, prefeituraId: (row as any).ubs?.prefeituraId ?? '' });

    const now = new Date();
    const consultorio = input.consultorio || 'SALA DE TRIAGEM 01 — ENFERMAGEM';
    const corenStr = input.enfermeiro.coren ? ` (COREN ${input.enfermeiro.coren})` : '';

    const updated = await prisma.$transaction(async (tx) => {
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: row.id,
          tipo: TipoEventoTimeline.OBSERVACAO,
          titulo: 'Paciente Chamado para Triagem de Enfermagem',
          descricao: `Chamado para ${consultorio} pelo(a) Enf. ${input.enfermeiro.nome}${corenStr} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
          autor: input.enfermeiro.nome,
          autorPapel: 'Enfermeiro(a)',
        },
      });

      const res = await tx.encaminhamento.update({
        where: { id: row.id },
        data: {
          chamadaTriagemEm: now,
          consultorioTriagem: consultorio,
          triagemPorId: input.enfermeiro.id,
          triagemPorNome: input.enfermeiro.nome,
          triagemCoren: input.enfermeiro.coren || null,
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      await tx.auditoriaLog.create({
        data: {
          acao: 'CENTRO_ENFERMAGEM_CHAMAR_TRIAGEM',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: row.id,
          atendenteId: input.enfermeiro.id,
          payload: {
            protocolo: row.protocolo,
            pacienteNome: row.pacienteNome,
            enfermeiroNome: input.enfermeiro.nome,
            consultorio,
          },
        },
      });

      return res;
    });

    return rowParaEncaminhamento(updated);
  }

  async realizarTriagem(input: RealizarTriagemInput, scope: AccessScope): Promise<Encaminhamento> {
    const row = await prisma.encaminhamento.findUnique({
      where: { id: input.encaminhamentoId },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    if (!row) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }

    ensureUbsAcessivel(scope, { id: row.ubsId, prefeituraId: (row as any).ubs?.prefeituraId ?? '' });

    const now = new Date();
    const corenStr = input.enfermeiro.coren ? ` (COREN ${input.enfermeiro.coren})` : '';
    const sv = input.sinaisVitais;

    const resumoVitais = [
      sv.pressaoArterial ? `PA: ${sv.pressaoArterial}` : null,
      sv.frequenciaCardiaca ? `FC: ${sv.frequenciaCardiaca} bpm` : null,
      sv.temperatura ? `Temp: ${sv.temperatura}°C` : null,
      sv.glicemiaCapilar ? `Glicemia: ${sv.glicemiaCapilar} mg/dL` : null,
      sv.saturacaoO2 ? `SpO2: ${sv.saturacaoO2}%` : null,
      sv.imc ? `IMC: ${sv.imc.toFixed(1)} (${sv.classificacaoImc || 'Avaliado'})` : null,
      sv.classificacaoRisco ? `Risco: ${sv.classificacaoRisco}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: row.id,
          tipo: TipoEventoTimeline.OBSERVACAO,
          titulo: 'Triagem Clínica de Enfermagem Concluída',
          descricao: `Sinais vitais e antropometria registrados pelo(a) Enf. ${input.enfermeiro.nome}${corenStr}. ${resumoVitais}. ${sv.queixaPrincipal ? `Queixa: ${sv.queixaPrincipal}.` : ''} ${sv.observacoes ? `Obs: ${sv.observacoes}` : ''}`,
          autor: input.enfermeiro.nome,
          autorPapel: 'Enfermeiro(a)',
        },
      });

      const res = await tx.encaminhamento.update({
        where: { id: row.id },
        data: {
          triagemRealizada: true,
          triagemEm: now,
          triagemPorId: input.enfermeiro.id,
          triagemPorNome: input.enfermeiro.nome,
          triagemCoren: input.enfermeiro.coren || null,
          triagemDados: sv as any,
          consultorioTriagem: input.consultorio || row.consultorioTriagem,
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      await tx.auditoriaLog.create({
        data: {
          acao: 'CENTRO_ENFERMAGEM_REALIZAR_TRIAGEM',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: row.id,
          atendenteId: input.enfermeiro.id,
          payload: {
            protocolo: row.protocolo,
            pacienteNome: row.pacienteNome,
            enfermeiroNome: input.enfermeiro.nome,
            coren: input.enfermeiro.coren,
            sinaisVitais: sv,
          } as any,
        },
      });

      return res;
    });

    return rowParaEncaminhamento(updated);
  }

  async listarFilaTriagem(input: ListarFilaTriagemInput, scope: AccessScope): Promise<{ total: number; fila: Encaminhamento[] }> {
    const ehCeo = input.centro === 'CEO' || input.centro === 'CENTRO_ODONTOLOGICO';

    const where: any = {
      deletadoEm: null,
      status: { in: ['APROVADO', 'AGENDADO'] },
    };

    if (scope.kind === 'PREFEITURA') {
      where.ubs = { prefeituraId: scope.prefeituraId };
    } else if (scope.kind === 'UBS') {
      where.ubsId = scope.ubsId;
    }

    if (ehCeo) {
      where.OR = [
        { canalRoteamento: 'CENTRO_ODONTOLOGICO' },
        { destinoRegulacao: 'CENTRO_ODONTOLOGICO' },
        { especialidadeSolicitada: { contains: 'Odonto', mode: 'insensitive' } },
        { localAgendamento: { contains: 'CEO', mode: 'insensitive' } },
      ];
    } else {
      where.OR = [
        { canalRoteamento: 'CENTRO_ESPECIALIDADES' },
        { destinoRegulacao: 'CENTRO_ESPECIALIDADES' },
        {
          AND: [
            { canalRoteamento: null, destinoRegulacao: null },
            { NOT: { especialidadeSolicitada: { contains: 'Odonto', mode: 'insensitive' } } },
            { NOT: { localAgendamento: { contains: 'CEO', mode: 'insensitive' } } },
          ],
        },
      ];
    }

    if (input.status === 'PENDENTE') {
      where.triagemRealizada = false;
      where.chamadaTriagemEm = null;
    } else if (input.status === 'CHAMADO') {
      where.triagemRealizada = false;
      where.chamadaTriagemEm = { not: null };
    } else if (input.status === 'CONCLUIDO') {
      where.triagemRealizada = true;
    }

    const rows = await prisma.encaminhamento.findMany({
      where,
      include: INCLUDE_ENCAMINHAMENTO_FULL,
      orderBy: [
        { prioridade: 'desc' },
        { chamadaTriagemEm: 'desc' },
        { criadoEm: 'asc' },
      ],
      take: 100,
    });

    const lista = rows.map((r) => rowParaEncaminhamento(r as any));

    return {
      total: lista.length,
      fila: lista,
    };
  }
}
