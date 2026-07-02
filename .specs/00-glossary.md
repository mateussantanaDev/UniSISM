# 00 · Glossário e convenções

Glossário denso de **siglas, termos de domínio e convenções técnicas** usadas no
produto. Quando termos de saúde pública brasileira aparecem nos contratos
(`SUS`, `UBS`, `PEC`, `TFD`, `CID-10`, `CNES`…), são oficiais e não devem ser
traduzidos. Quando termos de negócio (`Prefeitura`, `Atendente`) aparecem,
são abstrações genéricas que cabem em qualquer tenant.

---

## Siglas de saúde pública brasileira

| Sigla | Significado | Onde aparece |
|---|---|---|
| **SUS** | Sistema Único de Saúde | Marca, "resposta SUS" (anexo oficial), tipo de notificação |
| **SMS** | Secretaria Municipal de Saúde | Face 2 — Regulação SMS |
| **UBS** | Unidade Básica de Saúde | Face 1; entidade `Ubs` no schema |
| **PEC** | Prontuário Eletrônico do Cidadão | Sub-documentos clínicos do paciente |
| **TFD** | Tratamento Fora do Domicílio | Face 4 — gestão de viagens custeadas pelo município |
| **CID-10** | Classificação Internacional de Doenças, 10ª revisão | Campo `cid10` em condicao_cronica, atendimento |
| **CNES** | Cadastro Nacional de Estabelecimentos de Saúde | Campo `cnes` em `Ubs` |
| **CPF** | Cadastro de Pessoas Físicas | Identificador único de paciente |
| **CNPJ** | Cadastro Nacional da Pessoa Jurídica | Campo `cnpj` em `Prefeitura` |
| **CFM** | Conselho Federal de Medicina | Res. 1.821/2007 — base legal do audit de prontuário |
| **CRM / COREN / CRO** | Conselhos profissionais (médico, enfermagem, odontologia) | Campo `registroProfissional` em atendimento |
| **TCM** | Tribunal de Contas dos Municípios | Auditoria externa de prestação de contas TFD |
| **TJ** | Tribunal de Justiça | Idem TCM |
| **ICP-Brasil** | Infraestrutura de Chaves Públicas Brasileira | Assinatura digital opcional do ZIP TJ |
| **LGPD** | Lei Geral de Proteção de Dados | Lei 13.709/2018 |

## Atores / Roles

| Role (enum) | Significado | Escopo de leitura |
|---|---|---|
| `DESENVOLVEDOR` | Equipe técnica do produto / SaaS | GLOBAL (todos os tenants) |
| `ADMIN` | Administrador da prefeitura contratante | sua prefeitura |
| `REGULADOR_SMS` | Servidor da SMS que aprova/nega encaminhamentos | sua prefeitura |
| `GESTOR_TFD` | Servidor responsável pela gestão de TFD | sua prefeitura |
| `ATENDENTE_TFD` | Operador de terminal rodoviário | sua prefeitura (subset) |
| `COORDENADOR_UBS` | Coordenador de uma UBS | sua UBS |
| `ATENDENTE_UBS` | Atendente de regulação de uma UBS | sua UBS |
| `MOTORISTA_TFD` | Motorista da frota TFD | suas viagens |

## Entidades de negócio (white-label)

| Entidade | Generalização |
|---|---|
| **Prefeitura** | Tenant — entidade contratante (município, fundação, consórcio, secretaria estadual…) |
| **Ubs** | Unidade operacional do tenant (UBS, USF, policlínica, centro de saúde) |
| **Atendente** | Usuário do sistema (qualquer role exceto Paciente) |
| **PacienteConta** | Conta do app do cidadão |
| **Paciente** | Prontuário (PEC) do cidadão atendido |
| **Encaminhamento** | Solicitação de procedimento especializado |
| **SolicitacaoTFD** | Pedido de viagem custeada |
| **ViagemFrota** | Programação de transporte (veículo + motorista + passageiros) |

> Embora o nome **Prefeitura** apareça no schema, na prática representa
> qualquer tenant — secretaria, fundação, consórcio, etc. Em UI white-label,
> esse rótulo é substituível por copy parametrizada.

## Convenções técnicas

### Nomes

