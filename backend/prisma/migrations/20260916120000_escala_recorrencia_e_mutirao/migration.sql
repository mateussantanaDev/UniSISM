-- AlterTable
ALTER TABLE IF EXISTS "escalas_especialistas" ADD COLUMN IF NOT EXISTS "tipoRecorrencia" TEXT NOT NULL DEFAULT 'SEMANAL';
ALTER TABLE IF EXISTS "escalas_especialistas" ADD COLUMN IF NOT EXISTS "datasEspecificas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE IF EXISTS "escalas_especialistas" ADD COLUMN IF NOT EXISTS "isMutirao" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "escalas_especialistas" ADD COLUMN IF NOT EXISTS "intervaloDias" INTEGER DEFAULT 7;
ALTER TABLE IF EXISTS "escalas_especialistas" ADD COLUMN IF NOT EXISTS "dataInicioRecorrencia" TEXT;
