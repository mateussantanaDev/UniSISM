import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { filterEspecialidadesByCentro } from '../../shared/centroClassifier';
import { dataLocalCentro, horaLocalCentro, dataHoraCentro, somarDiasCentro, escalaAtendeNaData, gerarSlotsEscala, minutosHoraCentro } from '../../shared/escalaCentro';

export interface CalcularAlocacaoVagaInput {
  centro?: 'CEM' | 'CEO' | 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO';
  especialidade?: string; medicoNome?: string; medicoId?: string;
  prioridade?: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';
  tipoServico?: 'CONSULTA' | 'PROCEDIMENTO'; procedimento?: string; dataBase?: string | Date;
}
export interface SlotAlocadoResult {
  data: string; dataFormatada: string; hora: string; medicoId?: string; medicoNome: string; crm: string;
  especialidade: string; consultorio: string; prazoLegalSus: string; justificativaEscala: string;
  duracaoMinutos: number; tipoServico: string;
}
export interface SlotHorarioItem { hora: string; disponivel: boolean; motivo?: string }
export interface DiaDisponibilidadeSlot {
  data: string; dataFormatada: string; diaSemana: string; diasAteData: number;
  totalSlots: number; slotsLivres: number; slotsOcupados: number; slots: SlotHorarioItem[];
}
export interface CalcularAlocacaoVagaOutput { sucesso: boolean; mensagem?: string; alocacao?: SlotAlocadoResult; gradeDisponibilidade?: DiaDisponibilidadeSlot[] }
const normalizar = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
const formatoBr = (d: string) => d.split('-').reverse().join('/');

