import { Unprocessable } from '../../../shared/errors';
export const FUSO_CENTRO = 'America/Recife';
export function hojeRecife(data = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_CENTRO, year:'numeric', month:'2-digit', day:'2-digit' }).format(data);
}
export function horaRecife(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone:FUSO_CENTRO, hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(data);
}
export function dataHoraRecife(dia: string, hora = '00:00'): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw Unprocessable('DATA_HORA_INVALIDA','Informe data e horário válidos');
  const data = new Date(`${dia}T${hora}:00-03:00`);
  if (!Number.isFinite(data.getTime()) || hojeRecife(data) !== dia) throw Unprocessable('DATA_HORA_INVALIDA','Data inexistente');
  return data;
}
export function intervaloDiaRecife(dia: string) {
  const inicio = dataHoraRecife(dia);
  return { gte: inicio, lt: new Date(inicio.getTime() + 86400000) };
}
