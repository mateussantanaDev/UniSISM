import { StatusEncaminhamento } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';

export interface DoctorInfo {
  nome: string;
  especialidade: string;
  diasSemana: number[]; // 1 = Monday, 2 = Tuesday, etc.
  horaInicio: number;
  horaFim: number;
}

export const DOCTORS: DoctorInfo[] = [
  {
    nome: 'Dr. Roberto Medeiros',
    especialidade: 'Cardiologia',
    diasSemana: [1, 3], // Segunda e Quarta
    horaInicio: 8,
    horaFim: 12,
  },
  {
    nome: 'Dra. Sandra Regina',
    especialidade: 'Cardiologia',
    diasSemana: [2, 4], // Terça e Quinta
    horaInicio: 13,
    horaFim: 17,
  },
  {
    nome: 'Dr. Fábio Alencar',
    especialidade: 'Oftalmologia',
    diasSemana: [2, 5], // Terça e Sexta
    horaInicio: 8,
    horaFim: 12,
  },
  {
    nome: 'Dra. Patrícia Silveira',
    especialidade: 'Oftalmologia',
    diasSemana: [1, 4], // Segunda e Quinta
    horaInicio: 13,
    horaFim: 17,
  },
];

export function findDoctor(profissional?: string, nota?: string, especialidade?: string): DoctorInfo {
  const searchStr = `${profissional ?? ''} ${nota ?? ''}`.toLowerCase();
  
  for (const doc of DOCTORS) {
    const lastName = doc.nome.replace(/Dr\.|Dra\./g, '').trim().toLowerCase();
    if (searchStr.includes(lastName)) {
      return doc;
    }
  }
  
  if (especialidade) {
    const docBySpec = DOCTORS.find(
      (d) => d.especialidade.toLowerCase() === especialidade.toLowerCase()
    );
    if (docBySpec) return docBySpec;
  }
  
  return DOCTORS[0]!;
}

export async function calcularOtimizacaoAgendamento(params: {
  profissional?: string;
  nota?: string;
  especialidade: string;
  prioridade: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';
}): Promise<{ dateStr: string; timeStr: string; dateTime: Date; doctor: DoctorInfo }> {
  const doctor = findDoctor(params.profissional, params.nota, params.especialidade);
  
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
