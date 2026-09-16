-- AlterTable
ALTER TABLE "escalas_especialistas" ADD COLUMN IF NOT EXISTS "tipoRecorrencia" TEXT NOT NULL DEFAULT 'SEMANAL';
ALTER TABLE "escalas_especialistas" ADD COLUMN IF NOT EXISTS "datasEspecificas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "escalas_especialistas" ADD COLUMN IF NOT EXISTS "isMutirao" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "escalas_especialistas" ADD COLUMN IF NOT EXISTS "intervaloDias" INTEGER DEFAULT 7;
ALTER TABLE "escalas_especialistas" ADD COLUMN IF NOT EXISTS "dataInicioRecorrencia" TEXT;