export class CalcularAlocacaoVagaCentroUseCase {
  async exec(input: CalcularAlocacaoVagaInput, scope: AccessScope): Promise<CalcularAlocacaoVagaOutput> {
    const municipio = scope.kind === 'GLOBAL' ? {} : { prefeituraId: scope.prefeituraId ?? '__SEM_PREFEITURA__' };
    const todas = await prisma.escalaEspecialista.findMany({ where: { ativo: true, ...municipio }, orderBy: { medicoNome: 'asc' } });
    const candidatas = filterEspecialidadesByCentro(todas, input.centro ?? 'CEM').filter(e =>
      (!input.medicoId || e.medicoId === input.medicoId) &&
      (input.medicoId || !input.medicoNome || normalizar(e.medicoNome) === normalizar(input.medicoNome)) &&
      (!input.especialidade || normalizar(e.especialidade) === normalizar(input.especialidade)) &&
      e.tipoServico === (input.tipoServico ?? 'CONSULTA')
    );
    if (!candidatas.length) return { sucesso: false, mensagem: 'Nenhuma escala corresponde ao profissional, especialidade e tipo de serviço selecionados.' };
    const agora = new Date();
    const dataBase = typeof input.dataBase === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.dataBase) ? input.dataBase : dataLocalCentro(input.dataBase ? new Date(input.dataBase) : agora);
    const inicio = dataBase < dataLocalCentro(agora) ? dataLocalCentro(agora) : dataBase;
    const fim = somarDiasCentro(inicio, 61);
    const whereEscopo = scope.kind === 'GLOBAL' ? {} : scope.kind === 'UBS' ? { ubsId: scope.ubsId } : { ubs: { prefeituraId: scope.prefeituraId } };
    const [reservas, legados, salas] = await Promise.all([
      prisma.encaminhamento.findMany({ where: { ...whereEscopo, deletadoEm: null, status: 'APROVADO', agendamentoPrevisto: { gte: dataHoraCentro(inicio), lt: dataHoraCentro(fim) } }, select: { profissionalAgendadoId: true, profissionalAgendado: true, agendamentoPrevisto: true, especialidadeSolicitada: true } }),
      prisma.agendamentoCentro.findMany({ where: { ...municipio, status: { not: 'CANCELADO' }, dataAgendamento: { gte: dataHoraCentro(inicio), lt: dataHoraCentro(fim) } }, select: { medicoId: true, medicoNome: true, dataAgendamento: true, especialidade: true } }),
      prisma.salaConsultorio.findMany({ where: { ...municipio, status: { not: 'MANUTENCAO' } }, orderBy: { codigo: 'asc' } }),
    ]);
    let escolhido: typeof candidatas[number] | undefined;
    let alocacao: SlotAlocadoResult | undefined;
    let grade: DiaDisponibilidadeSlot[] = [];
    const grupos = new Map<string, typeof candidatas>();
    for (const e of candidatas) { const key = e.medicoId || normalizar(e.medicoNome); grupos.set(key, [...(grupos.get(key) ?? []), e]); }
    for (const escalas of grupos.values()) {
      const med = escalas[0]!;
      const ocupados = [
        ...reservas.filter(a => med.medicoId ? a.profissionalAgendadoId === med.medicoId : !a.profissionalAgendadoId && normalizar(a.profissionalAgendado ?? '') === normalizar(med.medicoNome)).map(a => ({ data: a.agendamentoPrevisto!, esp: a.especialidadeSolicitada })),
        ...legados.filter(a => med.medicoId ? a.medicoId === med.medicoId : !a.medicoId && normalizar(a.medicoNome ?? '') === normalizar(med.medicoNome)).map(a => ({ data: a.dataAgendamento, esp: a.especialidade })),
      ];
      const gradeMedico: DiaDisponibilidadeSlot[] = [];
      let primeira: SlotAlocadoResult | undefined;
      for (let n = 0; n < 60; n++) {
        const dia = somarDiasCentro(inicio, n);
        const slots = new Map<string, SlotHorarioItem>();
        for (const escala of escalas.filter(e => escalaAtendeNaData(e, dia))) {
          for (const hora of gerarSlotsEscala(escala)) {
            const minuto = minutosHoraCentro(hora);
            const passado = dataHoraCentro(dia, hora).getTime() <= agora.getTime();
            const ocupado = ocupados.some(o => {
              if (dataLocalCentro(o.data) !== dia) return false;
              const inicioReserva = minutosHoraCentro(horaLocalCentro(o.data));
              const duracao = todas.find(e => (med.medicoId ? e.medicoId === med.medicoId : e.medicoNome === med.medicoNome) && e.especialidade === o.esp)?.duracaoMinutos ?? 20;
              return minuto < inicioReserva + duracao && minuto + escala.duracaoMinutos > inicioReserva;
            });
            const disponivel = !passado && !ocupado;
            slots.set(hora, { hora, disponivel, motivo: passado ? 'Horário já passado' : ocupado ? 'Profissional já possui atendimento neste horário' : undefined });
            if (disponivel && (!primeira || `${dia} ${hora}` < `${primeira.data} ${primeira.hora}`)) {
              const sala = salas.find(s => normalizar(s.especialidadePrincipal) === normalizar(escala.especialidade));
              primeira = { data: dia, dataFormatada: formatoBr(dia), hora, medicoId: escala.medicoId ?? undefined, medicoNome: escala.medicoNome, crm: escala.crm, especialidade: escala.especialidade, consultorio: sala ? `${sala.nome} (${sala.codigo})` : 'Sala a definir', prazoLegalSus: 'Primeiro horário disponível na escala', justificativaEscala: `Escala ${escala.tipoRecorrencia}: ${escala.horarioInicio} às ${escala.horarioFim}, limite ${escala.vagasPorTurno} vagas por turno.`, duracaoMinutos: escala.duracaoMinutos, tipoServico: escala.tipoServico };
            }
          }
        }
        if (slots.size) {
          const lista = [...slots.values()].sort((a,b) => a.hora.localeCompare(b.hora));
          const livres = lista.filter(s => s.disponivel).length;
          gradeMedico.push({ data: dia, dataFormatada: formatoBr(dia), diaSemana: new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Recife' }).format(dataHoraCentro(dia,'12:00')), diasAteData: n, totalSlots: lista.length, slotsLivres: livres, slotsOcupados: lista.length - livres, slots: lista });
        }
      }
      if (!escolhido || (primeira && (!alocacao || `${primeira.data} ${primeira.hora}` < `${alocacao.data} ${alocacao.hora}`))) { escolhido = med; alocacao = primeira; grade = gradeMedico; }
    }
    return alocacao ? { sucesso: true, alocacao, gradeDisponibilidade: grade } : { sucesso: false, mensagem: 'Sem horário disponível nos próximos 60 dias para os filtros e ausências informados.', gradeDisponibilidade: grade };
  }
}
