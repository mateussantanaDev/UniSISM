ALTER TABLE "encaminhamentos" ADD COLUMN "profissionalAgendadoId" TEXT, ADD COLUMN "atendimentoId" TEXT;
ALTER TABLE "encaminhamentos" ADD CONSTRAINT "encaminhamentos_profissionalAgendadoId_fkey" FOREIGN KEY ("profissionalAgendadoId") REFERENCES "atendentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "encaminhamentos" ADD CONSTRAINT "encaminhamentos_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "atendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "encaminhamentos_profissionalAgendadoId_idx" ON "encaminhamentos"("profissionalAgendadoId");
CREATE UNIQUE INDEX "encaminhamentos_atendimentoId_key" ON "encaminhamentos"("atendimentoId");
-- Só vincular legado quando há exatamente um médico com nome/matrícula exatos no município.
WITH candidatos AS (
 SELECT e.id, min(a.id) AS medico_id, count(*) AS total
 FROM encaminhamentos e JOIN ubs u ON u.id = e."ubsId"
 JOIN atendentes a ON (lower(trim(a.nome)) = lower(trim(e."profissionalAgendado")) OR a.matricula = e."profissionalAgendado")
 LEFT JOIN ubs au ON au.id = a."ubsId"
 WHERE a.role IN ('MEDICO','MEDICO_ESPECIALISTA') AND a."deletadoEm" IS NULL
 AND coalesce(a."prefeituraId", au."prefeituraId") = u."prefeituraId"
 GROUP BY e.id
)
UPDATE encaminhamentos e SET "profissionalAgendadoId" = c.medico_id FROM candidatos c WHERE e.id = c.id AND c.total = 1;
-- O registro clínico legado deve coincidir em paciente e instante de conclusão, sem ambiguidade.
WITH candidatos AS (
 SELECT e.id, min(a.id) AS atendimento_id, count(*) AS total
 FROM encaminhamentos e JOIN atendimentos a ON a."pacienteId" = e."pacienteId" AND a.data = e."atendimentoConcluidoEm"
 GROUP BY e.id
), unicos AS (
 SELECT atendimento_id FROM candidatos WHERE total = 1 GROUP BY atendimento_id HAVING count(*) = 1
)
UPDATE encaminhamentos e SET "atendimentoId" = c.atendimento_id FROM candidatos c JOIN unicos u ON u.atendimento_id = c.atendimento_id WHERE e.id = c.id AND c.total = 1;
