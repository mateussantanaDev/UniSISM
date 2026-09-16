-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StatusConversaWhatsApp" AS ENUM ('PENDENTE', 'EM_ATENDIMENTO', 'AGUARDANDO_PACIENTE', 'RESOLVIDO', 'FINALIZADO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DirecaoMensagemWhatsApp" AS ENUM ('ENTRADA', 'SAIDA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrigemMensagemWhatsApp" AS ENUM ('PACIENTE', 'ATENDENTE', 'SISTEMA_BOT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoMensagemWhatsApp" AS ENUM ('TEXTO', 'IMAGEM', 'DOCUMENTO', 'AUDIO', 'TEMPLATE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusEnvioWhatsApp" AS ENUM ('PENDENTE', 'ENVIADO', 'ENTREGUE', 'LIDO', 'FALHA', 'RECEBIDO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_config" (
    "id" TEXT NOT NULL,
    "prefeituraId" TEXT,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT,
    "accessToken" TEXT NOT NULL,
    "webhookVerifyToken" TEXT NOT NULL,
    "businessPhoneNumber" TEXT,
    "nomeExibicao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "mensagemBoasVindas" TEXT DEFAULT 'Olá! Bem-vindo(a) ao canal oficial de atendimento do Centro de Especialidades. Como podemos ajudar?',
    "mensagemForaHorario" TEXT DEFAULT 'Olá! Nosso horário de atendimento é de Segunda a Sexta das 07:00 às 18:00. Sua mensagem foi recebida e responderemos em breve!',
    "mensagemConfirmacao" TEXT DEFAULT 'Olá, {{nome}}! Confirmamos sua consulta de {{especialidade}} com {{medico}} para o dia {{data}} às {{hora}}. Responda SIM para confirmar ou NÃO para reagendar.',
    "horarioInicio" TEXT DEFAULT '07:00',
    "horarioFim" TEXT DEFAULT '18:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_conversas" (
    "id" TEXT NOT NULL,
    "prefeituraId" TEXT,
    "centroTipo" TEXT NOT NULL DEFAULT 'CEM',
    "pacienteId" TEXT,
    "telefone" TEXT NOT NULL,
    "nomeContato" TEXT NOT NULL,
    "cpf" TEXT,
    "status" "StatusConversaWhatsApp" NOT NULL DEFAULT 'PENDENTE',
    "atendenteId" TEXT,
    "atendenteNome" TEXT,
    "ultimaMensagemTexto" TEXT,
    "ultimaMensagemData" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "naoLidas" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "encaminhamentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_mensagens" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "direcao" "DirecaoMensagemWhatsApp" NOT NULL,
    "origem" "OrigemMensagemWhatsApp" NOT NULL,
    "atendenteId" TEXT,
    "atendenteNome" TEXT,
    "corpo" TEXT NOT NULL,
    "tipo" "TipoMensagemWhatsApp" NOT NULL DEFAULT 'TEXTO',
    "mediaUrl" TEXT,
    "whatsappMessageId" TEXT,
    "statusEnvio" "StatusEnvioWhatsApp" NOT NULL DEFAULT 'ENVIADO',
    "erroEnvio" TEXT,
    "metadata" JSONB,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "prefeituraId" TEXT,
    "titulo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'CONFIRMACAO',
    "conteudo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_config_prefeituraId_key" ON "whatsapp_config"("prefeituraId");
CREATE INDEX IF NOT EXISTS "whatsapp_conversas_telefone_idx" ON "whatsapp_conversas"("telefone");
CREATE INDEX IF NOT EXISTS "whatsapp_conversas_status_idx" ON "whatsapp_conversas"("status");
CREATE INDEX IF NOT EXISTS "whatsapp_conversas_atendenteId_idx" ON "whatsapp_conversas"("atendenteId");
CREATE INDEX IF NOT EXISTS "whatsapp_conversas_prefeituraId_idx" ON "whatsapp_conversas"("prefeituraId");
CREATE INDEX IF NOT EXISTS "whatsapp_mensagens_conversaId_idx" ON "whatsapp_mensagens"("conversaId");
CREATE INDEX IF NOT EXISTS "whatsapp_mensagens_whatsappMessageId_idx" ON "whatsapp_mensagens"("whatsappMessageId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_mensagens" ADD CONSTRAINT "whatsapp_mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "whatsapp_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
