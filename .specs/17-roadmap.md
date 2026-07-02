# 17 · Roadmap

> Estado atual + frentes em andamento + backlog priorizado. **Fonte de verdade
> versão-a-versão**: `backend/docs/CHANGELOG.md` (1500+ linhas).

---

## Versão atual

Conforme `backend/docs/CHANGELOG.md`, a versão mais recente publicada é
**v0.18.0** (refresh token rotativo para Face 3 — app paciente).

`package.json` versão segue em `0.1.0` (não bumpada manualmente). Recomendação:
alinhar versão semver com `CHANGELOG.md` no próximo release.

## Linha do tempo (resumo)

| Versão | Foco |
|---|---|
| 0.1 → 0.4 | MVP Face 1 (UBS): auth, encaminhamentos, OCR, PEC básico |
| 0.5 | Face 2 (Regulação SMS): file-manager + decisões |
| 0.6 | Face 3 (App Paciente): auto-criação de conta + notificações |
| 0.7 | Relatórios LGPD-first (PDF/CSV/XLSX + audit retenção 5 anos) |
| 0.8 | Prontuário CRUD completo (sub-documentos + audit CFM 20 anos) |
| 0.9–0.13 | Face 4 TFD: frota, motoristas, viagens, abastecimento, saldo |
| 0.14 | App motorista (`UNISISM-motorista`) com JWT 30d + sync offline |
| 0.15 | Hash chain SHA-256 do TFD + exportação TJ |
| 0.16 | Hardening de produção: Caddy + Tempo + Prometheus + Grafana |
| 0.17 | TFD integrado Face 3 ↔ Face 4 + smoke test E2E |
| 0.17.1 | Patches adversariais (race condition em aprovação concorrente, assento duplicado) |
| **0.18.0** | **Refresh token rotativo paciente — TTL 30 dias + reuse detection** |

## Frentes em andamento (snapshot)

Mudanças não-commitadas mencionadas no `CLAUDE.md` raiz indicam iteração de
**production hardening** finalizando:

- `app.ts`, `container.ts`, `server.ts`, `env.ts`
- `email/` (novo módulo de email com providers múltiplos)
- `tracing.ts` (OTel SDK)
- `deploy/` (Caddy, Tempo, Prometheus)
- `docker-compose.prod.yml`
- `docs/DEPLOY_PRODUCAO.md`
- `scripts/setup.sh`

## Próximas frentes conhecidas (curto prazo)

### Alta prioridade

1. **Bump de `package.json`** para alinhar com `CHANGELOG.md` (v0.18.0+).
2. **Rotação automática de refresh** para Face 1/2/4 (atendente) — atualmente só Face 3 tem.
3. **Integração FCM completa** Face 3 (mobile) — pipeline outbox → FCM com retry.
4. **Magic byte check** em uploads (reforço além de MIME).
5. **Endpoint `/v1/tenant/config`** (público) para resolver branding por hostname.
6. **Bumpar `package.json` versão**.

### Média prioridade

7. **Wizard self-service** `/v1/onboarding/tenant` (cria tenant + ADMIN inicial).
8. **2FA / WebAuthn** para `DESENVOLVEDOR` e `ADMIN`.
9. **CSP nonce** para scripts inline.
10. **Vault** (HashiCorp / AWS Secrets Manager) para secrets.
11. **Particionamento** de `paciente_prontuario_audit` e `tfd_audit_log` por `prefeituraId` (preparar para >50 tenants).
12. **Export por tenant** (LGPD portabilidade) — endpoint `/v1/admin/prefeituras/:id/export`.
13. **Healthcheck deep** com check de dependências (Redis, MinIO, ClamAV).
14. **Rate limit per-tenant** (não só per-IP / per-user).
15. **Banner SMS UI** completa em `/sms/rede/banners` (algum esqueleto já existe).

### Baixa prioridade / nice-to-have

16. **SSO OIDC** (Keycloak / Auth0) por tenant — útil para SMS grandes.
17. **App Flutter** com config remota (sem build flavor por cliente).
18. **CDN edge** para frontend (Cloudflare Pages).
19. **Dashboards Grafana** prontos por categoria (overview, encaminhamentos, TFD).
20. **Marketplace de relatórios** — admin pode criar relatório custom via query builder.
21. **Webhooks de eventos** para integração com sistemas terceiros (Tasy, eSUS, etc.).
22. **Migração de estado em sub-documento** (versionar mudanças no schema do `payload` do audit).

