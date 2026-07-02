# 07 · Face 1 — Atendimento UBS

> Atendente da UBS recebe o paciente com PDF de encaminhamento do médico,
> consolida via OCR/extração estruturada e envia à Regulação SMS.

---

## Atores

- `ATENDENTE_UBS` — operador padrão da UBS.
- `COORDENADOR_UBS` — coordena a UBS, mesmas ações + dashboard agregada.
- `DESENVOLVEDOR` — overrides técnicos.

## Rotas frontend

```
/login                      público
/ubs                        layout principal (auth required)
/ubs/dashboard              métricas da UBS
/ubs/pacientes              lista PEC (com filtros)
/ubs/pacientes/[id]         prontuário completo (sub-documentos)
/ubs/encaminhamento         lista de encaminhamentos da UBS
/ubs/encaminhamento/[id]    detalhe + timeline + anexos
/ubs/novo-encaminhamento    wizard: upload → extract → confirmar → consolidar
/ubs/novo-encaminhamento/confirmacao  tela final do wizard
/ubs/historico              histórico denso (filtros temporais)
/ubs/respostas-sms          PDFs oficiais devolvidos pela Regulação
/ubs/perfil                 perfil + segurança + atividade
```

## Fluxos macro

### F1. Consolidar encaminhamento (golden path)

```
1. Atendente recebe paciente + PDF de solicitação médica.
2. /ubs/novo-encaminhamento → upload do PDF.
3. POST /v1/encaminhamentos/extract-pdf (multipart)
   ← retorna { dados extraídos, score, alertas }
4. Form pré-preenchido aparece para revisão.
   ├─ Atendente corrige campos errados (CPF, CID, especialidade, etc.)
   ├─ Atendente seleciona prioridade clínica.
   ├─ Atendente anexa documentos opcionais (RG, CPF, exames).
5. POST /v1/encaminhamentos (multipart)
   Body: payload JSON + solicitacao (PDF) + anexo[] + tipoAnexo[]
   ← cria Encaminhamento + Paciente (se novo CPF) + PacienteConta (se novo)
   ← envia notificação push + email para o paciente
   ← retorna { encaminhamento, paciente, protocolo: "UBS-2026-XXXXXX" }
6. /ubs/novo-encaminhamento/confirmacao mostra protocolo + QR.
```

### F2. Pendência registrada pela Regulação

```
1. Regulador registra pendência (Face 2).
2. Atendente vê na lista (status PENDENCIA_DOCUMENTO).
3. /ubs/encaminhamento/[id] → ação "Resolver pendência".
4. Atendente anexa documento corrigido.
5. POST /v1/encaminhamentos/:id/resolve-pendencia
   Body: nota + anexo[] + tipoAnexo[]
   ← status volta para AGUARDANDO_REGULACAO
   ← notificação push para o paciente
6. Regulação decide de novo.
```

### F3. Resposta SUS chegou

```
1. Regulador anexa PDF oficial via /sms/respostas (Face 2).
2. Atendente da UBS vê em /ubs/respostas-sms.
3. Atendente entrega presencialmente ou orienta paciente a baixar pelo app.
```

### F4. Manutenção do PEC

```
/ubs/pacientes/[id]
  → Aba Alergias       → POST/DELETE
  → Aba Crônicas       → POST/PATCH/DELETE
  → Aba Medicamentos   → POST/PATCH/DELETE
  → Aba Atendimentos   → POST/DELETE
  → Aba Exames         → POST/DELETE
  → Aba Vacinações     → POST/DELETE
  → Aba TFD            → POST/PATCH/DELETE (histórico no prontuário)
  → Histórico familiar → PUT (array completo)

Toda mutação gera linha em paciente_prontuario_audit (CFM 20 anos).
```

## Endpoints consumidos

| Método | Rota | Detalhes |
|---|---|---|
| GET | `/v1/auth/me` | Header / sidebar |
| GET | `/v1/me/profile` | Página /ubs/perfil |
| GET | `/v1/dashboard/metrics` | Página /ubs/dashboard |
| POST | `/v1/encaminhamentos/extract-pdf` | Wizard etapa 2 |
| POST | `/v1/encaminhamentos` | Wizard etapa 4 |
| GET | `/v1/encaminhamentos` | Lista /ubs/encaminhamento |
| GET | `/v1/encaminhamentos/:id` | Detalhe |
| PATCH | `/v1/encaminhamentos/:id` | Edição (até AGUARDANDO_REGULACAO) |
| POST | `/v1/encaminhamentos/:id/resolve-pendencia` | Resolução pendência |
| GET | `/v1/pacientes` | Lista PEC |
| GET | `/v1/pacientes/por-cpf/:cpf` | Lookup durante wizard |
| GET | `/v1/pacientes/:id` | Prontuário |
| PATCH | `/v1/pacientes/:id` | Edição PEC |
| POST/PATCH/DELETE | `/v1/pacientes/:pid/<subdoc>/...` | Sub-documentos |
| GET | `/v1/relatorios` | Página de relatórios |
| POST | `/v1/relatorios` | Solicita |
| GET | `/v1/relatorios/:id/download` | Baixar |

## Telas — guidelines

