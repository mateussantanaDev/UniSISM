-- AlterTable
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "criadoPorId" TEXT;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "criadoPorNome" TEXT;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "atualizadoPorId" TEXT;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "atualizadoPorNome" TEXT;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "deletadoPorId" TEXT;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "deletadoPorNome" TEXT;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "motivoExclusao" TEXT;
