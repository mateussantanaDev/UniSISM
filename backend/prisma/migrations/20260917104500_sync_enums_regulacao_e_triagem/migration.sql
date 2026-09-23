-- AlterEnum DestinoRegulacao
DO $$ BEGIN
  ALTER TYPE "DestinoRegulacao" ADD VALUE IF NOT EXISTS 'SUS';
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "DestinoRegulacao" ADD VALUE IF NOT EXISTS 'CENTRO_ESPECIALIDADES';
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "DestinoRegulacao" ADD VALUE IF NOT EXISTS 'CENTRO_ODONTOLOGICO';
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

-- AlterEnum StatusAtendimentoCentro
DO $$ BEGIN
  ALTER TYPE "StatusAtendimentoCentro" ADD VALUE IF NOT EXISTS 'AGUARDANDO_ATENDIMENTO';
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "StatusAtendimentoCentro" ADD VALUE IF NOT EXISTS 'CONCLUIDO';
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

-- AlterEnum TipoEventoTimeline
DO $$ BEGIN
  ALTER TYPE "TipoEventoTimeline" ADD VALUE IF NOT EXISTS 'REMARCACAO';
EXCEPTION
  WHEN undefined_object THEN null;
END $$;