### `/ubs/dashboard`

- 4 KPIs principais: encaminhamentos no mês, taxa de aprovação, pendências
  ativas, pacientes únicos atendidos.
- Lista de pendências aberta (ação rápida → /ubs/encaminhamento/[id]).
- Próximos a vencer (encaminhamentos `URGENTE` sem decisão).
- Layout 12-col Tailwind. Densidade alta — `text-xs` no corpo.

### `/ubs/novo-encaminhamento`

- 4 etapas:
  1. Upload PDF (drag-drop, max 10 MB).
  2. Loading do OCR (média 3-4 s).
  3. Form pré-preenchido (campos editáveis, validação Zod local).
  4. Revisão + anexos opcionais + submit.
- Toda etapa salva estado em URL search params para permitir refresh / back.
- Wizard guarda rascunho em `localStorage` por 24h (não persiste na API até consolidar).

### `/ubs/pacientes/[id]`

- Layout vertical com abas top: Dados pessoais · Alergias · Crônicas · Medicamentos · Atendimentos · Exames · Vacinações · TFD · Encaminhamentos · Histórico familiar.
- Cada aba lazy-loaded — só busca ao trocar.
- Modais focados para add/edit; deleção sempre com confirmação.
- Tag de status do paciente (atendido recentemente, sem atendimento 90d, etc.).

## Regras de negócio

### Consolidar encaminhamento

- CPF normalizado para 11 dígitos antes de persistir.
- Se CPF não existir em `pacientes`, criar Paciente com dados do form.
- Se CPF não existir em `paciente_contas`, criar PacienteConta auto:
  - senha = CPF dígitos
  - `senhaProvisoria = true`
  - `ativo = true`
- Gera `protocolo` via `SequencialProtocolo`.
- Comprime PDF (Ghostscript → fallback pdf-lib) antes do upload S3.
- Submete arquivos para ClamAV (worker assíncrono — `scanStatus: PENDENTE → LIMPO|INFECTADO`).
- Cria `EventoTimeline` com tipo `CRIADO` + `ENVIADO_REGULACAO`.
- Outbox: notificação push + email + audit.

### Editar encaminhamento

- Antes de `ENVIADO_REGULACAO`: ATENDENTE_UBS/COORDENADOR_UBS livre.
- Após: somente ADMIN/DEV (precisa justificar via `motivo`).

### Resolver pendência

- Só funciona com status `PENDENCIA_DOCUMENTO`. Caso contrário, 409 `ENCAMINHAMENTO_NAO_EM_PENDENCIA`.
- Exige `nota` (>= 10 chars) + pelo menos 1 anexo.
- Volta a status `AGUARDANDO_REGULACAO`.
- EventoTimeline tipo `DOCUMENTO_ANEXADO` + `EDITADO`.

### Delete (soft)

- Só DEV/ADM. Exige `motivo >= 10 chars`.
- `deletadoEm` setado.
- Listagens passam a filtrar automaticamente.

## Validações importantes

| Campo | Regra |
|---|---|
| CPF | 11 dígitos numéricos (após normalização) |
| Telefone | DDD + 8 ou 9 dígitos |
| Data | parse tolerante (DD/MM/YYYY ou ISO) |
| CID-10 | regex `^[A-Z]\d{2}(\.\d{1,2})?$` |
| Prioridade | enum (ELETIVA/PRIORITARIA/URGENTE/EMERGENCIA) |
| Especialidade | string livre (lista sugestiva no front) |
| MIME do PDF | `application/pdf` apenas |

## RBAC — UI

Esconder no UI o que o backend já proíbe:

| Elemento | Para quem |
|---|---|
| Botão "Excluir encaminhamento" | ADM/DEV apenas |
| Aba "Auditoria" | ADM/DEV apenas |
| Dashboard agregada da UBS | COORD/ADM/DEV (atendente vê só sua produção) |
| "Resolver pendência" | só quando status = PENDENCIA_DOCUMENTO |
| "Editar" | enquanto status != APROVADO/REJEITADO |

## Métricas que importam para a UBS

- **Encaminhamentos consolidados / mês** (produção total).
- **Tempo médio de consolidação** (upload PDF → submit).
- **Taxa de pendência registrada pela Regulação** (qualidade).
- **Tempo médio de resolução de pendência** (responsividade).
- **Pacientes únicos atendidos** (alcance).

## Erros mais comuns na Face 1

| Code | Quando | UX no front |
|---|---|---|
| `ARQUIVO_INVALIDO` | PDF corrompido / não-pdf | Toast vermelho + dica |
| `ARQUIVO_MUITO_GRANDE` | > 10 MB | Toast com link para comprimir |
| `MIME_NAO_SUPORTADO` | Tipo errado | Toast |
| `DADOS_OBRIGATORIOS_AUSENTES` | Campo no form | Marcar campo + mensagem inline |
| `ENCAMINHAMENTO_NAO_EM_PENDENCIA` | Tentativa de resolver depois de aprovado | Toast + reload |
| `PACIENTE_NAO_ENCONTRADO` | Lookup por CPF que não existe | Sugere criar novo |
| `TOKEN_EXPIRADO` | Sessão velha | Redirect para login + toast |
