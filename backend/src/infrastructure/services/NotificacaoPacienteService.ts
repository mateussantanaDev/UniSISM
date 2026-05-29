/**
 * Serviço de notificação para o app do paciente.
 *
 * Garante que sempre exista uma `PacienteConta` (criando uma "pendente" se o
 * paciente ainda não ativou o app). Depois grava a notificação e publica no
 * outbox para entrega externa (push/SMS/e-mail — roadmap).
 *
 * Chamado DENTRO das transações dos use cases de transição de encaminhamento
 * pra garantir atomicidade.
 */
import bcrypt from 'bcryptjs';
import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../database/prisma';
import { publicar, publicarNaTransacao } from '../outbox/OutboxBus';
import { env } from '../../shared/env';

export type TipoNotificacao =
  | 'ENCAMINHAMENTO_CRIADO'
  | 'PENDENCIA_REGISTRADA'
  | 'PENDENCIA_RESOLVIDA'
  | 'APROVADO'
  | 'AGENDADO'
  | 'REJEITADO'
  | 'RESPOSTA_SUS_DISPONIVEL';

export interface NotificarInput {
  cpfPaciente: string; // aceita formatado ou só dígitos
  pacienteNome?: string;
  pacienteTelefone?: string;
  pacienteEmail?: string;
  encaminhamentoId?: string;
  tipo: TipoNotificacao;
  titulo: string;
  corpo: string;
  payload?: Record<string, unknown>;
}

export function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D+/g, '');
}

