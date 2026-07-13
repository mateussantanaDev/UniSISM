-- Create missing enums safely if they do not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlataformaPush') THEN
        CREATE TYPE "PlataformaPush" AS ENUM ('ANDROID', 'IOS');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PushProvider') THEN
        CREATE TYPE "PushProvider" AS ENUM ('NTFY', 'FCM', 'WEB_PUSH');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusPushNotificacao') THEN
        CREATE TYPE "StatusPushNotificacao" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU', 'EXCEDIDO', 'SEM_DEVICE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BannerTone') THEN
        CREATE TYPE "BannerTone" AS ENUM ('URGENTE', 'CAMPANHA', 'INFO', 'ATENCAO');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TfdPacienteStatus') THEN
        CREATE TYPE "TfdPacienteStatus" AS ENUM ('AGUARDANDO', 'APROVADA', 'RECUSADA', 'CANCELADA', 'EMBARCADA', 'CONCLUIDA');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TfdPacientePrioridade') THEN
        CREATE TYPE "TfdPacientePrioridade" AS ENUM ('NORMAL', 'PRIORITARIA', 'URGENTE');
    END IF;
END
$$;

-- Add new values to existing enums safely (PostgreSQL 16 supports IF NOT EXISTS for ADD VALUE)
ALTER TYPE "AcaoProntuario" ADD VALUE IF NOT EXISTS 'DOWNLOAD_ANEXO';
ALTER TYPE "AcaoProntuario" ADD VALUE IF NOT EXISTS 'LEITURA_DOSSIE';

ALTER TYPE "RoleAtendente" ADD VALUE IF NOT EXISTS 'ATENDENTE_TFD';
ALTER TYPE "RoleAtendente" ADD VALUE IF NOT EXISTS 'MOTORISTA_TFD';

ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'MOTORISTA_LOGIN';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'MOTORISTA_LOGOUT';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'MOTORISTA_TROCOU_SENHA';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'FCM_TOKEN_REGISTRADO';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'FCM_TOKEN_REVOGADO';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'TFD_PAC_SOLIC_CRIADA';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'TFD_PAC_SOLIC_APROVADA';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'TFD_PAC_SOLIC_RECUSADA';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'TFD_PAC_SOLIC_CANCELADA_PELO_PACIENTE';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'TFD_PAC_SOLIC_REABERTA';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'TFD_PAC_EMBARCADA';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'TFD_PAC_CONCLUIDA';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'SALDO_AJUDA_AJUSTADO';
ALTER TYPE "AcaoAuditoriaTFD" ADD VALUE IF NOT EXISTS 'SALDO_AJUDA_APORTADO';

-- Alter Table "encaminhamentos"
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "cidadeAgendamento" TEXT;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "localAgendamento" TEXT;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "motivoRejeicao" TEXT;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "profissionalAgendado" TEXT;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "recomendacoes" JSONB;
ALTER TABLE "encaminhamentos" ADD COLUMN IF NOT EXISTS "ufAgendamento" CHAR(2);

-- Alter Table "pacientes_contas"
ALTER TABLE "pacientes_contas" ADD COLUMN IF NOT EXISTS "ubsVinculadaId" TEXT;

-- Alter Table "sessoes_paciente"
ALTER TABLE "sessoes_paciente" ADD COLUMN IF NOT EXISTS "refreshTokenId" TEXT;

-- Alter Table "tfd_motoristas"
ALTER TABLE "tfd_motoristas" ADD COLUMN IF NOT EXISTS "atendenteId" TEXT;
ALTER TABLE "tfd_motoristas" ADD COLUMN IF NOT EXISTS "fcmToken" TEXT;
ALTER TABLE "tfd_motoristas" ADD COLUMN IF NOT EXISTS "primeiroLogin" BOOLEAN NOT NULL DEFAULT true;

