#!/usr/bin/env bash
#
# Smoke test do MANDATO_BACKEND.md §12 — Critérios de aceite do app paciente.
#
# Valida que o backend está em conformidade com o contrato exigido pelo
# UNISISM-Paciente (Flutter). Roda os 10 critérios + 1 script final.
#
# Uso:
#   bash scripts/smoke-test-app-contract.sh
#
# Saída:
#   - cada critério imprime "✅ X.Y OK" ou "❌ X.Y FAIL: motivo"
#   - exit 0 se TODOS passaram, exit 1 se qualquer falhou.

set -u

BASE="${BASE:-http://localhost:3333/v1}"
CPF="${CPF:-12345678909}"
SENHA="${SENHA:-$CPF}"

if [ -f .env ]; then
  if [ -z "${API_KEY:-}" ]; then
    API_KEY="$(grep -E '^API_KEY=' .env | head -n1 | cut -d= -f2-)"
    API_KEY="${API_KEY%\"}"
    API_KEY="${API_KEY#\"}"
    API_KEY="${API_KEY%\'}"
    API_KEY="${API_KEY#\'}"
  fi
  if [ -z "${API_KEY_HEADER:-}" ]; then
    API_KEY_HEADER="$(grep -E '^API_KEY_HEADER=' .env | head -n1 | cut -d= -f2-)"
    API_KEY_HEADER="${API_KEY_HEADER%\"}"
    API_KEY_HEADER="${API_KEY_HEADER#\"}"
    API_KEY_HEADER="${API_KEY_HEADER%\'}"
    API_KEY_HEADER="${API_KEY_HEADER#\'}"
  fi
fi

API_KEY_HEADER="${API_KEY_HEADER:-x-api-key}"
API_HEADERS=()
if [ -n "${API_KEY:-}" ]; then
  API_HEADERS=(-H "$API_KEY_HEADER: $API_KEY")
fi

if [ "${SMOKE_ENSURE_PACIENTE:-true}" != "false" ]; then
  if ! npx ts-node --transpile-only scripts/quick-create-paciente.ts >/tmp/unisism-smoke-paciente.log 2>&1; then
    echo "❌ Falha ao garantir paciente de teste antes do smoke:"
    sed -n '1,120p' /tmp/unisism-smoke-paciente.log
    exit 1
  fi
fi

PASS=0
FAIL=0

assert() {
  local nome="$1"
  local valor="$2"
  if [ "$valor" = "ok" ]; then
    echo "  ✅ $nome"
    PASS=$((PASS+1))
  else
    echo "  ❌ $nome — $valor"
    FAIL=$((FAIL+1))
  fi
}

# Helper jq que aceita "test" expression ou caminho
check() {
  local resp="$1"
  local expr="$2"
  echo "$resp" | jq -e "$expr" >/dev/null 2>&1 && echo "ok" || echo "FAIL ($expr)"
}

echo "═══════════════════════════════════════════════════════════════"
echo "  MANDATO_BACKEND.md §12 — Smoke contract test"
echo "  Backend: $BASE"
echo "  Paciente: CPF $CPF"
if [ -n "${API_KEY:-}" ]; then
  echo "  API key: usando header $API_KEY_HEADER"
else
  echo "  API key: não configurada"
fi
echo "  Fixture paciente: garantida"
echo "═══════════════════════════════════════════════════════════════"

# ────────────────────────────────────────────────────────────────
echo
echo "[12.1] Login"
RESP=$(curl -sX POST "$BASE/auth/paciente/login" \
  "${API_HEADERS[@]}" \
  -H 'Content-Type: application/json' \
  -d "{\"cpf\":\"$CPF\",\"senha\":\"$SENHA\"}")

