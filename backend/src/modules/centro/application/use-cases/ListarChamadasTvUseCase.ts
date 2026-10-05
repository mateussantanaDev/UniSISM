import { prisma } from '../../../../infrastructure/database/prisma';

type RegistroChamada = {
  id: string;
  protocolo: string;
  pacienteNome: string;
  profissionalAgendado: string | null;
  especialidadeSolicitada: string;
  localAgendamento: string | null;
  consultorioTriagem: string | null;
  triagemPorNome: string | null;
  triagemRealizada: boolean;
  chamadaTriagemEm: Date | null;
  chamadaMedicoEm: Date | null;
  statusAtendimentoCentro: string | null;
};

/** A presença e atualizações cadastrais nunca são eventos de chamada. */
export function montarChamadasTv(rows: RegistroChamada[]) {
  return rows.flatMap((row) => {
    const triagem = !row.triagemRealizada && row.chamadaTriagemEm;
    const medico = row.statusAtendimentoCentro === 'EM_ATENDIMENTO' && row.chamadaMedicoEm;
    const tipo = triagem && (!medico || triagem > medico) ? 'TRIAGEM' : medico ? 'CONSULTA' : null;
    const chamadoEm = tipo === 'TRIAGEM' ? row.chamadaTriagemEm : row.chamadaMedicoEm;
    if (!tipo || !chamadoEm) return [];
    return [{
      id: row.id,
      eventoId: `${row.id}:${tipo}:${chamadoEm.toISOString()}`,
      protocolo: row.protocolo,
      pacienteNome: row.pacienteNome,
      consultorio: (tipo === 'TRIAGEM' ? row.consultorioTriagem : row.localAgendamento)?.trim() || 'Consulte a recepção',
      medicoNome: tipo === 'TRIAGEM' ? row.triagemPorNome || 'Equipe de Enfermagem' : row.profissionalAgendado || 'Profissional do Centro',
      especialidade: tipo === 'TRIAGEM' ? 'Triagem Clínica & Sinais Vitais' : row.especialidadeSolicitada,
      tipo,
      horario: chamadoEm.toLocaleTimeString('pt-BR', { timeZone: 'America/Recife', hour: '2-digit', minute: '2-digit' }),
      status: row.statusAtendimentoCentro,
      chamadoEm: chamadoEm.toISOString(),
    }];
  }).sort((a, b) => b.chamadoEm.localeCompare(a.chamadoEm));
}

export class ListarChamadasTvUseCase {
  async exec(centro: 'CEM' | 'CEO') {
    const canal = centro === 'CEO' ? 'CENTRO_ODONTOLOGICO' : 'CENTRO_ESPECIALIDADES';
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const inicio = new Date(`${hoje}T00:00:00-03:00`);
    const fim = new Date(inicio.getTime() + 86_400_000);
    const rows = await prisma.encaminhamento.findMany({
      where: {
        deletadoEm: null,
        status: 'APROVADO',
        statusAtendimentoCentro: { in: ['EM_ATENDIMENTO', 'AGUARDANDO_ATENDIMENTO'] },
        AND: [
          { OR: [{ canalRoteamento: canal }, { destinoRegulacao: canal }] },
          { OR: [{ chamadaTriagemEm: { gte: inicio, lt: fim } }, { chamadaMedicoEm: { gte: inicio, lt: fim } }] },
        ],
      },
      select: { id: true, protocolo: true, pacienteNome: true, profissionalAgendado: true, especialidadeSolicitada: true, localAgendamento: true, consultorioTriagem: true, triagemPorNome: true, triagemRealizada: true, chamadaTriagemEm: true, chamadaMedicoEm: true, statusAtendimentoCentro: true },
    });
    const chamadas = montarChamadasTv(rows).filter((c) => new Date(c.chamadoEm) >= inicio && new Date(c.chamadoEm) < fim);
    return {
      centro,
      nomeCentro: centro === 'CEO' ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)',
      tipoLocal: centro === 'CEO' ? 'CADEIRA ODONTOLÓGICA' : 'CONSULTÓRIO',
      chamadaAtual: chamadas[0] ?? null,
      ultimasChamadas: chamadas.slice(1, 6),
      totalChamadas: chamadas.length,
      servidorHorario: new Date().toISOString(),
    };
  }
}