-- Alter Table "tfd_viagens"
ALTER TABLE "tfd_viagens" ADD COLUMN IF NOT EXISTS "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Alter Table "ubs" (ensure all new fields are added if not present)
ALTER TABLE "ubs" ADD COLUMN IF NOT EXISTS "bairro" VARCHAR(120);
ALTER TABLE "ubs" ADD COLUMN IF NOT EXISTS "cep" VARCHAR(9);
ALTER TABLE "ubs" ADD COLUMN IF NOT EXISTS "telefone" VARCHAR(20);
ALTER TABLE "ubs" ADD COLUMN IF NOT EXISTS "whatsapp" VARCHAR(20);
ALTER TABLE "ubs" ADD COLUMN IF NOT EXISTS "email" VARCHAR(180);
ALTER TABLE "ubs" ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(9, 6);
ALTER TABLE "ubs" ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(9, 6);
ALTER TABLE "ubs" ADD COLUMN IF NOT EXISTS "horarios" JSONB;
ALTER TABLE "ubs" ADD COLUMN IF NOT EXISTS "observacoes" TEXT;

-- Alter column defaults
ALTER TABLE "prefeituras" ALTER COLUMN "uf" SET DEFAULT 'PE';
ALTER TABLE "ubs" ALTER COLUMN "uf" SET DEFAULT 'PE';

-- Safely convert or add pushStatus in notificacoes_paciente
DO $$
BEGIN
    -- If column exists, we check its type and convert if necessary
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'notificacoes_paciente' 
          AND column_name = 'pushStatus'
    ) THEN
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'notificacoes_paciente' 
              AND column_name = 'pushStatus' 
              AND data_type = 'text'
        ) THEN
            UPDATE "notificacoes_paciente" SET "pushStatus" = 'PENDENTE' WHERE "pushStatus" IS NULL;
            ALTER TABLE "notificacoes_paciente" 
              ALTER COLUMN "pushStatus" TYPE "StatusPushNotificacao" USING ("pushStatus"::"StatusPushNotificacao");
        END IF;
    ELSE
        -- If the column does not exist at all, we add it with the correct type
        ALTER TABLE "notificacoes_paciente" ADD COLUMN "pushStatus" "StatusPushNotificacao" NOT NULL DEFAULT 'PENDENTE';
    END IF;
END
$$;

-- Ensure other push columns exist
ALTER TABLE "notificacoes_paciente" ADD COLUMN IF NOT EXISTS "pushTentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notificacoes_paciente" ADD COLUMN IF NOT EXISTS "pushUltimaTentativaEm" TIMESTAMP(3);
ALTER TABLE "notificacoes_paciente" ADD COLUMN IF NOT EXISTS "pushEnviadoEm" TIMESTAMP(3);
ALTER TABLE "notificacoes_paciente" ADD COLUMN IF NOT EXISTS "pushErro" TEXT;

-- Ensure constraints and defaults on notificacoes_paciente pushStatus and pushTentativas
ALTER TABLE "notificacoes_paciente" ALTER COLUMN "pushStatus" SET DEFAULT 'PENDENTE';
ALTER TABLE "notificacoes_paciente" ALTER COLUMN "pushStatus" SET NOT NULL;

UPDATE "notificacoes_paciente" SET "pushTentativas" = 0 WHERE "pushTentativas" IS NULL;
ALTER TABLE "notificacoes_paciente" ALTER COLUMN "pushTentativas" SET DEFAULT 0;
ALTER TABLE "notificacoes_paciente" ALTER COLUMN "pushTentativas" SET NOT NULL;

-- Alter Table "tfd_solicitacoes"
ALTER TABLE "tfd_solicitacoes" DROP CONSTRAINT IF EXISTS "tfd_solicitacoes_ubsId_fkey";
ALTER TABLE "tfd_solicitacoes" DROP COLUMN IF EXISTS "acompanhante";
ALTER TABLE "tfd_solicitacoes" DROP COLUMN IF EXISTS "criadaPorId";
ALTER TABLE "tfd_solicitacoes" DROP COLUMN IF EXISTS "criadaPorNome";
ALTER TABLE "tfd_solicitacoes" ALTER COLUMN "ubsId" SET NOT NULL;