/** Formata "12345678900" → "123.456.789-00" quando possível. */
export function formatarCpf(cpf: string): string {
  const d = normalizarCpf(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Gera o hash da SENHA PADRÃO do paciente no primeiro contato com o sistema.
 * Regra de negócio: login = CPF digits, senha inicial = CPF digits.
 * O paciente deve trocar a senha no primeiro login (flag `senhaProvisoria`).
 */
async function hashSenhaPadrao(cpfDigits: string): Promise<string> {
  return bcrypt.hash(cpfDigits, env.BCRYPT_ROUNDS);
}

export class NotificacaoPacienteService {
  /** Fora de transação. Fire-and-forget seguro. */
  async notificar(input: NotificarInput): Promise<void> {
    const cpfDigits = normalizarCpf(input.cpfPaciente);
    if (!cpfDigits) return;

    const telefone = input.pacienteTelefone?.trim() ? input.pacienteTelefone.trim() : null;
    const email = input.pacienteEmail?.trim() ? input.pacienteEmail.trim().toLowerCase() : null;

    // Resolve UBS de vínculo a partir do encaminhamento (se contexto disponível).
    const ubsVinculadaId = await this._resolverUbsVinculada(input.encaminhamentoId);

    const conta = await prisma.pacienteConta.upsert({
      where: { cpf: cpfDigits },
      update: {
        // Enriquece dados de contato se a conta existente ainda não tem
        ...(telefone ? { telefone: telefone } : {}),
        ...(email ? { email: email } : {}),
      },
      create: {
        cpf: cpfDigits,
        cpfFormatado: formatarCpf(input.cpfPaciente),
        nome: input.pacienteNome ?? 'PACIENTE',
        telefone,
        email,
        // Senha inicial = CPF digits. Paciente troca no primeiro login.
        senhaHash: await hashSenhaPadrao(cpfDigits),
        ativo: true,
        senhaProvisoria: true,
        ...(ubsVinculadaId ? { ubsVinculadaId } : {}),
      },
    });

    // Pós-create/update: se conta ainda não tem vínculo e descobrimos agora, persiste.
    // Idempotente — não sobrescreve vínculo existente (paciente pode ter sido
    // transferido informalmente; preserva o vínculo "oficial").
    if (ubsVinculadaId && !conta.ubsVinculadaId) {
      await prisma.pacienteConta.update({
        where: { id: conta.id },
        data: { ubsVinculadaId },
      });
    }

    await prisma.notificacaoPaciente.create({
      data: {
        contaId: conta.id,
        pacienteCpf: cpfDigits,
        encaminhamentoId: input.encaminhamentoId ?? null,
        tipo: input.tipo,
        titulo: input.titulo,
        corpo: input.corpo,
        payload: (input.payload as Prisma.InputJsonValue) ?? undefined,
      },
    });

    await publicar({
      eventType: `notificacao.${input.tipo.toLowerCase()}`,
      aggregateType: 'NotificacaoPaciente',
      aggregateId: conta.id,
      payload: {
        cpf: cpfDigits,
        contaId: conta.id,
        contaAtiva: conta.ativo,
        encaminhamentoId: input.encaminhamentoId,
        titulo: input.titulo,
        corpo: input.corpo,
      },
    });
  }

  /** Cria a notificação dentro de uma transação existente. */
  async notificarNaTransacao(
    tx: Prisma.TransactionClient,
    input: NotificarInput,
  ): Promise<void> {
    const cpfDigits = normalizarCpf(input.cpfPaciente);
    if (!cpfDigits) return;

    const telefone = input.pacienteTelefone?.trim() ? input.pacienteTelefone.trim() : null;
    const email = input.pacienteEmail?.trim() ? input.pacienteEmail.trim().toLowerCase() : null;

    // Resolve UBS de vínculo a partir do encaminhamento na MESMA transação
    // (consistência: se este enc estiver sendo criado agora, ele já está visível).
    const ubsVinculadaId = input.encaminhamentoId
      ? (
          await tx.encaminhamento.findUnique({
            where: { id: input.encaminhamentoId },
            select: { ubsId: true },
          })
        )?.ubsId ?? null
      : null;

    const conta = await tx.pacienteConta.upsert({
      where: { cpf: cpfDigits },
      update: {
        ...(telefone ? { telefone: telefone } : {}),
        ...(email ? { email: email } : {}),
      },
      create: {
        cpf: cpfDigits,
        cpfFormatado: formatarCpf(input.cpfPaciente),
        nome: input.pacienteNome ?? 'PACIENTE',
        telefone,
        email,
        senhaHash: await hashSenhaPadrao(cpfDigits),
        ativo: true,
        senhaProvisoria: true,
        ...(ubsVinculadaId ? { ubsVinculadaId } : {}),
      },
    });

    // Idempotência: se conta já existia sem vínculo e descobrimos agora, persiste.
    if (ubsVinculadaId && !conta.ubsVinculadaId) {
      await tx.pacienteConta.update({
        where: { id: conta.id },
        data: { ubsVinculadaId },
      });
    }

    await tx.notificacaoPaciente.create({
      data: {
        contaId: conta.id,
        pacienteCpf: cpfDigits,
        encaminhamentoId: input.encaminhamentoId ?? null,
        tipo: input.tipo,
        titulo: input.titulo,
        corpo: input.corpo,
        payload: (input.payload as Prisma.InputJsonValue) ?? undefined,
      },
    });

    // Outbox pra entrega externa (push/SMS/email → roadmap)
    await publicarNaTransacao(tx, {
      eventType: `notificacao.${input.tipo.toLowerCase()}`,
      aggregateType: 'NotificacaoPaciente',
      aggregateId: conta.id,
      payload: {
        cpf: cpfDigits,
        contaId: conta.id,
        contaAtiva: conta.ativo,
        encaminhamentoId: input.encaminhamentoId,
        titulo: input.titulo,
        corpo: input.corpo,
      },
    });
  }

  /**
   * Resolve a UBS de vínculo a partir do encaminhamento. Retorna null se
   * `encaminhamentoId` ausente ou enc não encontrado.
   */
  private async _resolverUbsVinculada(
    encaminhamentoId: string | undefined | null,
  ): Promise<string | null> {
    if (!encaminhamentoId) return null;
    const enc = await prisma.encaminhamento.findUnique({
      where: { id: encaminhamentoId },
      select: { ubsId: true },
    });
    return enc?.ubsId ?? null;
  }
}

/** Templates curados das mensagens (pt-BR). */
export const MENSAGENS = {
  encaminhamentoCriado(protocolo: string, unidadeOrigem: string) {
    return {
      titulo: '📩 Encaminhamento solicitado',
      corpo: `Sua solicitação foi enviada à SMS pela ${unidadeOrigem}. Protocolo ${protocolo}. Acompanhe por aqui.`,
    };
  },
  pendenciaRegistrada(protocolo: string, observacao: string) {
    return {
      titulo: '⚠️ Documentação pendente',
      corpo: `A Regulação solicitou complementação no encaminhamento ${protocolo}: ${observacao}. Procure sua UBS.`,
    };
  },
  pendenciaResolvida(protocolo: string) {
    return {
      titulo: '🔁 Documentação complementada',
      corpo: `Sua UBS enviou os documentos adicionais. Encaminhamento ${protocolo} voltou para análise.`,
    };
  },
  aprovado(protocolo: string) {
    return {
      titulo: '✅ Encaminhamento aprovado',
      corpo: `Boas notícias! O encaminhamento ${protocolo} foi aprovado pela Regulação. Aguarde o agendamento do atendimento.`,
    };
  },
  agendado(protocolo: string, dataIso: string) {
    const br = new Date(dataIso).toLocaleDateString('pt-BR');
    return {
      titulo: '📅 Atendimento agendado',
      corpo: `Seu atendimento referente ao encaminhamento ${protocolo} está previsto para ${br}.`,
    };
  },
  rejeitado(protocolo: string, motivo: string) {
    return {
      titulo: '❌ Encaminhamento não aprovado',
      corpo: `O encaminhamento ${protocolo} não atendeu aos critérios. Motivo: ${motivo}. Converse com sua UBS sobre próximos passos.`,
    };
  },
  respostaSusDisponivel(protocolo: string) {
    return {
      titulo: '📎 Resposta do SUS disponível',
      corpo: `A resposta oficial do SUS para o encaminhamento ${protocolo} está disponível. Faça o download aqui no app.`,
    };
  },
};
