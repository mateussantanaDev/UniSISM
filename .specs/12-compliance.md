# 12 · Compliance — LGPD + CFM + TFD

O produto opera dentro de **três regimes legais brasileiros simultâneos**.
Nenhuma das garantias é "boas práticas opcionais" — são **requisitos legais**
que disparam responsabilidade civil/criminal se violadas.

---

## 1. LGPD (Lei 13.709/2018)

### 1.1 Artigo 37 — Registro de operações de tratamento

Tabela `relatorio_audit`:

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `tipo` | enum `TipoRelatorio` |
| `filtros` | jsonb (subset do payload original) |
| `atendenteId` | uuid → quem solicitou |
| `prefeituraId` | uuid → tenant |
| `ubsId` | uuid? → escopo opcional |
| `criadoEm` | timestamptz |
| `ip` / `userAgent` / `requestId` | string |

**Retenção mínima**: 5 anos.
**Modo**: append-only por trigger SQL — `UPDATE` e `DELETE` lançam exception.

### 1.2 Minimização (art. 6º, III)

- Cada `TipoRelatorio` tem **lista explícita** de colunas em `TipoRelatorioMeta` (`src/modules/relatorios/domain/`).
- Proibido `SELECT *` em fonte de relatório.
- Mascaramento de CPF em relatórios de gestão (visíveis em relatórios médicos).
- Email mascarado por padrão em logs.

### 1.3 Direito de revogação (art. 18)

- `POST /v1/paciente-app/auth/logout` revoga todas as sessões + refresh tokens.
- `POST /v1/admin/usuarios/:id/ativo` com `{ ativo: false }` desativa + revoga sessões.
- Soft delete + audit preservado.

### 1.4 Anti-enumeration

- Recurso fora do escopo → **404**, nunca 403.
- `POST /auth/forgot-password` sempre 200 (não confirma existência).
- Validação cega em listagens públicas.

### 1.5 DPO / Encarregado

- Tenant configura email do encarregado (DPO) em `Prefeitura.emailDpo` (campo opcional roadmap).
- Roadmap: endpoint público `/v1/lgpd/contato-encarregado` retorna o email para o cidadão.

### 1.6 Política de retenção

| Tipo de dado | Retenção |
|---|---|
| `relatorio_audit` | 5 anos (mín. legal) |
| `paciente_prontuario_audit` | 20 anos (mín. CFM) |
| `tfd_audit_log` | Permanente (TJ/TCM) |
| `auditoria_logs` (operacional) | 2 anos (configurável) |
| `tentativas_login` | 6 meses (limpeza por cron) |
| Sessões expiradas | 30 dias após expiração (limpeza por cron) |

---

## 2. CFM Res. 1.821/2007

### 2.1 Artigo 8º — Prontuário eletrônico

Tabela `paciente_prontuario_audit`:

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `pacienteId` | uuid → Paciente |
| `recurso` | string (`alergia` / `condicao_cronica` / `medicamento` / `atendimento` / `exame` / `vacina` / `viagem_tfd` / `historico_familiar`) |
| `recursoId` | uuid? |
| `acao` | string (`CREATE` / `UPDATE` / `DELETE`) |
| `payload` | jsonb (estado anterior + ação + estado novo) |
| `atendenteId` | uuid |
| `registroProfissional` | string (CRM / COREN / CRO) |
| `ip` / `userAgent` / `requestId` | string |
| `criadoEm` | timestamptz |

**Retenção mínima**: 20 anos após **último atendimento** do paciente.
**Modo**: append-only por trigger SQL.

### 2.2 Requisitos derivados

- Toda mutação em sub-documento do PEC gera linha de audit na **mesma transação Prisma** — atomicidade garantida.
- `registroProfissional` obrigatório quando aplicável (médico, enfermeiro, dentista). Capturado do `Atendente`.
- Soft delete de paciente **não apaga audit** — `deletadoEm` em `pacientes`, mas `paciente_prontuario_audit` permanece.

### 2.3 Reconstrução do prontuário em data específica

Para responder a auditoria CFM/MP/judicial:

```sql
-- Estado do prontuário em data X
SELECT * FROM paciente_prontuario_audit
WHERE paciente_id = $1 AND criado_em <= $2
ORDER BY criado_em ASC;
```

A trilha permite reconstruir cada estado intermediário. Roadmap: endpoint
`GET /v1/pacientes/:id/historico?em=YYYY-MM-DD` para entregar prontuário
naquela data.

---

## 3. TFD — Trilha imutável para TJ / TCM

### 3.1 Cadeia hash SHA-256

Tabela `tfd_audit_log`:

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `prefeituraId` | uuid (cadeia por tenant) |
| `evento` | string SCREAMING_SNAKE |
| `payload` | jsonb canonicalizado |
| `hashAnterior` | char(64) — `'0' * 64` no genesis |
| `hash` | char(64) — `SHA-256(canonical(payload) ‖ hashAnterior)` |
| `assinaturaIcpBrasil` | text? — opcional |
| `atendenteId` | uuid? |
| `ip` / `userAgent` | string? |
| `criadoEm` | timestamptz |

### 3.2 Canonicalização do payload

Antes do hash: JSON com chaves ordenadas alfabeticamente, sem whitespace,
escape padrão. Garante que o hash seja determinístico.

```typescript
function canonicalize(obj: any): string {
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}
```

### 3.3 Eventos registrados