-- Create missing tables if they do not exist
CREATE TABLE IF NOT EXISTS "especialidade_recomendacoes" (
    "id" TEXT NOT NULL,
    "especialidade" TEXT NOT NULL,
    "recomendacoes" JSONB NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "especialidade_recomendacoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "paciente_recovery_tokens" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "ipOrigem" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paciente_recovery_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "paciente_dispositivos" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "provider" "PushProvider" NOT NULL DEFAULT 'NTFY',
    "plataforma" "PlataformaPush" NOT NULL,
    "appVersion" TEXT,
    "ultimoSucessoEm" TIMESTAMP(3),
    "falhasConsecutivas" INTEGER NOT NULL DEFAULT 0,
    "ultimaAtividade" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paciente_dispositivos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "paciente_refresh_tokens" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "usadoEm" TIMESTAMP(3),
    "substituidoPorId" TEXT,
    "revogadoEm" TIMESTAMP(3),
    "motivoRevogacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paciente_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sms_banners" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "tone" "BannerTone" NOT NULL,
    "publicadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3),
    "imagemUrl" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "prioridadeOrdem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "prefeituraId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_banners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sms_banner_views" (
    "id" TEXT NOT NULL,
    "bannerId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "vistoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_banner_views_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tfd_paciente_solicitacoes" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "viagemId" TEXT NOT NULL,
    "status" "TfdPacienteStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "prioridade" "TfdPacientePrioridade" NOT NULL DEFAULT 'NORMAL',
    "justificativaPaciente" TEXT NOT NULL,
    "acompanhante" TEXT,
    "encaminhamentoId" TEXT,
    "encaminhamentoProtocolo" TEXT,
    "numeroAssento" TEXT,
    "motivoRecusa" TEXT,
    "operadorId" TEXT,
    "operadorNome" TEXT,
    "operadorMatricula" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprovadaEm" TIMESTAMP(3),
    "recusadaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "tentativasReabertura" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tfd_paciente_solicitacoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "configuracoes_integracao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "usuario" TEXT,
    "senha" TEXT,
    "token" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_integracao_pkey" PRIMARY KEY ("id")
);

-- Create Indexes safely if they do not exist
CREATE UNIQUE INDEX IF NOT EXISTS "especialidade_recomendacoes_especialidade_key" ON "especialidade_recomendacoes"("especialidade");
CREATE UNIQUE INDEX IF NOT EXISTS "paciente_recovery_tokens_tokenHash_key" ON "paciente_recovery_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "paciente_recovery_tokens_contaId_idx" ON "paciente_recovery_tokens"("contaId");
CREATE INDEX IF NOT EXISTS "paciente_recovery_tokens_expiraEm_idx" ON "paciente_recovery_tokens"("expiraEm");
CREATE UNIQUE INDEX IF NOT EXISTS "paciente_dispositivos_endpoint_key" ON "paciente_dispositivos"("endpoint");
CREATE INDEX IF NOT EXISTS "paciente_dispositivos_contaId_idx" ON "paciente_dispositivos"("contaId");
CREATE INDEX IF NOT EXISTS "paciente_dispositivos_provider_ultimaAtividade_idx" ON "paciente_dispositivos"("provider", "ultimaAtividade");
CREATE UNIQUE INDEX IF NOT EXISTS "paciente_refresh_tokens_tokenHash_key" ON "paciente_refresh_tokens"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "paciente_refresh_tokens_substituidoPorId_key" ON "paciente_refresh_tokens"("substituidoPorId");
CREATE INDEX IF NOT EXISTS "paciente_refresh_tokens_contaId_idx" ON "paciente_refresh_tokens"("contaId");
CREATE INDEX IF NOT EXISTS "paciente_refresh_tokens_expiraEm_idx" ON "paciente_refresh_tokens"("expiraEm");
CREATE INDEX IF NOT EXISTS "sms_banners_ativo_expiraEm_idx" ON "sms_banners"("ativo", "expiraEm");
CREATE INDEX IF NOT EXISTS "sms_banners_prefeituraId_ativo_idx" ON "sms_banners"("prefeituraId", "ativo");
CREATE UNIQUE INDEX IF NOT EXISTS "sms_banner_views_bannerId_contaId_key" ON "sms_banner_views"("bannerId", "contaId");
CREATE INDEX IF NOT EXISTS "tfd_paciente_solicitacoes_contaId_criadaEm_idx" ON "tfd_paciente_solicitacoes"("contaId", "criadaEm");
CREATE INDEX IF NOT EXISTS "tfd_paciente_solicitacoes_viagemId_idx" ON "tfd_paciente_solicitacoes"("viagemId");
CREATE INDEX IF NOT EXISTS "tfd_paciente_solicitacoes_status_prioridade_criadaEm_idx" ON "tfd_paciente_solicitacoes"("status", "prioridade", "criadaEm");
CREATE UNIQUE INDEX IF NOT EXISTS "tfd_paciente_solicitacoes_contaId_viagemId_key" ON "tfd_paciente_solicitacoes"("contaId", "viagemId");
CREATE UNIQUE INDEX IF NOT EXISTS "configuracoes_integracao_nome_key" ON "configuracoes_integracao"("nome");
CREATE INDEX IF NOT EXISTS "notificacoes_paciente_pushStatus_criadaEm_idx" ON "notificacoes_paciente"("pushStatus", "criadaEm");
CREATE UNIQUE INDEX IF NOT EXISTS "sessoes_paciente_refreshTokenId_key" ON "sessoes_paciente"("refreshTokenId");
CREATE UNIQUE INDEX IF NOT EXISTS "tfd_motoristas_atendenteId_key" ON "tfd_motoristas"("atendenteId");
CREATE INDEX IF NOT EXISTS "tfd_viagens_motoristaId_atualizadoEm_idx" ON "tfd_viagens"("motoristaId", "atualizadoEm");

