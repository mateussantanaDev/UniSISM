import type { Prisma } from '../../../../generated/prisma';
import { Conflict, Unprocessable } from '../../../shared/errors';
import { dataHoraRecife, hojeRecife, horaRecife, intervaloDiaRecife } from './dataCentro';
import { escalaAtendeNaData, gerarSlotsEscala, minutosHoraCentro } from './escalaCentro';

export interface ReservaCentroInput {
  prefeituraId: string; profissionalId: string; especialidade: string;
  tipoServico?: 'CONSULTA'|'PROCEDIMENTO'; data: Date; ignorarId?: string;
}
export async function validarReservaCentro(tx: Prisma.TransactionClient, input: ReservaCentroInput) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`centro-agenda:${input.prefeituraId}`}))`;
  if (!Number.isFinite(input.data.getTime()) || input.data.getTime() <= Date.now()) throw Unprocessable('HORARIO_PASSADO','Escolha um horário futuro disponível na escala');
  const dia = hojeRecife(input.data), hora = horaRecife(input.data);
  const escalas = await tx.escalaEspecialista.findMany({ where:{ prefeituraId:input.prefeituraId, medicoId:input.profissionalId, ativo:true } });
  const escala = escalas.find(e => e.especialidade.toLocaleLowerCase() === input.especialidade.toLocaleLowerCase() && e.tipoServico === (input.tipoServico || 'CONSULTA') && escalaAtendeNaData(e,dia) && gerarSlotsEscala(e).includes(hora));
  if (!escala) throw Unprocessable('HORARIO_FORA_ESCALA','Horário indisponível para o profissional, serviço ou período de ausência selecionado');
  const inicio = minutosHoraCentro(hora), fim = inicio + escala.duracaoMinutos;
  const [reservas, antigos] = await Promise.all([
    tx.encaminhamento.findMany({ where:{ id:input.ignorarId ? {not:input.ignorarId}:undefined, profissionalAgendadoId:input.profissionalId, deletadoEm:null, status:'APROVADO', agendamentoPrevisto:intervaloDiaRecife(dia) }, select:{agendamentoPrevisto:true, especialidadeSolicitada:true} }),
    tx.agendamentoCentro.findMany({ where:{medicoId:input.profissionalId, status:{not:'CANCELADO'}, dataAgendamento:intervaloDiaRecife(dia)}, select:{dataAgendamento:true, especialidade:true} }),
  ]);
  const ocupados = [...reservas.map(r=>({data:r.agendamentoPrevisto!,esp:r.especialidadeSolicitada})),...antigos.map(r=>({data:r.dataAgendamento,esp:r.especialidade}))];
  if (ocupados.some(r=>{const m=minutosHoraCentro(horaRecife(r.data));const duracao=escalas.find(e=>e.especialidade===r.esp)?.duracaoMinutos || 20;return inicio<m+duracao && fim>m;})) throw Conflict('HORARIO_OCUPADO','Este profissional já possui atendimento no horário. Selecione outra vaga');
  return escala;
}
