/**
 * Audit logger persistente — grava em AuditoriaLog (Prisma).
 *
 * Uso:
 *   await audit.registrar({
 *     acao: 'APROVAR_ENCAMINHAMENTO',
 *     atendenteId: ctx.sub,
 *     recurso: 'Encaminhamento',
 *     recursoId: enc.id,
 *     payload: { statusAntes, statusDepois, nota, ... },
 *     ip: req.ip,
 *     userAgent: req.header('user-agent'),
 *   });
 *
 * PII sensível é mascarada antes de persistir o `payload`.
 */
import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../database/prisma';
import { logger } from '../logger';

export interface AuditEntry {
  acao: string;
  recurso?: string;
  recursoId?: string;
  atendenteId?: string | null;
  payload?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface IAuditLogger {
  registrar(entry: AuditEntry): Promise<void>;
}

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'senha',
  'senhaatual',
  'novasenha',
  'password',
  'secret',
  'clientsecret',
  'apikey',
  'jwt',
]);

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized)
    || normalized.endsWith('token')
    || normalized.endsWith('tokenhash')
  );
}

function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) {
    return value.replace(/(\d{3}\.\d{3}\.)\d{3}(-\d{2})/, '$1***$2');
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.***-${digits.slice(9)}`;
}

function maskCartaoSus(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 15) {
    return value.replace(/(\d{3}\s\d{4}\s)\d{4}(\s\d{4})/, '$1****$2');
  }
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} **** ${digits.slice(11)}`;
}

function shouldMaskCpf(key: string): boolean {
  const normalized = normalizeKey(key);
  return normalized === 'cpf' || normalized.endsWith('cpf');
}

function shouldMaskCartaoSus(key: string): boolean {
  const normalized = normalizeKey(key);
  return normalized === 'cartaosus' || normalized.endsWith('cartaosus');
}

export function mascararPayloadAuditoria(value: unknown, key = ''): unknown {
  if (key && isSensitiveKey(key)) {
    return '[REDACTED]';
  }

  if (key && typeof value === 'string' && shouldMaskCpf(key)) {
    return maskCpf(value);
  }

  if (key && typeof value === 'string' && shouldMaskCartaoSus(key)) {
    return maskCartaoSus(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => mascararPayloadAuditoria(item));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (childValue !== undefined) {
        out[childKey] = mascararPayloadAuditoria(childValue, childKey);
      }
    }
    return out;
  }

  return value;
}

/** Mascara valores sensíveis antes de gravar em payload JSON. */
function mascararPII(obj: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!obj) return obj;
  return mascararPayloadAuditoria(obj) as Record<string, unknown>;
}

export class PrismaAuditLogger implements IAuditLogger {
  async registrar(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditoriaLog.create({
        data: {
          acao: entry.acao,
          recurso: entry.recurso ?? 'sistema',
          recursoId: entry.recursoId ?? null,
          atendenteId: entry.atendenteId ?? null,
          payload: (mascararPII(entry.payload) as Prisma.InputJsonValue) ?? undefined,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (err) {
      // Falha em audit NUNCA deve quebrar o fluxo principal.
      logger.error({ err, entry: { acao: entry.acao, recurso: entry.recurso } }, 'audit log falhou');
    }
  }
}

export class NoopAuditLogger implements IAuditLogger {
  async registrar(): Promise<void> {}
}
