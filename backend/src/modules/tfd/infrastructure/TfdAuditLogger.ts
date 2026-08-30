/**
 * Auditoria TJ — cadeia hash criptográfica encadeada (TFD_API.md §6).
 *
 * Para CADA operação relevante (enum AcaoAuditoriaTFD), insere uma linha em
 * `tfd_audit_log` cujo `hash` é SHA-256 de:
 *
 *   id + acao + recurso_id + operador_id + ip + em_iso +
 *   JSON(antes) + JSON(depois) + hash_anterior
 *
 * `hash_anterior` é o `hash` do último registro inserido na MESMA prefeitura.
 * Genesis: '0' x 64 (64 hex chars).
 *
 * Garantias:
 *   - Tabela tem trigger de imutabilidade (no BD): UPDATE/DELETE rejeitados
 *     ⚠️  TODO: o trigger SQL ainda precisa ser criado via migration manual
 *     (Prisma db push não cria triggers; usar `npx prisma migrate dev` em prod
 *      e adicionar `ALTER TRIGGER ... BEFORE UPDATE ...` no SQL gerado).
 *   - Inserção é serializada por prefeitura via SELECT FOR UPDATE no último
 *     hash, evitando race conditions.
 */
import crypto from 'node:crypto';
import type { Prisma, AcaoAuditoriaTFD } from '../../../../generated/prisma';
import { prisma } from '../../../infrastructure/database/prisma';
import { canonicalJson } from '../../../shared/canonicalJson';

const GENESIS = '0'.repeat(64);

export interface RegistrarTfdInput {
  prefeituraId: string;
  acao: AcaoAuditoriaTFD;
  recursoTipo: string;
  recursoId: string;
  recursoProtocolo?: string | null;
  operadorId: string;
  operadorNome: string;
  operadorMatricula: string;
  operadorRole: string;
  ip: string;
  userAgent: string;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
}

export interface ITfdAuditLogger {
  registrar(input: RegistrarTfdInput): Promise<void>;
  registrarNaTransacao(
    tx: Prisma.TransactionClient,
    input: RegistrarTfdInput,
  ): Promise<void>;
}

function calcHash(
  registro: { id: string; em: Date } & RegistrarTfdInput,
  hashAnterior: string,
): string {
  const payload = [
    registro.id,
    registro.acao,
    registro.recursoId,
    registro.operadorId,
    registro.ip,
    registro.em.toISOString(),
    canonicalJson(registro.antes ?? null),
    canonicalJson(registro.depois ?? null),
    hashAnterior,
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export class TfdAuditLogger implements ITfdAuditLogger {
  async registrar(input: RegistrarTfdInput): Promise<void> {
    await prisma.$transaction(async (tx) => this.registrarNaTransacao(tx, input));
  }

  async registrarNaTransacao(
    tx: Prisma.TransactionClient,
    input: RegistrarTfdInput,
  ): Promise<void> {
    // Concurrency lock por prefeitura: serializa inserções na cadeia de auditoria da mesma prefeitura
    const lockKey = crypto.createHash('sha256').update(input.prefeituraId).digest().readInt32BE(0);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

    // Pega o último hash da prefeitura (genesis se não houver)
    const ultimo = await tx.tfdAuditLog.findFirst({
      where: { prefeituraId: input.prefeituraId },
      orderBy: { em: 'desc' },
      select: { hash: true },
    });
    const hashAnterior = ultimo?.hash ?? GENESIS;

    const id = crypto.randomUUID();
    const em = new Date();
    const hash = calcHash({ id, em, ...input }, hashAnterior);

    await tx.tfdAuditLog.create({
      data: {
        id,
        prefeituraId: input.prefeituraId,
        acao: input.acao,
        recursoTipo: input.recursoTipo,
        recursoId: input.recursoId,
        recursoProtocolo: input.recursoProtocolo ?? null,
        operadorId: input.operadorId,
        operadorNome: input.operadorNome,
        operadorMatricula: input.operadorMatricula,
        operadorRole: input.operadorRole,
        ip: input.ip,
        userAgent: input.userAgent,
        antes: (input.antes ?? null) as Prisma.InputJsonValue,
        depois: (input.depois ?? null) as Prisma.InputJsonValue,
        hashAnterior,
        hash,
        em,
      },
    });
  }
}

/**
 * Verifica integridade de toda a cadeia da prefeitura.
 * Retorna `null` se OK, ou os IDs corrompidos.
 */
export async function verificarCadeiaTfd(prefeituraId: string): Promise<{
  total: number;
  corrompidos: string[];
}> {
  const todos = await prisma.tfdAuditLog.findMany({
    where: { prefeituraId },
    orderBy: { em: 'asc' },
  });

  const corrompidos: string[] = [];
  let esperadoAnterior = GENESIS;

  for (const r of todos) {
    if (r.hashAnterior !== esperadoAnterior) {
      corrompidos.push(r.id);
    }
    const hashRecalc = calcHash(
      {
        id: r.id,
        em: r.em,
        prefeituraId: r.prefeituraId,
        acao: r.acao,
        recursoTipo: r.recursoTipo,
        recursoId: r.recursoId,
        recursoProtocolo: r.recursoProtocolo,
        operadorId: r.operadorId,
        operadorNome: r.operadorNome,
        operadorMatricula: r.operadorMatricula,
        operadorRole: r.operadorRole,
        ip: r.ip,
        userAgent: r.userAgent,
        antes: r.antes as Record<string, unknown> | null,
        depois: r.depois as Record<string, unknown> | null,
      },
      r.hashAnterior,
    );
    if (hashRecalc !== r.hash) {
      corrompidos.push(r.id);
    }
    esperadoAnterior = r.hash;
  }

  return { total: todos.length, corrompidos: Array.from(new Set(corrompidos)) };
}
