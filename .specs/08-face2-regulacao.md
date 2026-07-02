# 08 · Face 2 — Regulação SMS

> Regulador da Secretaria Municipal de Saúde decide aprovação, pendência ou
> rejeição dos encaminhamentos enviados pelas UBSs daquele tenant. Quando o
> SUS Federal devolve agendamento, anexa o PDF oficial para o paciente baixar.

---

## Atores

- `REGULADOR_SMS` — operador principal.
- `ADMIN` — admin do tenant (vê + decide + auditoria + admin de rede).
- `DESENVOLVEDOR` — overrides técnicos.

## Rotas frontend

```
/sms                            layout principal
/sms/dashboard                  visão agregada do tenant
/sms/solicitacoes               file-manager (UBS → Ano → Mês → Dia)
/sms/encaminhamentos            lista flat (com filtros)
/sms/encaminhamento/[id]        detalhe + ações de decisão
/sms/pacientes                  PEC do tenant inteiro
/sms/respostas                  anexar resposta SUS (PDF oficial)
/sms/ingestoes                  fila de processamento (PDFs em batch — roadmap)
/sms/relatorios                 hub de relatórios LGPD-first
/sms/rede                       admin: prefeituras / UBSs / usuários (DEV/ADM)
/sms/rede/banners               banners do app paciente
/sms/auditoria                  log de operações
/sms/analytics                  KPIs avançados (DEV/ADM)
/sms/configuracoes              switches e parâmetros
/sms/configuracoes/integracoes
/sms/configuracoes/parametros
/sms/perfil                     perfil + segurança + atividade
```

## Fluxo macro

### F1. Decidir um encaminhamento

```
1. /sms/solicitacoes → árvore file-manager:
   ├── UBS Alfa
   │   ├── 2026
   │   │   ├── Janeiro (12)
   │   │   ├── Fevereiro (15)
   │   │   └── Março (8)
   │   └── ...
   └── UBS Beta
       └── ...
2. Clica no dia → lista flat de encaminhamentos.
3. Clica em um → /sms/encaminhamento/[id].
4. Painel mostra:
   ├── Cabeçalho (protocolo, paciente, prioridade, status)
   ├── Timeline (eventos cronológicos)
   ├── Dados clínicos (CID, especialidade, queixa, conduta)
   ├── Anexos (visualizador inline PDF + download)
   └── Painel de ação (lado direito):
       ├── [Aprovar]     com agendamentoPrevisto opcional
       ├── [Pendência]   observação obrigatória
       └── [Rejeitar]    motivo obrigatório
5. Ação dispara:
   ├── PATCH no encaminhamento
   ├── EventoTimeline gravado
   ├── Notificação push para paciente (via outbox)
   └── Email opcional para UBS de origem
```

### F2. Anexar Resposta SUS (PDF oficial)

```
1. /sms/respostas → lista encaminhamentos APROVADOS sem resposta SUS ainda.
2. Selecionar um → modal de upload.
3. POST /v1/encaminhamentos/:id/resposta-sus (multipart)
   Body: file (PDF) + observacao
   ← anexa Anexo tipo RESPOSTA_SUS
   ← cria EventoTimeline tipo RESPOSTA_SUS_RECEBIDA
   ← notifica paciente (push + email)
4. Paciente vê em /paciente-app/anexos/:id/download
```

### F3. Provisionar usuário (admin)

```
/sms/rede/usuarios → CRUD de Atendente
  ├── Form: role + ubsId (se UBS-scoped) + nome + email + cpf + matrícula
  ├── Senha provisória gerada e exibida UMA vez.
  └── Email com link de troca de senha (opcional, controle por env).
```

### F4. Provisionar UBS (admin)

```
/sms/rede/ubs → CRUD de Ubs
  ├── Form: nome + município + uf + CNES + endereço + latitude/longitude
  ├── Horários (JSON estruturado por dia)
  └── Telefone + WhatsApp + email institucional (mostrados no app paciente)
```

### F5. Provisionar Prefeitura (somente DEV)

```
/sms/rede/prefeituras → CRUD de Prefeitura
  ├── Só DESENVOLVEDOR vê.
  ├── Cria novo tenant; depois cria 1+ ADMINs daquele tenant.
  └── (essa é a entrada do white-label — todo cliente novo passa por aqui)
```

## Endpoints consumidos