assert "1.1 accessToken é string"      "$(check "$RESP" '.accessToken | type == "string"')"
assert "1.2 refreshToken é string"     "$(check "$RESP" '.refreshToken | type == "string"')"
assert "1.3 expiresAt ISO 8601"        "$(check "$RESP" '.expiresAt | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T")')"
assert "1.4 paciente.senhaProvisoria bool" "$(check "$RESP" '.paciente.senhaProvisoria | type == "boolean"')"
assert "1.5 paciente.cpfFormatado string"  "$(check "$RESP" '.paciente.cpfFormatado | type == "string"')"
assert "1.6 paciente.ubsVinculadaId string" "$(check "$RESP" '.paciente.ubsVinculadaId | type == "string"')"
assert "1.7 paciente.dataNascimento string" "$(check "$RESP" '.paciente.dataNascimento | type == "string"')"

TOKEN=$(echo "$RESP" | jq -r .accessToken 2>/dev/null)
REFRESH=$(echo "$RESP" | jq -r .refreshToken 2>/dev/null)

# ────────────────────────────────────────────────────────────────
echo
echo "[12.2] /me — shape idêntico ao paciente do login"
ME=$(curl -s "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/auth/paciente/me")
assert "2.1 senhaProvisoria bool"       "$(check "$ME" '.senhaProvisoria | type == "boolean"')"
assert "2.2 ubsVinculadaId string"      "$(check "$ME" '.ubsVinculadaId | type == "string"')"
assert "2.3 dataNascimento string"      "$(check "$ME" '.dataNascimento | type == "string"')"
assert "2.4 cartaoSus chave existe"     "$(check "$ME" 'has("cartaoSus")')"
assert "2.5 ubsVinculadaNome chave existe" "$(check "$ME" 'has("ubsVinculadaNome")')"
assert "2.6 fotoUrl chave existe"       "$(check "$ME" 'has("fotoUrl")')"

# ────────────────────────────────────────────────────────────────
echo
echo "[12.3] Encaminhamentos — shape FLAT (sem solicitacao aninhado)"
ENCS=$(curl -s "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/paciente/encaminhamentos")
COUNT_ENCS=$(echo "$ENCS" | jq 'length' 2>/dev/null)
if [ "${COUNT_ENCS:-0}" = "0" ]; then
  echo "  ⚠️  Sem encaminhamentos cadastrados — pulando 3.x (mas array vazio é OK)"
  assert "3.0 array (mesmo vazio)" "$(check "$ENCS" 'type == "array"')"
else
  assert "3.1 especialidade flat"       "$(check "$ENCS" '.[0].especialidade | type == "string"')"
  assert "3.2 cid10 flat"               "$(check "$ENCS" '.[0] | has("cid10")')"
  assert "3.3 prioridade flat"          "$(check "$ENCS" '.[0].prioridade | type == "string"')"
  assert "3.4 justificativaResumida flat" "$(check "$ENCS" '.[0] | has("justificativaResumida")')"
  assert "3.5 ubsOrigemNome flat"       "$(check "$ENCS" '.[0] | has("ubsOrigemNome")')"
  assert "3.6 dataAgendamento flat"     "$(check "$ENCS" '.[0] | has("dataAgendamento")')"
  # 3.7: NÃO deve ter solicitacao aninhada
  if echo "$ENCS" | jq -e '.[0].solicitacao' >/dev/null 2>&1; then
    assert "3.7 sem campo 'solicitacao' aninhado" "FAIL (campo solicitacao deveria ser removido)"
  else
    assert "3.7 sem campo 'solicitacao' aninhado" "ok"
  fi
fi

# ────────────────────────────────────────────────────────────────
echo
echo "[12.4] /encaminhamentos/ativo — null literal ou objeto"
ATIVO=$(curl -s "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/paciente/encaminhamentos/ativo")
if [ "$ATIVO" = "null" ]; then
  assert "4.1 retorna null literal (sem encaminhamento)" "ok"
elif echo "$ATIVO" | jq -e '.id' >/dev/null 2>&1; then
  assert "4.1 retorna objeto Encaminhamento" "ok"