## Dívidas técnicas conhecidas

- **`package.json` versão desatualizada** — corrigir nas próximas releases.
- **Frontend `src/lib/api/`** é cópia versionada — automatizar sync via script.
- **Apps Flutter** ainda têm specs legadas (`UNISISM-Paciente/BACKEND_API_PACIENTE.md`) que descrevem endpoints inexistentes. Migrar para `backend/docs/PACIENTE_APP_API.md` como fonte única.
- **Cron jobs operacionais** (limpeza de sessões expiradas, scan ClamAV bulk) hoje dependem de cron externo — empacotar como `npm run cron:*`.
- **Testes E2E** existem como `scripts/smoke-test-*.ts` — promover para suite Jest/Vitest com setup automatizado.
- **Documentação para o cliente final** (manual do servidor / atendente) não existe — produto técnico só.
- **i18n** ainda não implementada — pt-BR hard-coded. Quando virar, abre para outros mercados (não-SUS).

## Limites atuais

- Suporta dezenas de tenants (até ~50 razoavelmente).
- Sem rotação automática de `JWT_SECRET` (rotação manual derruba todas as sessões).
- Sem retry automático de OCR (falha visível ao usuário).
- Sem multi-região (instância única).
- Sem suporte iOS Push (FCM funciona, mas não tem APNs separado).

## KPIs do produto (sugeridos para acompanhar)

| KPI | Como medir |
|---|---|
| Tenants ativos | `SELECT count(*) FROM prefeituras WHERE ativa = true AND deletadoEm IS NULL` |
| Usuários ativos / mês | `SELECT DISTINCT atendente_id FROM sessoes WHERE criada_em >= now - 30d` |
| Encaminhamentos consolidados / mês | métrica Prometheus `encaminhamentos_consolidados_total` |
| Tempo médio consolidação → decisão | derivado de `timeline` |
| Taxa de aprovação em 1ª tentativa | calculado em `/v1/dashboard/metrics` |
| Tempo médio de scan ClamAV | métrica histogram |
| Disponibilidade backend | uptime monitor externo + Prometheus |
| Integridade hash chain TFD | cron `/tfd/auditoria/verificar` |
| % de encaminhamentos com resposta SUS entregue | query SQL |
| Custo por km TFD | `sum(abastecimentos)/sum(km_rodados)` |
| Taxa de faltas TFD | `sum(presenca != PRESENTE)/sum(presenca)` |

## Quando dar v1.0?

Critérios sugeridos para release marketable v1.0:

- [ ] Production hardening finalizado (Caddy + observabilidade + SMTP real)
- [ ] Refresh rotativo em todas as Faces (não só Face 3)
- [ ] Endpoint `/v1/tenant/config` publicado
- [ ] Wizard self-service de onboarding
- [ ] FCM integrado fim-a-fim
- [ ] Apps Flutter com config dinâmica (sem build por cliente)
- [ ] Dashboards Grafana prontos
- [ ] Manual do servidor (PDF / wiki)
- [ ] 2FA opcional para roles privilegiados
- [ ] LGPD export por tenant
- [ ] Pelo menos 3 tenants em produção sem incidente por 60 dias
- [ ] Suite E2E automatizada em CI
- [ ] Documentação para revendedor (parceria)

## Como contribuir

1. Leia `.claude/CLAUDE.md` (raiz do monorepo) — instruções para o assistente.
2. Leia `.specs/` (esta pasta) — visão do produto e arquitetura.
3. Para mudança no contrato: atualize os 3 (`backend/docs/API.md` + `types.ts` + `api-client.ts`) + `CHANGELOG.md`.
4. Para mudança no banco: Prisma migration + `npm run prisma:generate`.
5. Para mudança que toca audit: leia `12-compliance.md` e siga checklist.
6. Para mudança em UI: leia `11-design-system.md`.
7. **Nunca** introduza nome de cliente real em código/seed/copy/asset.
