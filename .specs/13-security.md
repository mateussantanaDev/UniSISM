# 13 · Segurança

> Cobertura de superfícies de ataque, controles de mitigação e padrões de
> defesa em camadas.

---

## Modelo de ameaças

Atacantes considerados:

1. **Externo anônimo** — bot de internet, scanner de vulnerabilidades.
2. **Externo direcionado** — quer dados clínicos ou financeiros do tenant.
3. **Cidadão malicioso** — paciente legítimo que tenta acessar dados de outros.
4. **Servidor interno hostil** — atendente que tenta exfiltrar dados.
5. **Insider técnico** — quem opera o servidor, vê o banco diretamente.

Ativos protegidos:

| Ativo | Por quê |
|---|---|
| Prontuário do paciente | LGPD + CFM + responsabilidade civil |
| Trilha de audit TFD | Prestação de contas judicial |
| Credenciais de servidores | Acesso ao SUS municipal |
| Dados de SaldoVeiculo / AjudaCusto | Fraude financeira |
| Sessões ativas | Sequestro de identidade |

---

## Autenticação

### Senhas

- Hash **bcrypt cost 12** (`bcryptjs`).
- Validador `src/shared/senhaForte.ts`: ≥ 8 chars + letra + número + blocklist.
- **Não armazena plaintext em nenhum momento.**
- Senha provisória expira em 7 dias.

### Login (Face 1/2/4)

- `POST /auth/login` aceita `matricula` OU `email` + `senha`.
- Verifica `ativo = true` e `bloqueadoAte < now`.
- 5 falhas em 15 min → `bloqueadoAte = now + 30min` → 403 `USUARIO_BLOQUEADO`.
- Login bem-sucedido → cria `Sessao` + `RefreshToken` + JWT.
- Audit em `tentativas_login` (sucesso e falha).
- Rate limit: 10/min por IP + 5/min por login.

### JWT

- Algoritmo: **HS256** (não RS256 — não há rotação de chave hoje).
- `JWT_SECRET` ≥ 32 chars — fail-fast verifica.
- `JWT_REFRESH_SECRET` ≥ 32 chars, **diferente** de `JWT_SECRET` — fail-fast.
- Access TTL: 30 min.
- Refresh TTL: 7 dias (Face 1/2/4) · 30 dias (motorista mobile) · 30 dias rotativo (paciente).
- Refresh hash armazenado (SHA-256) — plaintext nunca persiste.

### Reset de senha

- `POST /auth/forgot-password` sempre 200 (anti-enumeration).
- Código 6 dígitos numéricos, TTL 10 min.
- Código hash bcrypt em `password_reset_codes`.
- Máx. 5 tentativas por código antes de invalidar.
- `POST /auth/verify-code` → emite `resetToken` (TTL 5 min).
- `POST /auth/reset-password` consome o `resetToken` E **revoga todas as sessões da conta**.

### Face 3 (paciente) — token opaco

- Token = `crypto.randomBytes(32).toString('base64url')` (256 bits entropia).
- Hash SHA-256 em `sessoes_paciente`.
- Verificação cada request: lookup pelo hash.
- Revogação instantânea: `DELETE FROM sessoes_paciente WHERE ...`.

### Refresh rotativo paciente (v0.18.0+)

- `paciente_refresh_tokens` com `tokenHash`, `usadoEm`, `substituidoPorId`, `revogadoEm`, `motivoRevogacao`.
- Reuse detection: se backend recebe refresh já usado → revoga **toda a cadeia da conta** → 401 `REFRESH_REUSE_DETECTED`.

---

## Autorização

Cobertura completa em [`05-rbac-and-scope.md`](./05-rbac-and-scope.md). Resumo:

- 8 roles do enum `RoleAtendente` + paciente (sem role).
- 3 escopos: GLOBAL / PREFEITURA / UBS.
- `scopeWhere` injeta filtro de tenant em toda query.
- Mutação com `prefeituraId`/`ubsId` no payload → validação contra escopo do user (403).
- GET por ID fora de escopo → 404 (anti-enumeration).

---

## Proteção contra OWASP Top 10

| Vulnerabilidade | Mitigação |
|---|---|
| **A01 Broken Access Control** | RBAC + scopeWhere onipresente + middleware roleGuard + 404 em vez de 403 |
| **A02 Cryptographic Failures** | bcrypt cost 12 + JWT HS256 + secrets ≥ 32 chars + TLS em prod (HSTS) + hash de refresh |
| **A03 Injection (SQL/NoSQL/cmd)** | Prisma parametrizado + Zod em payloads + sem `exec(usuárioInput)` |
| **A04 Insecure Design** | Audit imutável + soft delete + rate limit + anti-enumeration |
| **A05 Security Misconfiguration** | Boot fail-fast + helmet + CSP + CORS strict + sem `*` em prod |
| **A06 Vulnerable Components** | `npm audit` em CI + Dependabot/Renovate (roadmap) |
| **A07 Authentication Failures** | Bloqueio após 5 falhas + tokens hash + sessões revogáveis + refresh rotativo |
| **A08 Software / Data Integrity** | Audit imutável + hash chain TFD + assinatura ICP-Brasil opcional |
| **A09 Logging / Monitoring** | pino estruturado + OTel + métricas Prometheus + `auditoria_logs` operacional |
| **A10 SSRF** | Sem fetch interno baseado em input do usuário |