- **Domínio em pt-BR** (entidades, enums, campos, mensagens) — convenção deliberada, pt-BR é a língua do SUS.
- **Códigos de erro em SCREAMING_SNAKE_CASE inglês** (`USUARIO_INATIVO`, `TOKEN_EXPIRADO`).
- **Mensagens de erro em pt-BR** (o `message` do error envelope).
- **TypeScript / Dart**: camelCase para variáveis, PascalCase para tipos, kebab-case para arquivos.

### IDs

- **`id`**: UUIDv4 em todas as entidades.
- **`protocolo`**: human-readable, formato fixo:
  - `UBS-AAAA-NNNNNN` — encaminhamentos
  - `TFD-AAAA-NNNNNN` — solicitações de TFD
  - `ABT-AAAA-NNNNNN` — abastecimentos
  - `AJC-AAAA-NNNNNN` — ajudas de custo
- Geração centralizada em `SequencialProtocolo` (Postgres counter) — atômico, sem gap por concorrência.

### Datas e tempo

- **ISO 8601 UTC** nos contratos HTTP — `2026-04-22T14:32:18.000Z`.
- **`YYYY-MM-DD`** para datas puras (`dataNascimento`).
- Parse tolerante a `DD/MM/YYYY` em payloads (`src/shared/dates.ts`) — útil quando atendente cola valor formatado.
- Timezones: backend sempre UTC; frontend renderiza no timezone do navegador.

### Money

- Valores monetários em **`Float` (Postgres `double precision`)** em campos `*BRL`. Cents não usado — não há multi-moeda.
- Apresentação: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

### Endpoints e versionamento

- Prefixo **`/v1`** em toda rota HTTP.
- Versão atual evolui em breaking changes via `/v2` (não há ainda).
- `CHANGELOG.md` por release de backend.

### Auth

| Face | Esquema | TTL |
|---|---|---|
| Face 1 / 2 / 4 (Atendente) | JWT HS256 | access 30 min · refresh 7 dias (roadmap rotação automática) |
| Face 3 (Paciente) | Token opaco Base64URL | access 30 min · refresh 30 dias (rotativo, v0.18.0+) |
| Face 4 motorista (mobile) | JWT HS256 | 30 dias |

### Storage de arquivos

- S3-compatible. Padrão de chave: `tenant/<prefeituraId>/<modulo>/<entidadeId>/<uuid>.<ext>`.
- Antes de servir download: checar `scanStatus = LIMPO` (ClamAV).
- TTL de URL pré-assinada: 5 min.

### Soft delete

- Entidades com `deletadoEm: DateTime?`: `Prefeitura`, `Ubs`, `Paciente`, `Encaminhamento`.
- Listagens filtram automaticamente.
- Audit nunca é deletado (compliance).

### Pagination

- Padrão **cursor-based** com `?limit=NN&cursor=<id>` em listagens grandes (encaminhamentos, audit).
- Offset (`?page=N`) só em listagens pequenas (UBS, usuários).
- Sempre retornar `total` quando viável.

### Multipart vs JSON

- JSON em CRUD padrão.
- `multipart/form-data` quando há upload — `extract-pdf`, `encaminhamentos` (consolidar), `anexos`, `resposta-sus`, `pagar ajuda de custo` (comprovante).

---

## Convenções de placeholders na documentação

Quando esta especificação se referir a dado de cliente final, use placeholders:

| Placeholder | Significado |
|---|---|
| `<tenantId>` | UUID da Prefeitura (entidade contratante) |
| `<dominio-cliente>` | Domínio configurado pelo cliente (ex.: `api.cliente.com.br`) |
| `<municipio>` | Nome do município (campo `Prefeitura.municipio`) |
| `<UF>` | Sigla do estado (campo `Prefeitura.uf`) |
| `<nome-usuario>` | Nome de pessoa física (atendente, paciente) |
| `<email-institucional>` | Email de servidor (formato livre, ex.: `<usuario>@<dominio-cliente>`) |
| `<matricula>` | Matrícula do atendente, gerada pelo sistema |
| `<senha-forte>` | Senha real do usuário, nunca exibida em log/doc |

**Nunca usar dado real** de cliente, servidor, paciente ou município em exemplos.
