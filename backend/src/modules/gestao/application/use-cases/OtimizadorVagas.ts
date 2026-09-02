import { StatusEncaminhamento } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';

export interface DoctorInfo {
  nome: string;
  crm?: string;
  especialidade: string;
  diasSemana: number[]; // 0 = Domingo, 1 = Segunda, 2 = Terça, etc.
  horaInicio: number;
  horaFim: number;
  duracaoMinutos?: number;
}

const DIA_MAP: Record<string, number> = {
  domingo: 0,
  dom: 0,
  '0': 0,
  segunda: 1,
  'segunda-feira': 1,
  seg: 1,
  '1': 1,
  terca: 2,
  terça: 2,
  'terca-feira': 2,
  'terça-feira': 2,
  ter: 2,
  '2': 2,
  quarta: 3,
  'quarta-feira': 3,
  qua: 3,
  '3': 3,
  quinta: 4,
  'quinta-feira': 4,
  qui: 4,
  '4': 4,
  sexta: 5,
  'sexta-feira': 5,
  sex: 5,
  '5': 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
  '6': 6,
};

function parseDiasSemana(dias: string[]): number[] {
  const result = new Set<number>();
  for (const d of dias) {
    const normalizado = d.trim().toLowerCase();
    if (normalizado in DIA_MAP) {
      result.add(DIA_MAP[normalizado]!);
    }
  }
  return result.size > 0 ? Array.from(result) : [1, 2, 3, 4, 5]; // Default seg a sex
}

function parseHora(horarioStr: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(horarioStr.trim());
  if (m && m[1]) return Number(m[1]);
  return fallback;
}

export async function findDoctorAsync(
  profissional?: string,
  nota?: string,
  especialidade?: string,
): Promise<DoctorInfo> {
  const searchStr = `${profissional ?? ''} ${nota ?? ''}`.toLowerCase().trim();

  // 1. Busca todas as escalas ativas do banco
  try {
    const escalas = await prisma.escalaEspecialista.findMany({
      where: { ativo: true, status: 'ATIVA' },
      orderBy: { medicoNome: 'asc' },
    });

    if (escalas && escalas.length > 0) {
      // Busca por nome do profissional
      if (searchStr) {
        for (const e of escalas) {
          const lastName = e.medicoNome.replace(/Dr\.|Dra\./gi, '').trim().toLowerCase();
          if (lastName && searchStr.includes(lastName)) {
            return {
              nome: e.medicoNome,
              crm: e.crm,
              especialidade: e.especialidade,
              diasSemana: parseDiasSemana(e.diasSemana),
              horaInicio: parseHora(e.horarioInicio, 8),
              horaFim: parseHora(e.horarioFim, 17),
              duracaoMinutos: e.duracaoMinutos,
            };
          }
        }
      }

      // Busca por especialidade
      if (especialidade) {
        const matchSpec = escalas.find(
          (e) =>
            e.especialidade.toLowerCase() === especialidade.toLowerCase() ||
            e.especialidade.toLowerCase().includes(especialidade.toLowerCase()) ||
            especialidade.toLowerCase().includes(e.especialidade.toLowerCase()),
        );
        if (matchSpec) {
          return {
            nome: matchSpec.medicoNome,
            crm: matchSpec.crm,
            especialidade: matchSpec.especialidade,
            diasSemana: parseDiasSemana(matchSpec.diasSemana),
            horaInicio: parseHora(matchSpec.horarioInicio, 8),
            horaFim: parseHora(matchSpec.horarioFim, 17),
            duracaoMinutos: matchSpec.duracaoMinutos,
          };
        }
      }

      // Se não buscou por especialidade ou profissional específico, retorna a primeira escala
      if (!especialidade && !profissional) {
        const primeira = escalas[0]!;
        return {
          nome: primeira.medicoNome,
          crm: primeira.crm,
          especialidade: primeira.especialidade,
          diasSemana: parseDiasSemana(primeira.diasSemana),
          horaInicio: parseHora(primeira.horarioInicio, 8),
          horaFim: parseHora(primeira.horarioFim, 17),
          duracaoMinutos: primeira.duracaoMinutos,
        };
      }
    }
  } catch (err) {
    // Fallback gracioso se o banco estiver desconectado ou em migração
    console.info('[UniSISM] Banco de escalas não acessível no momento — utilizando mapeamento inteligente fallback.');
  }

  // Fallback padrão se ainda não houver escalas cadastradas
  const specNome = especialidade || 'Clínica Geral';
  return {
    nome: profissional ? profissional.trim() : `Médico Especialista (${specNome})`,
    especialidade: specNome,
    diasSemana: [1, 2, 3, 4, 5], // Seg a Sex
    horaInicio: 8,
    horaFim: 17,
    duracaoMinutos: 20,
  };
}

export async function calcularOtimizacaoAgendamento(params: {
  profissional?: string;
  nota?: string;
  especialidade: string;
  prioridade: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';
}): Promise<{ dateStr: string; timeStr: string; dateTime: Date; doctor: DoctorInfo }> {
  const doctor = await findDoctorAsync(params.profissional, params.nota, params.especialidade);

  // Busca todos os agendamentos aprovados no futuro para este médico
  const appointments = await prisma.encaminhamento.findMany({
    where: {
      profissionalAgendado: { contains: doctor.nome },
      status: StatusEncaminhamento.APROVADO,
      agendamentoPrevisto: { gte: new Date() },
    },
    select: {
      agendamentoPrevisto: true,
    },
  });

  const bookedDates = appointments
    .map((a) => a.agendamentoPrevisto?.toISOString())
    .filter(Boolean) as string[];

  // Define o offset com base na prioridade clínica
  let daysOffset = 1;
  if (params.prioridade === 'URGENTE') daysOffset = 3;
  else if (params.prioridade === 'PRIORITARIA') daysOffset = 7;
  else if (params.prioridade === 'ELETIVA') daysOffset = 14;

  const startSearch = new Date();
  startSearch.setDate(startSearch.getDate() + daysOffset);
  startSearch.setUTCHours(0, 0, 0, 0);

  let current = new Date(startSearch);

  for (let d = 0; d < 180; d++) {
    const dayOfWeek = current.getUTCDay();

    if (doctor.diasSemana.includes(dayOfWeek)) {
      const year = current.getUTCFullYear();
      const month = current.getUTCMonth();
      const date = current.getUTCDate();

      for (let hour = doctor.horaInicio; hour < doctor.horaFim; hour++) {
        for (const min of [0, 30]) {
          const slotDateTime = new Date(Date.UTC(year, month, date, hour, min, 0, 0));

          if (slotDateTime.getTime() <= Date.now()) {
            continue;
          }

          const slotIso = slotDateTime.toISOString();
          if (!bookedDates.includes(slotIso)) {
            const pad = (n: number) => String(n).padStart(2, '0');
            const dateStr = `${year}-${pad(month + 1)}-${pad(date)}`;
            const timeStr = `${pad(hour)}:${pad(min)}`;
            return { dateStr, timeStr, dateTime: slotDateTime, doctor };
          }
        }
      }
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const fallbackDate = new Date();
  fallbackDate.setDate(fallbackDate.getDate() + daysOffset);
  const year = fallbackDate.getUTCFullYear();
  const month = fallbackDate.getUTCMonth();
  const date = fallbackDate.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');

  return {
    dateStr: `${year}-${pad(month + 1)}-${pad(date)}`,
    timeStr: '08:00',
    dateTime: new Date(Date.UTC(year, month, date, 8, 0, 0, 0)),
    doctor,
  };
}