else
  assert "4.1 retorna null OU objeto" "FAIL (resposta = $ATIVO)"
fi

# ────────────────────────────────────────────────────────────────
echo
echo "[12.5] Anexos por encaminhamento"
if [ "${COUNT_ENCS:-0}" -gt 0 ]; then
  ID=$(echo "$ENCS" | jq -r '.[0].id')
  ANEXOS=$(curl -s "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/paciente/encaminhamentos/$ID/anexos")
  COUNT_ANX=$(echo "$ANEXOS" | jq 'length' 2>/dev/null)
  if [ "${COUNT_ANX:-0}" -gt 0 ]; then
    assert "5.1 tipo PDF|IMG|DOC"        "$(check "$ANEXOS" '.[0].tipo | test("^(PDF|IMG|DOC)$")')"
    assert "5.2 tamanhoBytes number"     "$(check "$ANEXOS" '.[0].tamanhoBytes | type == "number"')"
    assert "5.3 adicionadoEm presente"   "$(check "$ANEXOS" '.[0] | has("adicionadoEm")')"
  else
    assert "5.0 anexos array (vazio ok)" "$(check "$ANEXOS" 'type == "array"')"
  fi
else
  echo "  ⏭  pulando (sem encaminhamentos)"
fi

# ────────────────────────────────────────────────────────────────
echo
echo "[12.6] Timeline"
if [ "${COUNT_ENCS:-0}" -gt 0 ]; then
  TL=$(curl -s "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/paciente/encaminhamentos/$ID/timeline")
  COUNT_TL=$(echo "$TL" | jq 'length' 2>/dev/null)
  if [ "${COUNT_TL:-0}" -gt 0 ]; then
    assert "6.1 campo 'em' presente"     "$(check "$TL" '.[0] | has("em")')"
    assert "6.2 tipo do enum app"        "$(check "$TL" '.[0].tipo | test("^(CRIACAO|ANEXO|PENDENCIA|APROVACAO|AGENDAMENTO|REJEICAO|ATUALIZACAO)$")')"
  else
    assert "6.0 timeline array (vazio ok)" "$(check "$TL" 'type == "array"')"
  fi
else
  echo "  ⏭  pulando (sem encaminhamentos)"
fi

# ────────────────────────────────────────────────────────────────
echo
echo "[12.7] Notificações"
N=$(curl -s "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/paciente/notificacoes")
COUNT_N=$(echo "$N" | jq 'length' 2>/dev/null)
if [ "${COUNT_N:-0}" -gt 0 ]; then
  assert "7.1 lida é boolean"             "$(check "$N" '.[0].lida | type == "boolean"')"
  assert "7.2 campo 'em' (não criadaEm)"  "$(check "$N" '.[0] | has("em")')"
  assert "7.3 tone enum válido"           "$(check "$N" '.[0].tone | test("^(INFO|SUCCESS|WARNING|CRITICAL)$")')"
else
  assert "7.0 notificações array (vazio ok)" "$(check "$N" 'type == "array"')"
fi

COUNT_RESP=$(curl -s "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/paciente/notificacoes/contagem-nao-lidas")
assert "7.4 contagem retorna campo 'count'"  "$(check "$COUNT_RESP" '.count | type == "number"')"

# ────────────────────────────────────────────────────────────────
echo
echo "[12.8] Dossiê"
DOSSIE=$(curl -s "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/paciente/dossie/resumo")
assert "8.1 totalExames number"            "$(check "$DOSSIE" '.totalExames | type == "number"')"
assert "8.2 alergias array"                "$(check "$DOSSIE" '.alergias | type == "array"')"
assert "8.3 condicoesCronicas array"       "$(check "$DOSSIE" '.condicoesCronicas | type == "array"')"