Não-exaustivo:

- `SOLICITACAO_CRIADA` / `_APROVADA` / `_NEGADA`
- `VIAGEM_CRIADA` / `_INICIADA` / `_CONCLUIDA` / `_CANCELADA`
- `PASSAGEIRO_ALOCADO` / `_PRESENCA_REGISTRADA`
- `ABASTECIMENTO_SOLICITADO` / `_LIBERADO` / `_COMPROVADO` / `_NEGADO`
- `SALDO_AJUSTADO`
- `AJUDA_CUSTO_AUTORIZADA` / `_PAGA` / `_NEGADA`
- `MOTORISTA_AFASTADO` / `_REATIVADO`
- `VEICULO_MANUTENCAO` / `_REATIVADO`

### 3.4 Verificação periódica

```bash
# Verifica integridade da cadeia
curl https://<dominio>/v1/tfd/auditoria/verificar \
  -H "Authorization: Bearer $TOKEN"
# → { valido: true, totalLinhas: 12345 }
```

Cron sugerido em prod: hourly.

### 3.5 Exportação para TJ

```
GET /v1/tfd/auditoria/exportar-tj?inicio=2026-01&fim=2026-03
```

Retorna ZIP:

```
manifest.json          { tenant, periodo, totalLinhas, primeiroHash, ultimoHash, gerado_em }
manifest.json.sig      assinatura ICP-Brasil (se TFD_SIGN_REQUIRED=true)
audit.csv              todas as linhas do período
audit.json             mesmo conteúdo em JSON
comprovantes/          anexos referenciados (PDFs / imagens)
README.txt             instruções para o TJ verificar a cadeia
verificador.sh         script standalone que valida o ZIP offline
```

### 3.6 ICP-Brasil (opcional)

Quando `TFD_SIGN_REQUIRED=true`:

- Cada linha do audit pode ser assinada individualmente (overhead).
- Mais comum: assinar o manifest do ZIP final.
- Cert PFX / A1 / A3 instalado em `/opt/icp/cert.pfx` (path env).
- Backend usa `node-forge` para PKCS#7 detached signature.
- Verificação no cliente (TJ) via OpenSSL ou software dedicado.

---

## 4. Triggers SQL de imutabilidade

```sql
-- Função genérica
CREATE OR REPLACE FUNCTION raise_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tabela imutável — UPDATE/DELETE bloqueados pela legislação aplicável';
END;
$$ LANGUAGE plpgsql;

-- Aplica em cada tabela de audit
CREATE TRIGGER trg_relatorio_audit_imutavel
  BEFORE UPDATE OR DELETE ON relatorio_audit
  FOR EACH ROW EXECUTE FUNCTION raise_imutavel();

CREATE TRIGGER trg_paciente_prontuario_audit_imutavel
  BEFORE UPDATE OR DELETE ON paciente_prontuario_audit
  FOR EACH ROW EXECUTE FUNCTION raise_imutavel();

CREATE TRIGGER trg_tfd_audit_log_imutavel
  BEFORE UPDATE OR DELETE ON tfd_audit_log
  FOR EACH ROW EXECUTE FUNCTION raise_imutavel();
```

Aplicado por `npm run db:setup-triggers` (idempotente).
**Boot fail-fast em produção** verifica se os triggers estão ativos e recusa
subir se algum estiver ausente (`bootstrapTriggers.ts`).

## 5. ClamAV (varredura de anexos)

| Estado | Significado | Pode servir download? |
|---|---|---|
| `PENDENTE` | Recém-uploaded, na fila | ❌ |
| `LIMPO` | Scan ok, sem vírus | ✅ |
| `INFECTADO` | Vírus detectado, arquivo quarentenado | ❌ (404) |
| `FALHOU` | Erro técnico (clamav offline, timeout) | ❌ (503) |

Worker `ScanWorker` consome anexos PENDENTE, chama ClamAV TCP, atualiza
status. Em prod usar **freshclam** auto-update (cron).

## 6. Headers de segurança

Aplicados via Helmet + Caddy:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; img-src 'self' data:; ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

## 7. Compressão obrigatória de PDFs

Antes do upload S3:

1. Tenta **Ghostscript** (alta compressão, qualidade screen).
2. Fallback: **pdf-lib** (re-emissão sem qualidade perdida).

Reduz custo de storage e largura de banda para o app paciente baixar.

## 8. Política de senhas

Validador em `src/shared/senhaForte.ts`:

- Mínimo 8 chars.
- Pelo menos 1 letra + 1 número.
- Não pode estar na blocklist (top 1000 comuns).
- Hash bcrypt (cost 12).

Senha provisória expira em 7 dias (config). Após expiração, login retorna
`SENHA_EXPIRADA` e força fluxo de troca.

## 9. Checklist de conformidade

Antes de fechar PR que toca audit ou retenção:

- [ ] Mutação grava em `*_audit` na MESMA transação?
- [ ] `payload` registra estado anterior + ação + estado novo?
- [ ] Mexer no schema do `*_audit` é apenas ADDITIVE migration?
- [ ] Trigger de bloqueio continua ativo?
- [ ] Soft delete preserva audit?
- [ ] Hash chain TFD continua íntegra?
- [ ] `prefeituraId` presente em toda linha de audit?
- [ ] Anti-enumeration mantido (404 em vez de 403)?
- [ ] Compressão de PDF + ClamAV scan rodam antes de servir?
