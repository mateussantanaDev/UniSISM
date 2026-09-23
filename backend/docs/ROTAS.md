# UNISISM · Mapa completo de rotas HTTP

> **Base URL (dev):** `http://localhost:3333/v1`
> **Base URL (prod planejada):** `https://api.unisism.aguasbelas.pe.gov.br/v1`
> **Auth:** `Authorization: Bearer <jwt>` em toda rota exceto as marcadas como _público_.
> **API key:** quando `API_KEY` estiver configurada, todas as rotas exigem `x-api-key` (ou `API_KEY_HEADER`), exceto `/v1/health` e `/metrics`. Rotas marcadas como _público_ dispensam JWT, mas não dispensam API key nesse modo.
> **Erros:** `{ error: { code, message, details? } }` — códigos catalogados em [`API.md §14`](API.md#14-c%C3%B3digos-de-erro-catalogados).

Roles (RBAC):

- **DEV** = `DESENVOLVEDOR`
- **ADM** = `ADMIN`
- **REG** = `REGULADOR_SMS`
- **COORD** = `COORDENADOR_UBS`
- **AT_UBS** = `ATENDENTE_UBS`
- **GES_TFD** = `GESTOR_TFD`
- **AT_TFD** = `ATENDENTE_TFD` (terminal rodoviário)
- **MOT_TFD** = `MOTORISTA_TFD` (app mobile)
- **PAC** = paciente autenticado (token opaco próprio, não JWT)

---

## Índice

1. [Auth (público + autenticado)](#1-auth-comum)
2. [Perfil / Me](#2-perfil)
3. [Dashboard](#3-dashboard)
4. [Encaminhamentos Face 1 (UBS)](#4-encaminhamentos-face-1)
5. [Encaminhamentos Face 2 (Regulação SMS)](#5-encaminhamentos-face-2)
6. [Pacientes (PEC)](#6-pacientes)
7. [Prontuário · sub-documentos](#7-prontu%C3%A1rio)
8. [Relatórios](#8-relat%C3%B3rios)
9. [Admin · Prefeituras / UBSs / Usuários](#9-admin)
10. [Face 4 · TFD (gestão)](#10-tfd-gest%C3%A3o)
11. [Face 4 · Motorista (app mobile)](#11-motorista-app)
12. [Face 3 · Paciente (app mobile)](#12-paciente-app)
13. [Infra (health + metrics)](#13-infra)

---

## 1. Auth comum

| Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|
| POST | `/v1/auth/login` | público | qualquer | Login por matrícula OU email + senha. Devolve JWT + refresh. |
| POST | `/v1/auth/logout` | bearer | qualquer | Revoga sessão atual. |
| POST | `/v1/auth/forgot-password` | público | qualquer | Inicia fluxo de reset (envia código de 6 dígitos por email). |
| POST | `/v1/auth/verify-code` | público | qualquer | Valida o código → devolve `resetToken` (TTL 5min). |
| POST | `/v1/auth/reset-password` | público | qualquer | Redefine senha com `resetToken`. |
| GET | `/v1/auth/me` | bearer | qualquer | Resumo do atendente logado (sidebar/header). |

---

## 2. Perfil

| Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|
| GET | `/v1/me/profile` | bearer | qualquer | Perfil completo + produção + segurança + atividade. |
| POST | `/v1/me/password` | bearer | qualquer | Trocar senha autenticada (revoga demais sessões). |
| POST | `/v1/me/sessions/revoke-others` | bearer | qualquer | Encerra todas as sessões exceto a atual. |

---

## 3. Dashboard

| Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|
| GET | `/v1/dashboard/metrics` | bearer | qualquer | Métricas agregadas respeitando escopo (DEV vê tudo, ADM vê prefeitura, UBS vê só a UBS). |

---

## 4. Encaminhamentos Face 1

Fluxo: atendente UBS consolida encaminhamento → envia à Regulação SMS.

| Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|
| POST | `/v1/encaminhamentos/extract-pdf` | bearer | qualquer | OCR + extração estruturada do PDF (não persiste). `multipart/form-data` com `file`. |
| POST | `/v1/encaminhamentos` | bearer | AT_UBS, COORD, DEV | Consolida + cria encaminhamento. `multipart/form-data` com `payload`, `solicitacao` (PDF), `anexo[]`, `tipoAnexo[]`. |
| GET | `/v1/encaminhamentos` | bearer | qualquer | Lista filtrada por escopo. Query: `status`, `pacienteId`, `desde`, `ate`, `limit`. |
| GET | `/v1/encaminhamentos/:id` | bearer | qualquer | Detalhe + timeline + anexos. |
| PATCH | `/v1/encaminhamentos/:id` | bearer | AT_UBS, COORD, ADM, DEV | Edita dados antes da Regulação (AT_UBS/COORD) ou em qualquer status (ADM/DEV). |
| DELETE | `/v1/encaminhamentos/:id` | bearer | ADM, DEV | Soft delete (exige `motivo` ≥ 10 chars). |
| POST | `/v1/encaminhamentos/:id/resolve-pendencia` | bearer | AT_UBS, COORD, DEV | Responde pendência. `multipart` com `nota` + `anexo[]` + `tipoAnexo[]`. |

---

## 5. Encaminhamentos Face 2

Decisão da Regulação SMS sobre encaminhamentos das UBSs da prefeitura.

| Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|
| GET | `/v1/encaminhamentos/arvore` | bearer | REG, ADM, DEV | Agregação UBS → Ano → Mês → Dia (file-manager da SMS). Query progressiva: `ubsId`, `ano`, `mes`. |
| POST | `/v1/encaminhamentos/:id/aprovar` | bearer | REG, DEV | Aprovar (status → `APROVADO`). Body opcional: `nota`, `agendamentoPrevisto`. |
| POST | `/v1/encaminhamentos/:id/registrar-pendencia` | bearer | REG, DEV | Solicitar correção. Body: `observacao` (obrigatória). |
| POST | `/v1/encaminhamentos/:id/rejeitar` | bearer | REG, DEV | Rejeição terminal. Body: `motivo`. |
| POST | `/v1/encaminhamentos/:id/resposta-sus` | bearer | REG, DEV | Anexa PDF oficial do SUS Federal. `multipart` com `file` + `observacao`. |

---

## 6. Pacientes

| Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|
| GET | `/v1/pacientes` | bearer | qualquer | Lista PEC. Query: `q`, `filtro` (`COM_CRONICAS\|COM_ENCAMINHAMENTOS\|SEM_ATENDIMENTO_90D`), `equipeId`, `microarea`. |
| GET | `/v1/pacientes/por-cpf/:cpf` | bearer | qualquer | Busca por CPF + lista campos faltantes (apoia consolidação de encaminhamento). |
| GET | `/v1/pacientes/:id` | bearer | qualquer | Prontuário completo (alergias, crônicas, medicamentos, atendimentos, exames, vacinas, TFD). |
| PATCH | `/v1/pacientes/:id` | bearer | DEV, ADM, COORD, AT_UBS | Edita 23 campos do paciente (não CPF nem ubsId). |
| DELETE | `/v1/pacientes/:id` | bearer | DEV, ADM, COORD | Soft delete (bloqueia se houver enc ativos). |

---

## 7. Prontuário

Sub-documentos do PEC. Cada mutação grava em `paciente_prontuario_audit` (retenção 20 anos · CFM 1.821/2007).

**Roles permitidos para tudo abaixo:** DEV, ADM, COORD, AT_UBS.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/v1/pacientes/:pacienteId/alergias` | Adiciona alergia. |
| DELETE | `/v1/pacientes/:pacienteId/alergias/:id` | Remove alergia. |
| POST | `/v1/pacientes/:pacienteId/condicoes-cronicas` | Adiciona condição crônica. |
| PATCH | `/v1/pacientes/:pacienteId/condicoes-cronicas/:id` | Atualiza condição. |
| DELETE | `/v1/pacientes/:pacienteId/condicoes-cronicas/:id` | Remove condição. |
| POST | `/v1/pacientes/:pacienteId/medicamentos` | Adiciona medicamento em uso. |
| PATCH | `/v1/pacientes/:pacienteId/medicamentos/:id` | Atualiza medicamento. |
| DELETE | `/v1/pacientes/:pacienteId/medicamentos/:id` | Remove medicamento. |
| PUT | `/v1/pacientes/:pacienteId/historico-familiar` | Substitui histórico familiar (array completo). |
| POST | `/v1/pacientes/:pacienteId/atendimentos` | Adiciona atendimento (SOAP). |
| DELETE | `/v1/pacientes/:pacienteId/atendimentos/:id` | Remove atendimento. |
| POST | `/v1/pacientes/:pacienteId/exames` | Adiciona exame. |
| DELETE | `/v1/pacientes/:pacienteId/exames/:id` | Remove exame. |
| POST | `/v1/pacientes/:pacienteId/vacinacoes` | Registra vacinação. |
| DELETE | `/v1/pacientes/:pacienteId/vacinacoes/:id` | Remove vacinação. |
| POST | `/v1/pacientes/:pacienteId/viagens` | Adiciona viagem TFD (histórico no prontuário, separado do módulo TFD). |
| PATCH | `/v1/pacientes/:pacienteId/viagens/:id` | Atualiza viagem TFD. |
| DELETE | `/v1/pacientes/:pacienteId/viagens/:id` | Remove viagem TFD. |

---

## 8. Relatórios

Pipeline LGPD-first (PDF/CSV/XLSX). Retenção 5 anos do `relatorio_audit` (LGPD art. 37). TTL 7 dias do arquivo.

| Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|
| GET | `/v1/relatorios` | bearer | qualquer | Lista relatórios do atendente (últimos 90 dias). |
| POST | `/v1/relatorios` | bearer | qualquer | Solicita geração assíncrona. Body: `tipo`, `dataInicial`, `dataFinal`, `formato`, `filtros?`. |
| GET | `/v1/relatorios/:id/download` | bearer | dono / ADM da prefeitura / DEV | Stream do arquivo (binário com `Content-Disposition`). |

Tipos: `PRODUCAO_INDIVIDUAL`, `ENCAMINHAMENTOS_POR_ESPECIALIDADE`, `FILA_REGULACAO`, `PENDENCIAS_RESOLVIDAS`, `TFD_CUSTOS`, `VACINACAO_UBS`, `BUSCA_ATIVA`.

---

## 9. Admin

### Prefeituras

| Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|
| POST | `/v1/admin/prefeituras` | bearer | **DEV** | Cria prefeitura. Body: `nome`, `municipio`, `uf`, `cnpj`. |
| GET | `/v1/admin/prefeituras` | bearer | DEV (todas), ADM (própria) | Lista. |
| PATCH | `/v1/admin/prefeituras/:id` | bearer | DEV, ADM | Edita `nome`, `municipio`, `uf`, `cnpj`, `ativa`. |
| DELETE | `/v1/admin/prefeituras/:id` | bearer | **DEV** | Soft delete (bloqueia se houver UBSs/usuários). |

### UBSs

| Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|
| POST | `/v1/admin/ubs` | bearer | DEV, ADM | Cria UBS. |
| GET | `/v1/admin/ubs` | bearer | DEV, ADM, COORD, REG, **GES_TFD**, **AT_TFD** | Lista UBSs. Query: `prefeituraId`. |
| PATCH | `/v1/admin/ubs/:id` | bearer | DEV, ADM | Edita. |
| DELETE | `/v1/admin/ubs/:id` | bearer | DEV, ADM | Soft delete. |

### Usuários (atendentes)

| Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|
| POST | `/v1/admin/usuarios` | bearer | DEV, ADM | Cria usuário com role: DEV, ADM, REG, GES_TFD, **AT_TFD**, COORD, AT_UBS. **MOT_TFD bloqueado aqui** — usar `POST /v1/tfd/motoristas`. |
| GET | `/v1/admin/usuarios` | bearer | DEV, ADM, COORD | Lista. Query: `q`, `role`, `ubsId`, `prefeituraId`, `ativo`. |
| PATCH | `/v1/admin/usuarios/:id` | bearer | DEV, ADM | Edita dados não-sensíveis. |
| DELETE | `/v1/admin/usuarios/:id` | bearer | DEV, ADM | Soft delete + revoga sessões. |
| POST | `/v1/admin/usuarios/:id/ativo` | bearer | DEV, ADM | Ativa/desativa. Body: `{ ativo: boolean }`. |
| POST | `/v1/admin/usuarios/:id/reset-senha` | bearer | DEV, ADM | Admin redefine senha. Body: `{ novaSenha }`. |

---

## 10. TFD (gestão)

Spec completa: [`TFD_API.md`](TFD_API.md). 57 rotas com cadeia hash de auditoria TJ.

**Grupos de roles:**
- `rwGestor` = GES_TFD, ADM, DEV
- `rwAdmin` = ADM, DEV
- `rwSolic` = `rwGestor` + COORD + AT_UBS + **AT_TFD** (terminal rodoviário)

### Frota (7)

| Método | Rota | Roles |
|---|---|---|
| GET | `/v1/tfd/veiculos` | rwGestor |
| POST | `/v1/tfd/veiculos` | rwGestor |
| GET | `/v1/tfd/veiculos/:id` | rwGestor |
| PATCH | `/v1/tfd/veiculos/:id` | rwGestor |
| POST | `/v1/tfd/veiculos/:id/manutencao` | rwGestor |
| POST | `/v1/tfd/veiculos/:id/reativar` | rwGestor |
| DELETE | `/v1/tfd/veiculos/:id` | rwAdmin |

### Motoristas (7)

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| GET | `/v1/tfd/motoristas` | rwGestor | |
| POST | `/v1/tfd/motoristas` | rwGestor | **Cria operador + Atendente + senha provisória**. Response inclui `{matricula, senhaProvisoria}` (UMA vez). |
| GET | `/v1/tfd/motoristas/:id` | rwGestor | |
| PATCH | `/v1/tfd/motoristas/:id` | rwGestor | |
| POST | `/v1/tfd/motoristas/:id/afastar` | rwGestor | |
| POST | `/v1/tfd/motoristas/:id/reativar` | rwGestor | |
| DELETE | `/v1/tfd/motoristas/:id` | rwAdmin | |

### Solicitações (7)

| Método | Rota | Roles | Descrição |
|---|---|---|---|
| GET | `/v1/tfd/solicitacoes` | rwSolic | Lista (filtros: `status`, `prioridade`, `q`). |
| POST | `/v1/tfd/solicitacoes` | rwSolic | Cria. |
| GET | `/v1/tfd/solicitacoes/:id` | rwSolic | Detalhe. |
| POST | `/v1/tfd/solicitacoes/:id/aprovar` | **rwGestor** | Aprovar (com alocação opcional). |
| POST | `/v1/tfd/solicitacoes/:id/negar` | **rwGestor** | Negar (motivo ≥ 10 chars). |
| POST | `/v1/tfd/solicitacoes/:id/anexos` | rwSolic | Anexa comprovante (`multipart`). |
| GET | `/v1/tfd/anexos/:id/download` | rwSolic | Download (após scan LIMPO). |

### Viagens (12)

| Método | Rota | Roles |
|---|---|---|
| GET | `/v1/tfd/viagens` | rwGestor |
| POST | `/v1/tfd/viagens` | rwGestor |
| GET | `/v1/tfd/viagens/:id` | rwGestor |
| PATCH | `/v1/tfd/viagens/:id` | rwGestor |
| POST | `/v1/tfd/viagens/:id/iniciar` | rwGestor |
| POST | `/v1/tfd/viagens/:id/concluir` | rwGestor |
| POST | `/v1/tfd/viagens/:id/cancelar` | rwGestor |
| POST | `/v1/tfd/viagens/:id/km-gestor` | rwGestor |
| POST | `/v1/tfd/viagens/:id/alocar` | rwGestor |
| POST | `/v1/tfd/viagens/:id/passageiros` | rwGestor |
| DELETE | `/v1/tfd/viagens/:id/passageiros/:pid` | rwGestor |
| POST | `/v1/tfd/viagens/:id/passageiros/:pid/presenca` | rwGestor |

### Abastecimento (6)

| Método | Rota | Roles |
|---|---|---|
| GET | `/v1/tfd/abastecimentos` | rwGestor |
| POST | `/v1/tfd/abastecimentos` | rwGestor |
| POST | `/v1/tfd/abastecimentos/:id/liberar` | rwGestor |
| POST | `/v1/tfd/abastecimentos/:id/negar` | rwGestor |
| POST | `/v1/tfd/abastecimentos/:id/comprovante` | rwGestor |
| GET | `/v1/tfd/abastecimentos/:id/comprovante` | rwGestor |

### Saldo (2)

| Método | Rota | Roles |
|---|---|---|
| GET | `/v1/tfd/saldo` | rwGestor |
| POST | `/v1/tfd/saldo/ajustar` | rwAdmin |

### Ajuda de Custo (6)

| Método | Rota | Roles |
|---|---|---|
| GET | `/v1/tfd/ajudas-custo` | rwGestor |
| GET | `/v1/tfd/ajudas-custo/:id` | rwGestor |
| POST | `/v1/tfd/ajudas-custo` | rwGestor |
| POST | `/v1/tfd/ajudas-custo/:id/autorizar` | rwGestor |
| POST | `/v1/tfd/ajudas-custo/:id/pagar` | rwAdmin (`multipart` com comprovante) |
| POST | `/v1/tfd/ajudas-custo/:id/negar` | rwGestor |

### Auditoria TJ (4)

| Método | Rota | Roles |
|---|---|---|
| GET | `/v1/tfd/auditoria` | rwAdmin |
| GET | `/v1/tfd/auditoria/exportar-tj` | rwAdmin |
| GET | `/v1/tfd/auditoria/verificar` | rwAdmin (verifica integridade da cadeia hash) |
| GET | `/v1/tfd/auditoria/:id` | rwAdmin |

### Solicitações Paciente (6)

| Método | Rota | Roles |
|---|---|---|
| GET | `/v1/tfd/solicitacoes-paciente` | rwGestor |
| GET | `/v1/tfd/solicitacoes-paciente/:id` | rwGestor |
| POST | `/v1/tfd/solicitacoes-paciente/:id/aprovar` | rwGestor |
| POST | `/v1/tfd/solicitacoes-paciente/:id/recusar` | rwGestor |
| POST | `/v1/tfd/solicitacoes-paciente/:id/embarque` | rwGestor |
| POST | `/v1/tfd/solicitacoes-paciente/:id/concluir` | rwGestor |

---

## 11. Motorista app

Base path: `/v1/motorista-app/*`. App Flutter (`UNISISM-motorista`). JWT 30 dias.
Todas as rotas (exceto `/auth/login`) exigem role **MOT_TFD**.
Spec completa: [`MOTORISTA_APP_API.md`](MOTORISTA_APP_API.md).

| Método | Rota | Auth | Pré-condição | Descrição |
|---|---|---|---|---|
| POST | `/v1/motorista-app/auth/login` | público | — | Matrícula + senha → JWT. Response: `{token, motorista, primeiroLogin}`. |
| GET | `/v1/motorista-app/auth/me` | bearer | — | Perfil completo do motorista. |
| POST | `/v1/motorista-app/auth/trocar-senha` | bearer | — | Body: `{senhaAtual, novaSenha}` (≥8 chars, letras+números). Zera `primeiroLogin`. |
| POST | `/v1/motorista-app/auth/logout` | bearer | — | Limpa FCM token + audit. |
| GET | `/v1/motorista-app/minhas-viagens` | bearer | `primeiroLogin=false` | Sync incremental. Query: `desde` (ISO), `status` (csv), `limit`. Header `X-Server-Time`. |
| GET | `/v1/motorista-app/viagens/:id` | bearer | `primeiroLogin=false` | Detalhe (404 se de outro motorista). |
| POST | `/v1/motorista-app/viagens/:id/iniciar` | bearer | `primeiroLogin=false` | Body: `{kmInicialHodometro}`. Valida CNH, hodômetro, status. |
| POST | `/v1/motorista-app/viagens/:id/concluir` | bearer | `primeiroLogin=false` | Body: `{kmFinalHodometro}`. Atualiza hodômetro do veículo + totais. |
| POST | `/v1/motorista-app/viagens/:id/passageiros/:pid/presenca` | bearer | `primeiroLogin=false` | Chamada digital. Body: `{presenca, observacao?}`. AUSENTE/DESISTIU exigem observação. |
| GET | `/v1/motorista-app/ajudas-custo` | bearer | `primeiroLogin=false` | Read-only — ajudas das viagens do motorista. |
| POST | `/v1/motorista-app/me/fcm-token` | bearer | `primeiroLogin=false` | Body: `{fcmToken}` (≥20 chars). Registra push. |
| DELETE | `/v1/motorista-app/me/fcm-token` | bearer | — | Revoga (usado no logout). |

> **Header de toda response GET:** `X-Server-Time: <ISO 8601 UTC>` — cursor pro sync incremental.

---

## 12. Paciente app

Base path legado: `/v1/paciente-app/*`. Contrato novo também expõe `/v1/auth/paciente/*`
para autenticação e `/v1/paciente/*` para recursos. App Flutter (kit em [`flutter/`](flutter/)).
Token **opaco** (não JWT) com access curto + refresh rotativo. Não exige role do RBAC — auth pelo paciente.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/v1/paciente-app/auth/login` | público | CPF + senha (inicial = CPF dígitos). Response: `{accessToken, refreshToken, expiresAt, paciente}`. |
| POST | `/v1/paciente-app/auth/refresh` | público | Rotaciona refresh e devolve novo access token. |
| POST | `/v1/paciente-app/auth/ativar-conta` | público | Legado: CPF + dataNascimento + senha (confirmação de identidade). |
| POST | `/v1/paciente-app/auth/logout` | bearer paciente | Revoga sessão. |
| POST | `/v1/paciente-app/auth/trocar-senha` | bearer paciente | Body: `{senhaAtual, novaSenha}`. Zera `senhaProvisoria`. |
| GET | `/v1/paciente-app/me` | bearer paciente | Dados da conta. |
| GET | `/v1/paciente-app/meus-encaminhamentos` | bearer paciente | Lista por CPF. |
| GET | `/v1/paciente-app/notificacoes` | bearer paciente | Query `apenasNaoLidas=true`. |
| GET | `/v1/paciente-app/notificacoes/count` | bearer paciente | `{naoLidas: number}` para badge. |
| POST | `/v1/paciente-app/notificacoes/:id/lida` | bearer paciente | Marca uma como lida. |
| POST | `/v1/paciente-app/notificacoes/marcar-todas-lidas` | bearer paciente | `{atualizadas: number}`. |
| GET | `/v1/paciente-app/anexos/:id/download` | bearer paciente | Stream do anexo (após scan LIMPO; pertence ao próprio CPF). |

---

## 13. Infra

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/v1/health` | público | Healthcheck. `{"ok": true}`. |
| GET | `/metrics` | público (interno) | Prometheus scrape (SEM prefixo `/v1`). Restringir via firewall em prod. |

---

## Cabeçalhos comuns

| Header | Quando | Descrição |
|---|---|---|
| `Authorization: Bearer <jwt>` | Toda rota privada | JWT da Face 1/2/4 OU token opaco da Face 3 (paciente) |
| `Content-Type: application/json` | POST/PATCH/PUT com body JSON | — |
| `Content-Type: multipart/form-data` | Upload de arquivos | extract-pdf, encaminhamentos, anexos TFD, ajuda de custo (pagamento), etc. |
| `X-Request-Id` | Toda response | UUID gerado pelo middleware (logging/tracing) |
| `X-Server-Time` | Response GET | ISO 8601 UTC — cursor para sync incremental (motorista app) |
| `Cache-Control: public, max-age=30` | `/dashboard/metrics` | TTL de 30s |

---

## Status HTTP usados

| HTTP | Quando |
|---|---|
| 200 | OK com body |
| 201 | Created |
| 202 | Accepted (assíncrono — `POST /relatorios`) |
| 204 | No Content |
| 400 | Payload inválido / regra de body |
| 401 | Token ausente / expirado / inválido / credenciais erradas |
| 403 | Autenticado mas sem permissão (role ou escopo) |
| 404 | Recurso não existe OU está fora do escopo (anti-enumeração) |
| 409 | Conflito (status errado, CNPJ duplicado, etc.) |
| 410 | Relatório expirado (TTL > 7 dias) |
| 413 | Upload > 10 MB |
| 415 | MIME não suportado |
| 422 | Regra de negócio violada |
| 429 | Rate limit |
| 500 | Erro não tratado (sempre com `requestId`) |
| 503 | Manutenção |

---

## Quickstart frontend

```ts
// frontend/.env
VITE_API_BASE_URL=http://localhost:3333/v1

// uso
const r = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ login: 'DEV-MATEUS', senha: 'Aguasbelas#!' }),
});
const { token } = await r.json();
// guardar em cookie httpOnly OU storage seguro
```

Para usar o cliente tipado pronto: `cp backend/docs/types.ts frontend/src/lib/api/` + `cp backend/docs/api-client.ts frontend/src/lib/api/`. Receitas em [`README.md`](README.md).
