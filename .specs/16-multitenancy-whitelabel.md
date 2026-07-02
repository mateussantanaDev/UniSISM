# 16 · Multi-tenancy e White-label

> Como o produto suporta múltiplos clientes (revenda) sem alterar código.
> O modelo é **single-database, multi-tenant por `Prefeitura`**, com
> branding parametrizável por tenant.

---

## Modelo de tenancy

**Single-database, single-schema, isolamento lógico por coluna.**

- Cada tenant = uma linha em `Prefeitura`.
- Toda tabela escopada tem `prefeituraId` (direto ou via FK transitiva).
- `scopeWhere` injeta o filtro em toda query.
- Listagens cross-tenant só funcionam para `DESENVOLVEDOR` (`escopo = GLOBAL`).

### Por que não database-per-tenant?

| Razão | Detalhe |
|---|---|
| **Custo** | Database-per-tenant exigiria N Postgres / pool por cliente — operacional caro. |
| **Provisionamento** | Criar tenant novo = INSERT no banco + criar usuários, contra: criar database, rodar migrations, criar conexão. |
| **Manutenção** | Migrar 1 banco com 50 tabelas vs migrar N bancos. |
| **Compliance** | Audit imutável funciona em qualquer modelo. |
| **Escala** | Até dezenas de tenants em um banco, sem hot row. Acima disso, considerar particionamento por `prefeituraId`. |

### Trade-offs aceitos

- "Vizinho ruim" — query pesada de um tenant pode afetar p95 dos outros.
  Mitigação: `pg_stat_statements` por tenant, rate limit per-tenant, query timeout.
- Backup é all-or-nothing. Se cliente quiser "seu backup", precisa export via API.

### Quando virar database-per-tenant

- Cliente exige isolamento físico (raro em SUS).
- Volume de um tenant ultrapassa P95 do banco.
- Compliance regional (não aplicável a SUS no Brasil).

## Provisionamento de tenant

### Passo a passo

```
1. DESENVOLVEDOR autenticado faz:
   POST /v1/admin/prefeituras
   { nome, municipio, uf, cnpj }
   ← cria Prefeitura, retorna { id }

2. POST /v1/admin/usuarios
   { role: 'ADMIN', prefeituraId, nome, email, matricula, cpf }
   ← cria primeiro ADMIN do tenant
   ← senha provisória exibida UMA vez

3. ADMIN do tenant loga e a partir daí provisiona:
   - UBSs:                POST /v1/admin/ubs
   - Coordenadores/atendentes: POST /v1/admin/usuarios
   - REGULADOR_SMS:       POST /v1/admin/usuarios
   - GESTOR_TFD:          POST /v1/admin/usuarios

4. GESTOR_TFD provisiona:
   - Veículos:            POST /v1/tfd/veiculos
   - Motoristas:          POST /v1/tfd/motoristas (cria Atendente role MOT_TFD)
   - Saldo inicial:       POST /v1/tfd/saldo/ajustar (ADM)
```

### Tempo médio de provisionamento

- Tenant + 1 ADMIN: < 1 min via API.
- Tenant pronto para operar (UBSs + usuários + frota inicial): 30 min com UI.

### Roadmap: provisionamento self-service

Endpoint `/v1/onboarding/tenant` com:

- Wizard interativo
- Geração de seed mínimo personalizado
- Envio de credenciais por email seguro
- Configuração de branding pelo wizard

## Customização por tenant — onde mora o quê

| Item | Localização |
|---|---|
| Nome institucional ("Prefeitura de X") | `Prefeitura.nome` no banco |
| Sigla / abreviação | `Prefeitura.sigla` (campo opcional roadmap) |
| Logo do cabeçalho | `static/brand/<tenantId>/logo.svg` servido condicionalmente |
| Favicon | `static/brand/<tenantId>/favicon.ico` |
| Cor primária (ação) | CSS var `--brand-primary`, override por tenant |
| Cores secundárias | Mesma estratégia |
| Domínio próprio (white-label DNS) | Caddy reverse-proxy + DNS do cliente |
| Email sender / footer | `EmailTemplate` parametrizado por `prefeituraId` |
| Copy institucional | i18n por tenant em `frontend/src/lib/i18n/<tenantId>.json` |
| Termos de uso / política privacidade | Renderizada por tenant via API |
| Splash screen do app paciente | `static/brand/<tenantId>/splash.png` |
| Branding do app paciente / motorista | Build flavor por tenant ou config dinâmica |

## Tenant resolution no frontend

O frontend identifica o tenant por **hostname**:

```typescript
// src/lib/api/tenant.ts
export function resolveTenantFromHost(host: string): TenantConfig {
  // Ex: app.cliente-a.com.br → tenant "cliente-a"
  const match = host.match(/^app\.([^.]+)\./);
  if (match) return tenants[match[1]];
  return tenants.default;  // dev
}
```

Configuração de cada tenant carregada de `/v1/tenant/config` (público, sem auth):