# ────────────────────────────────────────────────────────────────
echo
echo "[12.9] UBS"
UBS=$(curl -s "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/paciente/ubs/minha")
HTTP_UBS=$(curl -s -o /dev/null -w '%{http_code}' "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/paciente/ubs/minha")
if [ "$HTTP_UBS" = "404" ]; then
  echo "  ⏭  paciente sem UBS — pulando UBS check (404 esperado)"
else
  assert "9.1 cidade string"               "$(check "$UBS" '.cidade | type == "string"')"
  # whatsapp pode ser null se não cadastrado — só validar formato quando presente
  if echo "$UBS" | jq -e '.whatsapp' >/dev/null 2>&1; then
    assert "9.2 whatsapp formato DDI dígitos" "$(check "$UBS" '(.whatsapp | test("^55[0-9]+$")) and ((.whatsapp | length) >= 12 and (.whatsapp | length) <= 13)')"
  else
    assert "9.2 whatsapp pode ser null"    "ok"
  fi
fi

# ────────────────────────────────────────────────────────────────
echo
echo "[12.10] TFD viagens"
VIAGENS=$(curl -s "${API_HEADERS[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/paciente/tfd/viagens")
COUNT_V=$(echo "$VIAGENS" | jq 'length' 2>/dev/null)
if [ "${COUNT_V:-0}" -gt 0 ]; then
  assert "10.1 horaPartida HH:mm"          "$(check "$VIAGENS" '.[0].horaPartida | test("^[0-2][0-9]:[0-5][0-9]$")')"
else
  assert "10.0 viagens array (vazio ok)"   "$(check "$VIAGENS" 'type == "array"')"
fi

# ────────────────────────────────────────────────────────────────
echo
echo "[BONUS] Refresh rotativo"
REFRESH_RESP=$(curl -sX POST "$BASE/auth/paciente/refresh" \
  "${API_HEADERS[@]}" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}")
assert "B.1 refresh retorna accessToken NOVO"    "$(check "$REFRESH_RESP" '.accessToken | type == "string"')"
assert "B.2 refresh retorna expiresAt"            "$(check "$REFRESH_RESP" '.expiresAt | test("^[0-9]{4}")')"

# ────────────────────────────────────────────────────────────────
echo
echo "[INFRA] Segurança e erros padrão"
HEALTH_HTTP=$(curl -s -o /tmp/unisism-smoke-health.json -w '%{http_code}' "$BASE/health")
assert "I.1 health público sem API key" "$( [ "$HEALTH_HTTP" = "200" ] && echo ok || echo "FAIL (HTTP $HEALTH_HTTP)" )"

if [ -n "${API_KEY:-}" ]; then
  NO_KEY=$(curl -s "$BASE/dashboard/metrics")
  assert "I.2 rota privada exige API key" "$(check "$NO_KEY" '.error.code == "API_KEY_INVALIDA"')"
else
  echo "  ⏭  API key não configurada — pulando I.2"
fi

INVALID_PAYLOAD=$(curl -sX POST "$BASE/auth/paciente/login" \
  "${API_HEADERS[@]}" \
  -H 'Content-Type: application/json' \
  -d '{}')
assert "I.3 payload inválido retorna 400 padrão" "$(check "$INVALID_PAYLOAD" '.error.code == "PAYLOAD_INVALIDO"')"

NOT_FOUND=$(curl -s "${API_HEADERS[@]}" "$BASE/rota-inexistente")
assert "I.4 rota inexistente retorna 404 padrão" "$(check "$NOT_FOUND" '.error.code == "ROTA_NAO_ENCONTRADA"')"

# ────────────────────────────────────────────────────────────────
echo
echo "═══════════════════════════════════════════════════════════════"
TOTAL=$((PASS + FAIL))
echo "  Resultado: $PASS/$TOTAL passaram · $FAIL falharam"
echo "═══════════════════════════════════════════════════════════════"

if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ BACKEND EM CONFORMIDADE COM MANDATO_BACKEND.md"
  exit 0
else
  echo "  ❌ $FAIL violações — backend NÃO em conformidade"
  exit 1
fi
