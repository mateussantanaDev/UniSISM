import type { GrupoSanguineo as GrupoDominio } from '../../domain/entities/Paciente';
import { GrupoSanguineo as GrupoPrisma } from '../../../generated/prisma';

const sanguePrismaParaDominio: Record<GrupoPrisma, GrupoDominio> = {
  [GrupoPrisma.A_POSITIVO]: 'A+',
  [GrupoPrisma.A_NEGATIVO]: 'A-',
  [GrupoPrisma.B_POSITIVO]: 'B+',
  [GrupoPrisma.B_NEGATIVO]: 'B-',
  [GrupoPrisma.AB_POSITIVO]: 'AB+',
  [GrupoPrisma.AB_NEGATIVO]: 'AB-',
  [GrupoPrisma.O_POSITIVO]: 'O+',
  [GrupoPrisma.O_NEGATIVO]: 'O-',
  [GrupoPrisma.NAO_INFORMADO]: 'NAO_INFORMADO',
};

const sangueDominioParaPrisma: Record<GrupoDominio, GrupoPrisma> = {
  'A+': GrupoPrisma.A_POSITIVO,
  'A-': GrupoPrisma.A_NEGATIVO,
  'B+': GrupoPrisma.B_POSITIVO,
  'B-': GrupoPrisma.B_NEGATIVO,
  'AB+': GrupoPrisma.AB_POSITIVO,
  'AB-': GrupoPrisma.AB_NEGATIVO,
  'O+': GrupoPrisma.O_POSITIVO,
  'O-': GrupoPrisma.O_NEGATIVO,
  NAO_INFORMADO: GrupoPrisma.NAO_INFORMADO,
};

export function grupoSanguineoToDominio(g: GrupoPrisma): GrupoDominio {
  return sanguePrismaParaDominio[g];
}

export function grupoSanguineoToPrisma(g: GrupoDominio): GrupoPrisma {
  return sangueDominioParaPrisma[g];
}

export function safeIsoString(d: unknown): string {
  if (!d) return '';
  if (d instanceof Date) return isNaN(d.getTime()) ? '' : d.toISOString();
  if (typeof d !== 'string' && typeof d !== 'number') return '';
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  } catch {
    return '';
  }
}

export function safeIsoOrNull(d: unknown): string | null {
  const iso = safeIsoString(d);
  return iso ? iso : null;
}

export function isoOrEmpty(d: unknown): string {
  return safeIsoString(d);
}

export function ymd(d: unknown): string {
  const iso = safeIsoString(d);
  return iso ? iso.slice(0, 10) : '';
}