-- Apply Foreign Key constraints safely via a DO block (only if they do not exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'pacientes_contas_ubsVinculadaId_fkey') THEN
        ALTER TABLE "pacientes_contas" ADD CONSTRAINT "pacientes_contas_ubsVinculadaId_fkey" FOREIGN KEY ("ubsVinculadaId") REFERENCES "ubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'paciente_recovery_tokens_contaId_fkey') THEN
        ALTER TABLE "paciente_recovery_tokens" ADD CONSTRAINT "paciente_recovery_tokens_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "pacientes_contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'paciente_dispositivos_contaId_fkey') THEN
        ALTER TABLE "paciente_dispositivos" ADD CONSTRAINT "paciente_dispositivos_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "pacientes_contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'sessoes_paciente_refreshTokenId_fkey') THEN
        ALTER TABLE "sessoes_paciente" ADD CONSTRAINT "sessoes_paciente_refreshTokenId_fkey" FOREIGN KEY ("refreshTokenId") REFERENCES "paciente_refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'paciente_refresh_tokens_contaId_fkey') THEN
        ALTER TABLE "paciente_refresh_tokens" ADD CONSTRAINT "paciente_refresh_tokens_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "pacientes_contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'paciente_refresh_tokens_substituidoPorId_fkey') THEN
        ALTER TABLE "paciente_refresh_tokens" ADD CONSTRAINT "paciente_refresh_tokens_substituidoPorId_fkey" FOREIGN KEY ("substituidoPorId") REFERENCES "paciente_refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'sms_banners_prefeituraId_fkey') THEN
        ALTER TABLE "sms_banners" ADD CONSTRAINT "sms_banners_prefeituraId_fkey" FOREIGN KEY ("prefeituraId") REFERENCES "prefeituras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'sms_banner_views_bannerId_fkey') THEN
        ALTER TABLE "sms_banner_views" ADD CONSTRAINT "sms_banner_views_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "sms_banners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'sms_banner_views_contaId_fkey') THEN
        ALTER TABLE "sms_banner_views" ADD CONSTRAINT "sms_banner_views_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "pacientes_contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tfd_paciente_solicitacoes_contaId_fkey') THEN
        ALTER TABLE "tfd_paciente_solicitacoes" ADD CONSTRAINT "tfd_paciente_solicitacoes_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "pacientes_contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tfd_paciente_solicitacoes_viagemId_fkey') THEN
        ALTER TABLE "tfd_paciente_solicitacoes" ADD CONSTRAINT "tfd_paciente_solicitacoes_viagemId_fkey" FOREIGN KEY ("viagemId") REFERENCES "tfd_viagens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tfd_paciente_solicitacoes_encaminhamentoId_fkey') THEN
        ALTER TABLE "tfd_paciente_solicitacoes" ADD CONSTRAINT "tfd_paciente_solicitacoes_encaminhamentoId_fkey" FOREIGN KEY ("encaminhamentoId") REFERENCES "encaminhamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tfd_motoristas_atendenteId_fkey') THEN
        ALTER TABLE "tfd_motoristas" ADD CONSTRAINT "tfd_motoristas_atendenteId_fkey" FOREIGN KEY ("atendenteId") REFERENCES "atendentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tfd_solicitacoes_ubsId_fkey') THEN
        ALTER TABLE "tfd_solicitacoes" ADD CONSTRAINT "tfd_solicitacoes_ubsId_fkey" FOREIGN KEY ("ubsId") REFERENCES "ubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END
$$;
