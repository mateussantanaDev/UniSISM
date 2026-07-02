# UNISISM — Especificação técnica e funcional

> **Sistema integrado de regulação ambulatorial + Prontuário Eletrônico do Cidadão (PEC) + app do paciente + gestão de TFD** (Tratamento Fora do Domicílio) para Secretarias Municipais de Saúde brasileiras.
>
> **White-label** — pode ser implantado para qualquer município, secretaria, fundação de saúde ou consórcio intermunicipal sem alteração de código. Toda customização (branding, marca, copy, domínio) vive em **configuração por tenant**.

---

## Índice da especificação

| Capítulo | Arquivo | Tema |
|---|---|---|
| 00 | [`00-glossary.md`](./00-glossary.md) | Glossário e convenções de nomenclatura |
| 01 | [`01-vision-and-personas.md`](./01-vision-and-personas.md) | Visão de produto, problema, personas e proposta de valor |
| 02 | [`02-architecture.md`](./02-architecture.md) | Arquitetura geral (monorepo + Clean Architecture + multi-tenant) |
| 03 | [`03-monorepo-layout.md`](./03-monorepo-layout.md) | Layout do monorepo (backend / frontend / apps Flutter) |
| 04 | [`04-domain-model.md`](./04-domain-model.md) | Modelo de domínio (entidades, enums, agregados) |
| 05 | [`05-rbac-and-scope.md`](./05-rbac-and-scope.md) | RBAC, multi-tenant, isolamento por escopo |
| 06 | [`06-api-contract.md`](./06-api-contract.md) | Contrato HTTP (resumo + ponteiros para `API.md`) |
| 07 | [`07-face1-ubs.md`](./07-face1-ubs.md) | Face 1 — Atendimento UBS (Unidade Básica de Saúde) |
| 08 | [`08-face2-regulacao.md`](./08-face2-regulacao.md) | Face 2 — Regulação SMS (Secretaria Municipal de Saúde) |
| 09 | [`09-face3-paciente-app.md`](./09-face3-paciente-app.md) | Face 3 — App do Paciente (cidadão) |
| 10 | [`10-face4-tfd.md`](./10-face4-tfd.md) | Face 4 — Tratamento Fora do Domicílio (gestão + terminal + motorista) |
| 11 | [`11-design-system.md`](./11-design-system.md) | Design System B2G brutalist (tokens + componentes) |
| 12 | [`12-compliance.md`](./12-compliance.md) | Conformidade LGPD + CFM + TFD (auditoria TJ/TCM) |
| 13 | [`13-security.md`](./13-security.md) | Segurança (auth, scan AV, hash chain, ICP-Brasil, headers) |
| 14 | [`14-observability.md`](./14-observability.md) | Logs, métricas, traces, SLOs |
| 15 | [`15-deploy.md`](./15-deploy.md) | Deploy (Docker, Caddy, observabilidade, env vars) |
| 16 | [`16-multitenancy-whitelabel.md`](./16-multitenancy-whitelabel.md) | Multi-tenancy e white-label (revenda) |
| 17 | [`17-roadmap.md`](./17-roadmap.md) | Roadmap e estado atual |
| 18 | [`18-checklist-revenda.md`](./18-checklist-revenda.md) | Checklist de implantação para novo cliente |

---

## Quickstart

### Para entender o produto

1. Leia [`01-vision-and-personas.md`](./01-vision-and-personas.md).
2. Veja as 4 Faces em [`07`](./07-face1-ubs.md), [`08`](./08-face2-regulacao.md), [`09`](./09-face3-paciente-app.md), [`10`](./10-face4-tfd.md).
3. Veja como revender em [`16-multitenancy-whitelabel.md`](./16-multitenancy-whitelabel.md).

### Para implantar para um cliente

1. Leia [`18-checklist-revenda.md`](./18-checklist-revenda.md) — passo a passo de provisionamento.
2. Configure ambiente seguindo [`15-deploy.md`](./15-deploy.md).
3. Provisione o tenant via `/v1/admin/*` (ver [`05-rbac-and-scope.md`](./05-rbac-and-scope.md)).

### Para desenvolver

1. Leia [`02-architecture.md`](./02-architecture.md) e [`03-monorepo-layout.md`](./03-monorepo-layout.md).
2. Use a doc autoritativa do contrato HTTP em `backend/docs/API.md`.
3. Convenções em [`00-glossary.md`](./00-glossary.md).

---

## Identidade do produto

| | |
|---|---|
| **Nome de código** | UNISISM |
| **Categoria** | SaaS / on-premise B2G (Business-to-Government) |
| **Domínio** | Saúde pública municipal — SUS |
| **Licenciamento** | Privado (revenda por implantação) |
| **Audiência** | Secretarias Municipais de Saúde, fundações, consórcios |
| **Língua** | pt-BR (interface, copy, docs) |
| **Faces** | 4 — UBS, Regulação SMS, App Paciente, TFD |

## Tecnologias

| Camada | Stack |
|---|---|
| Backend | Node.js 22 · TypeScript · Express 5 · Prisma 6 · PostgreSQL 16 |
| Frontend | SvelteKit 2 · Svelte 5 · Vite 8 · Tailwind CSS 4 |
| Apps mobile | Flutter 3.24+ · Dart 3.5+ |
| Storage | S3-compatible (MinIO em dev, AWS S3 / Backblaze B2 em prod) |
| Antivírus | ClamAV |
| Cache | Redis |
| Email | Nodemailer (SMTP) |
| Push | Firebase Cloud Messaging (FCM) |
| Observabilidade | pino (logs) + Prometheus (metrics) + OpenTelemetry → Tempo (traces) + Grafana |
| Proxy / TLS | Caddy (Let's Encrypt automático) |

## Conformidade legal

- **LGPD** (Lei 13.709/2018) — art. 37 (retenção mín. 5 anos de operações de tratamento)
- **CFM Res. 1.821/2007** — art. 8º (retenção mín. 20 anos de prontuário)
- **TFD** — trilha imutável para prestação de contas com Tribunal de Justiça / Tribunal de Contas dos Municípios. Hash chain SHA-256. Assinatura ICP-Brasil opcional.

Detalhes em [`12-compliance.md`](./12-compliance.md).
