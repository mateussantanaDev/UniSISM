ALTER TABLE "atendimentos" ADD COLUMN "subjetivo" TEXT, ADD COLUMN "objetivo" TEXT, ADD COLUMN "avaliacao" TEXT, ADD COLUMN "plano" TEXT, ADD COLUMN "exameFisico" TEXT, ADD COLUMN "sinaisVitais" JSONB;
ALTER TABLE "encaminhamentos" ADD COLUMN "rascunhoSOAP" JSONB, ADD COLUMN "rascunhoSOAPEm" TIMESTAMP(3), ADD COLUMN "chamadaMedicoEm" TIMESTAMP(3), ADD COLUMN "tipoServico" "TipoServicoCentro" NOT NULL DEFAULT 'CONSULTA', ADD COLUMN "procedimentoSolicitado" TEXT, ADD COLUMN "codigoSigtapSolicitado" TEXT;
ALTER TABLE "especialidades_catalogo" ADD COLUMN "tipoServico" "TipoServicoCentro" NOT NULL DEFAULT 'CONSULTA';
ALTER TABLE "escalas_especialistas" ADD COLUMN "ausenciaInicio" TEXT, ADD COLUMN "ausenciaFim" TEXT, ADD COLUMN "acaoAusencia" TEXT, ADD COLUMN "observacoes" TEXT;
ALTER TABLE "cotas_ubs" ADD COLUMN "competencia" TEXT;
UPDATE "cotas_ubs" SET "competencia" = TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'America/Recife', 'YYYY-MM');
ALTER TABLE "cotas_ubs" ALTER COLUMN "competencia" SET NOT NULL;
DROP INDEX IF EXISTS "cotas_ubs_ubsId_key";
CREATE UNIQUE INDEX "cotas_ubs_ubsId_competencia_key" ON "cotas_ubs"("ubsId", "competencia");