| Método | Rota | Detalhes |
|---|---|---|
| GET | `/v1/encaminhamentos/arvore` | File-manager UBS → Ano → Mês → Dia |
| GET | `/v1/encaminhamentos` | Lista flat com filtros |
| GET | `/v1/encaminhamentos/:id` | Detalhe |
| POST | `/v1/encaminhamentos/:id/aprovar` | Aprovar (com agendamento opcional) |
| POST | `/v1/encaminhamentos/:id/registrar-pendencia` | Devolver para UBS |
| POST | `/v1/encaminhamentos/:id/rejeitar` | Rejeição terminal |
| POST | `/v1/encaminhamentos/:id/resposta-sus` | Upload PDF oficial |
| GET | `/v1/dashboard/metrics` | Dashboard SMS |
| GET | `/v1/pacientes` | PEC do tenant inteiro |
| GET | `/v1/admin/prefeituras` | Lista prefeituras |
| POST/PATCH/DELETE | `/v1/admin/prefeituras` | DEV-only |
| GET/POST/PATCH/DELETE | `/v1/admin/ubs` | CRUD UBS |
| GET/POST/PATCH/DELETE | `/v1/admin/usuarios` | CRUD usuários |
| POST | `/v1/admin/usuarios/:id/ativo` | Ativa/desativa |
| POST | `/v1/admin/usuarios/:id/reset-senha` | Reset admin |
| GET | `/v1/relatorios` / POST / GET download | Relatórios |
| GET | `/v1/sms/banners` etc. | Banners (DEV/ADM) |

## Telas — guidelines

### `/sms/solicitacoes` (file-manager)

- Árvore navegável estilo "Finder" — UBS expansíveis → ano → mês → dia.
- Cada folha mostra count (quantos pendentes / total).
- Quando expandir um dia, vira lista flat sortável.
- Filtros laterais: status, prioridade, especialidade, idade da fila.

### `/sms/encaminhamento/[id]`

- Layout 2-col: 70% conteúdo + 30% painel de ação.
- Visualizador inline de PDF (`<iframe>` ou `pdf.js`).
- Painel de ação tem botões grandes com `<kbd>` (A/P/R).
- Aprovar abre mini-form com `agendamentoPrevisto` opcional.
- Pendência abre textarea obrigatório (>= 10 chars).

### `/sms/dashboard`

- KPIs: fila atual, idade média, aprovação/dia, pendências abertas, % de pendências resolvidas no dia.
- Heatmap por UBS × prioridade.
- Top 5 especialidades por backlog.
- Toda métrica respeita `prefeituraId` do logado.

### `/sms/rede` (Admin)

- 3 sub-abas: Prefeituras (DEV only) · UBSs · Usuários.
- CRUD via modais ou sub-rotas.
- Tag visual de status (ativo/inativo).
- Reset de senha exibe valor gerado UMA vez (não persiste em log).

### `/sms/auditoria`

- Filtros: ação, recurso, atendente, data.
- Tabela densa.
- Detail row expansível com `payload` (jsonb pretty).
- Roles: ADMIN/DEV.

## Regras de negócio

### Aprovar

- Body opcional: `nota`, `agendamentoPrevisto`.
- Muda status para `APROVADO`.
- Cria timeline `APROVADO` (+ `AGENDADO` se houver agendamento).
- Notifica paciente.

### Registrar pendência

- Body obrigatório: `observacao >= 10 chars`.
- Muda status para `PENDENCIA_DOCUMENTO`.
- Timeline `PENDENCIA_REGISTRADA`.
- Notifica paciente + email para a UBS de origem.

### Rejeitar

- Body obrigatório: `motivo >= 10 chars`.
- Muda status para `REJEITADO`.
- Timeline `REJEITADO`.
- Notifica paciente.
- **Decisão terminal** — não pode voltar atrás.

### Resposta SUS

- Só funciona quando status = `APROVADO`.
- Anexo PDF obrigatório (validação MIME + size + scan AV).
- Cria timeline `RESPOSTA_SUS_RECEBIDA`.
- Notifica paciente (push + email com link de download).

## RBAC — UI

| Elemento | Para quem |
|---|---|
| Sub-aba "Prefeituras" | DESENVOLVEDOR apenas |
| Botão "Excluir UBS / Usuário" | DEV/ADM |
| Botão "Reset senha" | DEV/ADM |
| Resposta SUS | REG/DEV |
| Toda visão "/sms/*" | REG/ADM/DEV |

## Métricas que importam para a SMS

- **Fila atual** (encaminhamentos aguardando decisão).
- **Idade média da fila** (tempo desde envio até decisão).
- **Taxa de aprovação na primeira tentativa** (qualidade dos encaminhamentos UBS).
- **% de pendências resolvidas em 48h** (responsividade UBS).
- **Cobertura de resposta SUS** (% de aprovados com PDF oficial entregue).