---

## Headers HTTP (Helmet)

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://<s3-cdn>'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
```

## CORS

- `CORS_ORIGIN` aceita lista (vírgula) de origens.
- `CORS_ORIGIN=*` em production → **fail-fast bloqueia subir**.
- `http://` (exceto localhost) → **fail-fast bloqueia**.
- Headers permitidos: `Authorization, Content-Type, X-Request-Id`.

## Rate limiting

- Lib: `rate-limiter-flexible` com store Redis em prod.
- Keys por rota:
  - `auth:login:ip:<ip>` 10/min
  - `auth:login:user:<login>` 5/min
  - `auth:forgot:ip:<ip>` 5/min
  - `auth:verify-code:ip:<ip>` 10/min
  - `relatorios:user:<atendenteId>` 5/hora
  - `default:user:<atendenteId>` 600/min

## Upload de arquivos

- Tamanho: limite 10 MB (multer + Caddy `request_body { max_size 12MB }`).
- MIME allowlist (sem inferência por magic byte aceito — roadmap reforçar).
- ClamAV scan antes de servir download.
- URL pré-assinada com TTL 5 min.
- Path no S3: `tenant/<prefeituraId>/<modulo>/<entidade>/<uuid>.<ext>` — sem nome original.

## Antivírus (ClamAV)

- TCP em port 3310 (`docker-compose.yml`).
- Worker assíncrono consome anexos `PENDENTE`.
- `LIMPO` → libera download.
- `INFECTADO` → quarentena + audit alert.
- `FALHOU` → re-tenta 3x antes de marcar.
- `freshclam` auto-update em prod (cron).

## Storage S3

- Bucket privado (não público).
- Apenas URL pré-assinada (TTL 5 min).
- Criptografia at-rest (SSE-S3 ou SSE-KMS).
- Versionamento habilitado.
- Lifecycle: relatórios deletados após 7 dias.

## Banco de dados

- Postgres 16 com `pg_hba` restritivo.
- Backups diários (`pg_dump --format=custom`).
- Senha do app criptografada em env (vault em prod — roadmap).
- Triggers de imutabilidade verificados no boot.

## Auditoria operacional (`auditoria_logs`)

Eventos não-clínicos relevantes para segurança:

- LOGIN_SUCESSO / LOGIN_FALHA / LOGOUT
- USUARIO_CRIADO / DESATIVADO / RESET_SENHA_ADMIN
- PREFEITURA_CRIADA / UBS_CRIADA
- ENCAMINHAMENTO_EDITADO_POS_REGULACAO (ADM/DEV)
- BANNER_CRIADO / DESATIVADO
- TENTATIVA_FORA_DO_ESCOPO

Retenção: 2 anos (configurável).

## Secrets management

- Dev: `.env` (gitignored).
- Prod: `.env.prod` em arquivo restrito + idealmente vault (HashiCorp / AWS Secrets Manager — roadmap).
- **Nunca commitar secrets**.
- Rotação de `JWT_SECRET`: documentada em runbook (todas as sessões invalidadas).
- Rotação de senha de banco: docker-compose env.

## Boot fail-fast

`src/shared/env.ts` recusa subir em prod se:

- Secrets fracos ou iguais
- `CORS_ORIGIN=*` ou `http://`
- SMTP sem credenciais (e `EMAIL_PROVIDER=smtp`)
- Triggers de imutabilidade ausentes
- Cert ICP-Brasil ausente (se `TFD_SIGN_REQUIRED=true`)

## Roadmap de segurança

- [ ] Rotação automática de JWT_SECRET (com graceful período de coexistência).
- [ ] WebAuthn / 2FA para roles privilegiados (DEV, ADMIN).
- [ ] Vault para secrets (HashiCorp ou AWS Secrets Manager).
- [ ] CSP report-only → enforcing após observação.
- [ ] CSP nonce para inline scripts.
- [ ] Magic byte check em uploads.
- [ ] Brute-force lockout por IP (não só por login).
- [ ] Rotação automática refresh para Face 1/2/4 (atual: só Face 3 v0.18.0+).
- [ ] Auditoria de admin actions com confirmação dupla.

## Padrões anti-vazamento

- **Nunca logar payload com dado clínico cru** — sempre mascarar CPF, nome, CID.
- **Nunca incluir senha em response** (Prisma `select` explícito sem `senhaHash`).
- **Nunca retornar 403 com info útil** ("usuário X existe") — preferir 404.
- **Nunca persistir refresh token em plaintext** — sempre SHA-256.
- **Nunca aceitar `Authorization` em GET com query** — sempre header.
- **Nunca expor `/metrics` ou Grafana publicamente** — firewall + reverse proxy autenticado.
