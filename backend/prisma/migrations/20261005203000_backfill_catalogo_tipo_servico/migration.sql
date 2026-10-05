-- Recupera apenas modalidades comprovadas por vínculo explícito de uma escala.
-- Não infere procedimento pelo nome ou pelo simples preenchimento de SIGTAP.
UPDATE "especialidades_catalogo" AS catalogo
SET "tipoServico" = 'PROCEDIMENTO'::"TipoServicoCentro"
WHERE EXISTS (
  SELECT 1 FROM "escalas_especialistas" AS escala
  WHERE escala."procedimentoId" = catalogo."id"
    AND escala."tipoServico" = 'PROCEDIMENTO'::"TipoServicoCentro"
    AND (catalogo."prefeituraId" IS NULL OR catalogo."prefeituraId" = escala."prefeituraId")
);
