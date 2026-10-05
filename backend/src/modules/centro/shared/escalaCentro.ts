import { BadRequest } from '../../../shared/errors';

export interface EscalaCalendario {
  horarioInicio: string; horarioFim: string; duracaoMinutos: number; vagasPorTurno: number;
  diasSemana?: string[]; tipoRecorrencia?: string; datasEspecificas?: string[];
  dataInicioRecorrencia?: string | null; ativo?: boolean; status?: string;
  ausenciaInicio?: string | null; ausenciaFim?: string | null;
}
export function dataLocalCentro(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function horaLocalCentro(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Recife', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
export function dataHoraCentro(data: string, hora = '00:00'): Date {
  return new Date(`${data}T${hora}:00-03:00`);
}
export function somarDiasCentro(data: string, dias: number): string {
  const date = new Date(`${data}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + dias); return date.toISOString().slice(0, 10);
}
export function dataValidaCentro(data: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(Date.parse(`${data}T12:00:00Z`)) && new Date(`${data}T12:00:00Z`).toISOString().slice(0, 10) === data;
}
export function minutosHoraCentro(hora: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return NaN;
  const [h, m] = hora.split(':').map(Number); return h! * 60 + m!;
}
export function gerarSlotsEscala(escala: EscalaCalendario): string[] {
  const inicio = minutosHoraCentro(escala.horarioInicio), fim = minutosHoraCentro(escala.horarioFim);
  if (!Number.isInteger(escala.duracaoMinutos) || escala.duracaoMinutos <= 0 || !Number.isInteger(escala.vagasPorTurno) || escala.vagasPorTurno <= 0 || !(fim > inicio)) return [];
  const slots: string[] = [];
  for (let t = inicio; t + escala.duracaoMinutos <= fim && slots.length < escala.vagasPorTurno; t += escala.duracaoMinutos) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return slots;
}
export function escalaAtendeNaData(escala: EscalaCalendario, data: string): boolean {
  if (escala.ativo === false || !dataValidaCentro(data)) return false;
  if (escala.status && escala.status !== 'ATIVA') {
    if (!escala.ausenciaInicio || !escala.ausenciaFim) return false;
    if (data >= escala.ausenciaInicio && data <= escala.ausenciaFim) return false;
  }
  const datas = escala.datasEspecificas ?? [];
  if (escala.tipoRecorrencia === 'DATAS_ESPECIFICAS' || (escala.tipoRecorrencia === 'MUTIRAO' && datas.length)) return datas.includes(data);
  const dia = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][new Date(`${data}T12:00:00Z`).getUTCDay()]!;
  if (!(escala.diasSemana ?? []).includes(dia)) return false;
  if (escala.tipoRecorrencia === 'QUINZENAL') {
    if (!escala.dataInicioRecorrencia) return false;
    const dias = (Date.parse(`${data}T12:00:00Z`) - Date.parse(`${escala.dataInicioRecorrencia}T12:00:00Z`)) / 86400000;
    return dias >= 0 && Math.floor(dias / 7) % 2 === 0;
  }
  return true;
}
export function validarEscala(escala: EscalaCalendario): void {
  const inicio = minutosHoraCentro(escala.horarioInicio), fim = minutosHoraCentro(escala.horarioFim);
  if (!(fim > inicio)) throw BadRequest('HORARIO_ESCALA_INVALIDO', 'O fim do turno deve ser posterior ao início.');
  if (!Number.isInteger(escala.duracaoMinutos) || escala.duracaoMinutos < 1 || escala.duracaoMinutos > fim - inicio) throw BadRequest('DURACAO_ESCALA_INVALIDA', 'Duração deve ser positiva e caber no turno.');
  if (!Number.isInteger(escala.vagasPorTurno) || escala.vagasPorTurno < 1 || escala.vagasPorTurno > Math.floor((fim - inicio) / escala.duracaoMinutos)) throw BadRequest('CAPACIDADE_ESCALA_INVALIDA', 'As vagas devem caber no turno sem sobrepor atendimentos. Ajuste duração ou horário para ampliar a capacidade.');
  if ((escala.datasEspecificas ?? []).some(d => !dataValidaCentro(d))) throw BadRequest('DATA_ESCALA_INVALIDA', 'Informe datas válidas.');
  if ((escala.diasSemana ?? []).some(d => !['SEG','TER','QUA','QUI','SEX','SAB','DOM'].includes(d))) throw BadRequest('DIA_ESCALA_INVALIDO', 'Dia da semana inválido.');
  if (escala.tipoRecorrencia === 'DATAS_ESPECIFICAS' && !escala.datasEspecificas?.length) throw BadRequest('DATAS_ESCALA_OBRIGATORIAS', 'Adicione ao menos uma data.');
  if (escala.tipoRecorrencia !== 'DATAS_ESPECIFICAS' && !escala.diasSemana?.length && !(escala.tipoRecorrencia === 'MUTIRAO' && escala.datasEspecificas?.length)) throw BadRequest('DIAS_ESCALA_OBRIGATORIOS', 'Selecione dias ou datas do mutirão.');
  if (escala.tipoRecorrencia === 'QUINZENAL' && (!escala.dataInicioRecorrencia || !dataValidaCentro(escala.dataInicioRecorrencia))) throw BadRequest('ANCORA_QUINZENAL_OBRIGATORIA', 'Informe a data inicial do ciclo quinzenal de 14 dias.');
  if (escala.ausenciaInicio || escala.ausenciaFim || ['FERIAS','LICENCA'].includes(escala.status ?? '')) {
    if (!escala.ausenciaInicio || !escala.ausenciaFim || !dataValidaCentro(escala.ausenciaInicio) || !dataValidaCentro(escala.ausenciaFim) || escala.ausenciaInicio > escala.ausenciaFim) throw BadRequest('PERIODO_AUSENCIA_INVALIDO', 'Informe início e fim válidos para a ausência.');
  }
}