```json
{
  "id": "<tenantId>",
  "nome": "<nome institucional>",
  "logoUrl": "/brand/<tenantId>/logo.svg",
  "corPrimaria": "#1a3a8a",
  "termosUrl": "https://...",
  "politicaPrivacidadeUrl": "https://...",
  "emailEncarregado": "<email DPO>",
  "telefoneEncarregado": "<telefone>"
}
```

## Tenant resolution no backend

Backend não resolve por hostname — autenticação via JWT (que tem `prefeituraId`)
ou via path `/v1/admin/prefeituras/:id`. Endpoint público `/v1/tenant/config`:

```
GET /v1/tenant/config
Host: app.cliente-a.com.br
→ { config do tenant }
```

Resolução por `Host` header. Caddy não modifica o header. Backend faz lookup
em tabela `Prefeitura` por `dominioApp` (campo opcional roadmap).

## Branding white-label — passos para um novo cliente

1. **Cliente fornece**: logo (SVG), cor primária (hex), favicon, splash mobile, termos legais (URL), email do DPO.

2. **Upload de assets** para `static/brand/<tenantId>/`.

3. **Configuração no banco** (campos opcionais — roadmap):
   - `Prefeitura.dominioApi` → "api.cliente.com.br"
   - `Prefeitura.dominioApp` → "app.cliente.com.br"
   - `Prefeitura.corPrimaria` → "#1a3a8a"
   - `Prefeitura.urlTermos` → "https://..."
   - `Prefeitura.urlPolitica` → "https://..."
   - `Prefeitura.emailDpo` → "dpo@..."
   - `Prefeitura.telefoneDpo` → "..."

4. **DNS** — cliente aponta `api.cliente.com.br` e `app.cliente.com.br` para o IP da nossa infraestrutura.

5. **Caddy** auto-emite TLS Let's Encrypt na primeira request.

6. **Email sender** — `Prefeitura.emailFrom` (config) + DKIM/SPF/DMARC do domínio do cliente.

7. **Apps mobile** — build flavor (Android/iOS) por cliente OU build genérico que resolve config remota no startup.

## Isolamento de operação

### Logs

- Cada log inclui `prefeituraId`.
- Grafana datasource permite filtrar por tenant.
- Alertas podem ser per-tenant (ex.: "p95 da Prefeitura X > 2s").

### Métricas

- Métricas custom carregam label `prefeituraId`.
- Dashboard "per-tenant" filtra por essa label.

### Backups

- Backup all-tenants é a unidade atômica.
- Roadmap: export por tenant via API (LGPD direito de portabilidade).

### Hash chain TFD

- Cadeia per-tenant (genesis por `prefeituraId`).
- Não há contaminação cruzada.
- Cada cliente pode verificar / exportar SUA cadeia.

## Limites operacionais

- Recomendado: < 50 tenants por instância (Postgres single-node).
- Acima disso: avaliar particionamento de tabelas grandes
  (`encaminhamento`, `paciente_prontuario_audit`, `tfd_audit_log`) por
  `prefeituraId`.
- Storage S3: bucket único, prefixos por tenant. Sem limite prático.

## Modelo comercial sugerido (revenda)

> **Esta seção é orientativa para revenda.** Não há lógica de billing no
> produto — é responsabilidade do parceiro/revendedor.

| Plano | Tamanho do tenant | Inclui |
|---|---|---|
| **Starter** | até 3 UBSs + sem TFD | Faces 1, 2, 3 + relatórios básicos |
| **Profissional** | até 10 UBSs + TFD básico | + Face 4 (sem hash chain assinada) |
| **Enterprise** | UBSs ilimitadas + TFD completo | + ICP-Brasil + SLA 99.9% + suporte L3 |
| **On-premise** | instância dedicada | Cliente hospeda; cobrança por licença |

## Roadmap white-label

- [ ] Endpoint `/v1/tenant/config` (público) com config dinâmica.
- [ ] Campos de branding em `Prefeitura` (cores, logos, domínios).
- [ ] CSS variable injection por tenant em build do front.
- [ ] App Flutter com config remota (sem rebuild por cliente).
- [ ] Wizard `/v1/onboarding/tenant` (self-service).
- [ ] Theme override pleno via CSS file por tenant.
- [ ] DPO contact endpoint LGPD.
- [ ] Whitelist de IP por tenant (acesso restrito a rede do município).
- [ ] SSO via OIDC por tenant (Keycloak / Auth0).

## Antipadrões para evitar em revenda

- ❌ **Hard-code de nome de cliente** em código, seed, copy, asset.
- ❌ **Branding em CSS file fixo** — usar CSS variables sobrescritíveis.
- ❌ **Domínio fixo no app Flutter** — sempre via env / build flavor.
- ❌ **Emails template com nome de cliente** — usar `{{tenantNome}}`.
- ❌ **Cross-tenant queries acidentais** — sempre `scopeWhere`.
- ❌ **Seed com dado real** de cliente — somente fictício.
- ❌ **Compartilhamento de bucket S3** sem prefixo por tenant.
- ❌ **Logs sem `prefeituraId`** — perde rastreabilidade.
