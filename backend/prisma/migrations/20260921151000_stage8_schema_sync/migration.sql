-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DestinoRegulacao" AS ENUM ('SUS', 'CENTRO_ESPECIALIDADES', 'CENTRO_ODONTOLOGICO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StatusAtendimentoCentro" AS ENUM ('AGENDADO', 'AGUARDANDO_ATENDIMENTO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'FALTOU');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TipoAnexoTFD" AS ENUM ('ENCAMINHAMENTO', 'COMPROVANTE_CONSULTA', 'LAUDO_MEDICO', 'DOCUMENTO_IDENTIDADE', 'OUTRO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StatusSalaConsultorio" AS ENUM ('DISPONIVEL', 'EM_ATENDIMENTO', 'MANUTENCAO', 'RESERVADA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TipoServicoCentro" AS ENUM ('CONSULTA', 'PROCEDIMENTO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StatusAgendaMedica" AS ENUM ('ATIVA', 'FERIAS', 'LICENCA', 'BLOQUEADA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ModoDataAgendamento" AS ENUM ('AUTODATA', 'MANUAL', 'RETROATIVO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StatusAgendamentoCentro" AS ENUM ('AGUARDANDO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'FALTOU', 'CANCELADO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterEnum
ALTER TYPE "RoleAtendente" ADD VALUE IF NOT EXISTS 'MEDICO';
ALTER TYPE "RoleAtendente" ADD VALUE IF NOT EXISTS 'MEDICO_ESPECIALISTA';
ALTER TYPE "RoleAtendente" ADD VALUE IF NOT EXISTS 'ATENDENTE_CENTRO';

-- AlterEnum
ALTER TYPE "TipoEventoTimeline" ADD VALUE IF NOT EXISTS 'REMARCACAO';

-- DropForeignKey
ALTER TABLE "tfd_viagens" DROP CONSTRAINT "tfd_viagens_motoristaId_fkey";

-- DropForeignKey
ALTER TABLE "tfd_viagens" DROP CONSTRAINT "tfd_viagens_veiculoId_fkey";

-- AlterTable
ALTER TABLE "atendentes" ADD COLUMN "tipo_unidade" VARCHAR(20),
ADD COLUMN "unidade_id" TEXT;

-- AlterTable
ALTER TABLE "encaminhamentos" ADD COLUMN "atendimentoConcluidoEm" TIMESTAMP(3),
ADD COLUMN "atendimentoIniciadoEm" TIMESTAMP(3),
ADD COLUMN "dataDisponibilidade" TIMESTAMP(3),
ADD COLUMN "destinoRegulacao" "DestinoRegulacao",
ADD COLUMN "presencaRegistradaEm" TIMESTAMP(3),
ADD COLUMN "statusAtendimentoCentro" "StatusAtendimentoCentro" DEFAULT 'AGENDADO';

-- AlterTable
ALTER TABLE "tfd_solicitacao_anexos" ADD COLUMN "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "nomeArquivo" TEXT,
ADD COLUMN "tamanhoBytes" INTEGER,
ADD COLUMN "tipoLegado" "TipoAnexoSolicTFD",
ADD COLUMN "url" TEXT;

-- Preserve legacy attachment kind before switching the public `tipo` column to
-- the new richer enum.
UPDATE "tfd_solicitacao_anexos"
SET "tipoLegado" = "tipo"
WHERE "tipoLegado" IS NULL;

ALTER TABLE "tfd_solicitacao_anexos" ALTER COLUMN "nome" DROP NOT NULL,
DROP COLUMN "tipo",
ADD COLUMN "tipo" "TipoAnexoTFD",
ALTER COLUMN "tamanhoKb" DROP NOT NULL,
ALTER COLUMN "storageKey" DROP NOT NULL,
ALTER COLUMN "uploadPorId" DROP NOT NULL;

UPDATE "tfd_solicitacao_anexos"
SET "tipo" = CASE "tipoLegado"::text
  WHEN 'COMPROVANTE_ENCAMINHAMENTO' THEN 'ENCAMINHAMENTO'::"TipoAnexoTFD"
  WHEN 'LAUDO' THEN 'LAUDO_MEDICO'::"TipoAnexoTFD"
  WHEN 'OUTRO' THEN 'OUTRO'::"TipoAnexoTFD"
  ELSE 'OUTRO'::"TipoAnexoTFD"
END
WHERE "tipo" IS NULL
  AND "tipoLegado" IS NOT NULL;

-- AlterTable
ALTER TABLE "tfd_solicitacoes" ADD COLUMN "acompanhanteCpf" TEXT,
ADD COLUMN "acompanhanteDataNasc" TIMESTAMP(3),
ADD COLUMN "acompanhanteNome" TEXT,
ADD COLUMN "acompanhanteParentesco" TEXT,
ADD COLUMN "acompanhanteRg" TEXT,
ADD COLUMN "acompanhanteTelefone" TEXT,
ADD COLUMN "comprovanteHospitalDestino" TEXT,
ADD COLUMN "dataRealizadaRetroativa" TIMESTAMP(3),
ADD COLUMN "isRegistroTardio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "justificativaRegistroTardio" TEXT,
ADD COLUMN "pacienteBairro" TEXT,
ADD COLUMN "pacienteCartaoSus" TEXT,
ADD COLUMN "pacienteCep" TEXT,
ADD COLUMN "pacienteCpf" TEXT,
ADD COLUMN "pacienteDataNasc" TIMESTAMP(3),
ADD COLUMN "pacienteEndereco" TEXT,
ADD COLUMN "pacienteMunicipio" TEXT,
ADD COLUMN "pacienteNome" TEXT,
ADD COLUMN "pacienteNomeMae" TEXT,
ADD COLUMN "pacienteRg" TEXT,
ADD COLUMN "pacienteTelefone" TEXT,
ADD COLUMN "pacienteUf" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "tfd_viagens" ADD COLUMN "codigoViagem" TEXT,
ADD COLUMN "isRegistroTardio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "justificativaKmGestor" TEXT,
ADD COLUMN "justificativaTardia" TEXT,
ADD COLUMN "kmGestorDataRegistro" TIMESTAMP(3),
ADD COLUMN "kmGestorRegistradoPor" TEXT,
ALTER COLUMN "veiculoId" DROP NOT NULL,
ALTER COLUMN "motoristaId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "escalas_especialistas" (
    "id" TEXT NOT NULL,
    "prefeituraId" TEXT,
    "medicoId" TEXT,
    "medicoNome" TEXT NOT NULL,
    "crm" TEXT NOT NULL,
    "especialidade" TEXT NOT NULL,
    "tipoServico" "TipoServicoCentro" NOT NULL DEFAULT 'CONSULTA',
    "procedimentoId" TEXT,
    "diasSemana" TEXT[],
    "horarioInicio" TEXT NOT NULL,
    "horarioFim" TEXT NOT NULL,
    "duracaoMinutos" INTEGER NOT NULL DEFAULT 20,
    "vagasPorTurno" INTEGER NOT NULL DEFAULT 12,
    "status" "StatusAgendaMedica" NOT NULL DEFAULT 'ATIVA',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "tipoRecorrencia" TEXT NOT NULL DEFAULT 'SEMANAL',
    "datasEspecificas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isMutirao" BOOLEAN NOT NULL DEFAULT false,
    "intervaloDias" INTEGER DEFAULT 7,
    "dataInicioRecorrencia" TEXT,
    "necessitaTriagem" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalas_especialistas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotas_ubs" (
    "id" TEXT NOT NULL,
    "ubsId" TEXT NOT NULL,
    "totalCotasMes" INTEGER NOT NULL DEFAULT 350,
    "especialidades" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotas_ubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salas_consultorios" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "especialidadePrincipal" TEXT NOT NULL,
    "status" "StatusSalaConsultorio" NOT NULL DEFAULT 'DISPONIVEL',
    "equipamentos" TEXT[],
    "ala" TEXT,
    "prefeituraId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salas_consultorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "especialidades_catalogo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigoSigtap" TEXT,
    "tempoPadraoMinutos" INTEGER NOT NULL DEFAULT 20,
    "valorTabelaBrl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "documentosObrigatorios" TEXT[],
    "preparoRequerido" TEXT,
    "necessitaTriagem" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "prefeituraId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "especialidades_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atendimento_procedimentos_realizados" (
    "id" TEXT NOT NULL,
    "atendimentoId" TEXT,
    "agendamentoId" TEXT,
    "codigoSigtap" TEXT,
    "nome" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valorUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "observacao" TEXT,
    "registradoPorId" TEXT,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atendimento_procedimentos_realizados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamentos_centro" (
    "id" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "prefeituraId" TEXT,
    "pacienteId" TEXT NOT NULL,
    "medicoId" TEXT,
    "medicoNome" TEXT,
    "especialidade" TEXT NOT NULL,
    "tipoServico" "TipoServicoCentro" NOT NULL DEFAULT 'CONSULTA',
    "procedimentoNome" TEXT,
    "modoData" "ModoDataAgendamento" NOT NULL DEFAULT 'AUTODATA',
    "dataAgendamento" TIMESTAMP(3) NOT NULL,
    "horaAgendamento" TEXT NOT NULL,
    "status" "StatusAgendamentoCentro" NOT NULL DEFAULT 'AGUARDANDO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendamentos_centro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cotas_ubs_ubsId_key" ON "cotas_ubs"("ubsId");

-- CreateIndex
CREATE UNIQUE INDEX "agendamentos_centro_protocolo_key" ON "agendamentos_centro"("protocolo");

-- CreateIndex
CREATE UNIQUE INDEX "tfd_viagens_codigoViagem_key" ON "tfd_viagens"("codigoViagem");

-- AddForeignKey
ALTER TABLE "tfd_viagens" ADD CONSTRAINT "tfd_viagens_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "tfd_veiculos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tfd_viagens" ADD CONSTRAINT "tfd_viagens_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "tfd_motoristas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento_procedimentos_realizados" ADD CONSTRAINT "atendimento_procedimentos_realizados_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "atendimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento_procedimentos_realizados" ADD CONSTRAINT "atendimento_procedimentos_realizados_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos_centro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos_centro" ADD CONSTRAINT "agendamentos_centro_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
