# 🏥 UNISISM — Sistema Integrado de Saúde Municipal

> **Secretaria Municipal de Saúde (SMS) — Águas Belas / PE**  
> Plataforma unificada de regulação em saúde, prontuário eletrônico, acolhimento especializado, gestão de Tratamento Fora do Domicílio (TFD), aplicativos móveis e comunicação oficial com o cidadão.

---

## 📌 Visão Geral

O **UNISISM** é uma solução pública de alta integridade desenvolvida para transformar e integrar o fluxo de saúde municipal de ponta a ponta: desde a porta de entrada nas Unidades Básicas de Saúde (UBS), passando pela regulação clínica centralizada, atendimento nos centros de especialidades (médicas e odontológicas), até o transporte sanitário eletivo (TFD) e o acompanhamento digital transparente pelo paciente.

### 🌐 Ambientes & Links
- **Frontend Web (Vercel):** [https://unisism.vercel.app](https://unisism.vercel.app)
- **Backend API (Produção):** `http://184.107.179.209:3333/v1`
- **Repositório Oficial:** [https://github.com/mateussantanaDev/UniSISM](https://github.com/mateussantanaDev/UniSISM)

---

## 🏛️ Arquitetura em 4 Faces

O sistema é estruturado em **Faces operacionais** com Controle de Acesso Baseado em Papéis (**RBAC**) estrito e isolamento por escopo:

```
                               ┌─────────────────────────────────────────┐
                               │       PORTAL CENTRALIZADO UNISISM       │
                               └────────────────────┬────────────────────┘
                                                    │
        ┌───────────────────┬───────────────────────┼───────────────────────┬───────────────────┐
        │                   │                       │                       │                   │
        ▼                   ▼                       ▼                       ▼                   ▼
┌───────────────┐   ┌───────────────┐       ┌───────────────┐       ┌───────────────┐   ┌───────────────┐
│    FACE 1     │   │    FACE 2     │       │  CENTROS ESP. │       │    FACE 3     │   │    FACE 4     │
│   UBS Local   │   │ Regulação SMS │       │   CEM / CEO   │       │ App Cidadão   │   │      TFD      │
│  (Atenção     │   │  (Complexidade│       │ (Especialistas│       │   (Mobile     │   │  (Transporte  │
│    Básica)    │   │  & Auditoria) │       │  & Triagem)   │       │   Flutter)    │   │  & Motorista) │
└───────┬───────┘   └───────┬───────┘       └───────┬───────┘       └───────┬───────┘   └───────┬───────┘
        │                   │                       │                       │                   │
        └───────────────────┴───────────────┬───────┴───────────────────────┴───────────────────┘
                                            │
                                            ▼
                           ┌─────────────────────────────────┐
                           │    API BACKEND + POSTGRESQL     │
                           │   (Clean Architecture + LGPD)   │
                           └─────────────────────────────────┘
```

### 1. Face 1 · Atenção Primária / UBS (`/ubs/*`)
- **Atores:** Atendentes de UBS, Enfermeiros, Coordenadores de Unidade.
- **Funcionalidades:** Recepção do paciente, validação de Cartão SUS/CPF, abertura de solicitação de encaminhamento, triagem inicial e geração de protocolo rastreável no padrão `UBS-AAAA-NNNNNN`.

### 2. Face 2 · Complexo Regulador SMS (`/sms/*`)
- **Atores:** Médicos Reguladores, Administradores da Secretaria de Saúde.
- **Funcionalidades:** Fila de espera municipal unificada, classificação de risco clínico (Protocolo de Manchester / cores), aprovação, solicitação de pendências com devolutiva à UBS, agendamento em cotas municipais ou encaminhamento para a rede estadual (SUS/Central de Regulação).

### 3. Centros Especializados · CEM & CEO (`/cem/*`, `/ceo/*`, `/centro/*`)
- **Atores:** Recepcionistas, Enfermeiros de Triagem, Médicos Especialistas, Cirurgiões Dentistas.
- **Módulos Integrados:**
  - **CEM:** Centro de Especialidades Médicas (Cardiologia, Ortopedia, Ginecologia, Pediatria, etc.).
  - **CEO:** Centro de Especialidades Odontológicas (Endodontia, Periodontia, Cirurgia Bucomaxilofacial).
  - **Triagem Clínica de Enfermagem:** Aferição de sinais vitais (PA, FC, FR, SPO2, Temperatura, Glicemia), cálculo automático de IMC e Pressão Arterial Média (PAM), classificação de risco e encaminhamento prioritário ao consultório.
  - **Painel Smart TV (`/tv`):** Chamador de senhas e consultórios sonoro e visual em tempo real para salas de espera.

### 4. Face 3 · Aplicativo Móvel do Paciente (`UNISISM-Paciente`)
- **Atores:** Cidadão / Paciente.
- **Stack:** Flutter (Android & iOS) + Autenticação segura por CPF e token opaco.
- **Funcionalidades:** Acompanhamento do status de solicitações em tempo real, visualização de datas agendadas, download de guias e notificações push.

### 5. Face 4 · Tratamento Fora do Domicílio / TFD (`/tfd/*` e `UNISISM-motorista`)
- **Atores:** Gestor TFD, Atendente do Terminal Rodoviário, Motoristas da Frota Sanitária.
- **Funcionalidades:**
  - **Gestão de Viagens:** Agendamento de viagens intermunicipais (Recife, Garanhuns, Caruaru), controle de veículos, quilometragem, abastecimento e diárias.
  - **App do Motorista (`UNISISM-motorista`):** App Flutter com sincronização offline, manifesto de passageiros e acompanhantes, validação de embarque via QR Code.
  - **Prestação de Contas:** Registro de auditoria encadeado em blockchain-like (`tfd_audit_log`) com hash SHA-256 para fiscalização dos órgãos de controle (TCE-PE / Ministério Público).

---

## 🤖 CRM e Comunicação WhatsApp Oficial (Meta Cloud API)

O UNISISM conta com um módulo nativo de **CRM Multi-Atendentes** integrado diretamente à API oficial da Meta:
- Disparo de notificações e convocações de consultas/exames.
- Resposta interativa com confirmação ou cancelamento pelo paciente (`Sim, comparecerei` / `Remarcar`).
- Roteamento de mensagens para atendentes da Central de Regulação.

---

## 🔒 Conformidade Legal e Segurança

- **LGPD (Lei Geral de Proteção de Dados - Lei 13.709/2018):**
  - Minimização estrita de dados em relatórios (`TipoRelatorioMeta`).
  - Logs de acesso a dados sensíveis retidos por no mínimo 5 anos em modo append-only (`relatorio_audit`).
- **CFM (Resolução CFM nº 1.821/2007):**
  - Auditoria de prontuário com retenção legal obrigatória de **20 anos**.
  - Triggers a nível de banco de dados bloqueando operações de `UPDATE` e `DELETE` no histórico do prontuário.
- **Auditoria de TFD:**
  - Cada entrada de auditoria possui `hash = SHA-256(payload || hash_anterior)`.
  - Suporte a verificação de integridade e exportação em pacote auditável.
- **Segurança no Upload de Documentos:**
  - Análise antivírus assíncrona com **ClamAV**.
  - Otimização e compressão automática de laudos e exames em PDF (Ghostscript / pdf-lib).

---

## 📂 Estrutura do Repositório (Monorepo)

```
UniSISM/
├── backend/                       # API REST em Node.js + TypeScript
│   ├── prisma/                    # Schema do banco de dados (~50 tabelas), migrations e seed
│   ├── src/
│   │   ├── domain/                # Entidades e regras de negócio puras
│   │   ├── application/           # Use cases principais (UBS, Regulação, Admin)
│   │   ├── infrastructure/        # Implementações de banco (Prisma), storage S3, JWT, ClamAV
│   │   ├── presentation/          # Controllers, rotas Express, middlewares de auth/RBAC
│   │   ├── modules/               # Módulos verticais autônomos:
│   │   │   ├── centro/            # Gestão de CEM, CEO, Triagem de Enfermagem e Smart TV
│   │   │   ├── gestao/            # Regulação SMS e fluxo de aprovação
│   │   │   ├── tfd/               # Gestão de frotas e viagens do TFD
│   │   │   ├── motorista-app/     # API dedicada para o aplicativo dos motoristas
│   │   │   ├── paciente-app/      # API dedicada para o aplicativo do paciente
│   │   │   ├── prontuario/        # Prontuário eletrônico com auditoria CFM 20 anos
│   │   │   └── relatorios/        # Geração de PDFs/XLSX auditáveis LGPD
│   │   └── main/                  # Composition root, container de injeção de dependências e server
│   └── tests/                     # Testes de integração e regressão com Jest
│
├── frontend/                      # Webapp responsivo em SvelteKit + TailwindCSS
│   ├── src/
│   │   ├── lib/                   # Componentes compartilhados, design system e client de API
│   │   └── routes/                # Rotas da aplicação:
│   │       ├── ubs/               # Painel da Unidade Básica de Saúde
│   │       ├── sms/               # Painel do Complexo Regulador
│   │       ├── centro/            # Painel do Centro de Especialidades (Recepção/Triagem)
│   │       ├── cem/ & ceo/        # Consultórios de Especialistas Médicos e Odontológicos
│   │       ├── tv/                # Painel de chamada de senhas para Smart TVs
│   │       ├── tfd/               # Painel de controle de transporte e viagens
│   │       └── api-proxy/         # Proxy reverso para contornar restrições de CORS em produção
│
├── UNISISM-Paciente/              # Aplicativo Mobile Cidadão (Flutter)
│   ├── lib/                       # Telas de agendamentos, carteira de saúde, push notifications
│   └── pubspec.yaml
│
├── UNISISM-motorista/             # Aplicativo Mobile Motorista TFD (Flutter)
│   ├── lib/                       # Lista de passageiros, leitor de QR Code, sincronização offline
│   └── pubspec.yaml
│
├── CLAUDE.md                      # Diretrizes técnicas e regras de arquitetura interna
├── DOCKER_SETUP.md                # Instruções detalhadas de containerização
└── package.json                   # Scripts de orquestração do monorepo
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Node.js** v20+ ou v22+
- **Docker** e **Docker Compose**
- **Flutter SDK** (caso vá executar os apps móveis)

### 1. Inicializar os Serviços Docker
Na raiz do projeto ou na pasta `backend/`:
```bash
cd backend/
cp .env.example .env
docker compose up -d postgres redis minio
```
> *Nota: O ClamAV pode levar alguns minutos para atualizar as assinaturas de vírus na primeira execução.*

### 2. Configurar e Executar o Backend
```bash
cd backend/
npm install
npx prisma generate
npx prisma migrate dev
npm run db:setup-triggers    # Aplica as triggers SQL de imutabilidade de prontuário e TFD
npm run db:seed              # (Opcional) Popula o banco com dados iniciais de teste

# Iniciar em modo de desenvolvimento
npm run dev
```
A API estará acessível em: `http://localhost:3333/v1` (Health check: `http://localhost:3333/health`).

### 3. Configurar e Executar o Frontend
Em outro terminal:
```bash
cd frontend/
npm install
npm run dev
```
Acesse no seu navegador: `http://localhost:5173`.

---

## 🧪 Testes Automatizados

O backend conta com uma suíte de testes de integração e regressão:
```bash
cd backend/
npm test
```
Para executar testes de um módulo específico (ex: Triagem e Centros de Especialidade):
```bash
cd backend/
npx jest tests/triagem.test.ts --runInBand
```

---

## 🚢 Deploy em Produção

### Frontend (Vercel)
O frontend está configurado com `@sveltejs/adapter-vercel`. Para realizar deploy:
```bash
cd frontend/
npx vercel --prod
```

### Backend (VPS / Servidor Dedicado)
No servidor Linux de produção:
```bash
cd /opt/unisism/backend
git pull origin main
npm install --omit=dev
npx prisma migrate deploy
npm run build
pm2 restart unisism-backend   # ou docker compose -f docker-compose.prod.yml up -d --build
```

---

## 📄 Licença

Este projeto é desenvolvido para a **Secretaria Municipal de Saúde de Águas Belas / PE**.  
Todos os direitos reservados aos órgãos gestores do município.
