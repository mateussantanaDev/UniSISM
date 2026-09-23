#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# shellcheck disable=SC1091
. scripts/smoke/env.sh

smoke_load_env
smoke_prepare_db

echo "═══════════════════════════════════════════════════════════════"
echo "  UNISISM · todos os smokes em banco isolado"
echo "  DATABASE_URL=$DATABASE_URL"
echo "═══════════════════════════════════════════════════════════════"

for script in scripts/smoke-test-etapa{1..12}.ts; do
  echo
  echo "→ $script"
  npx ts-node --transpile-only "$script"
done

echo
echo "→ smokes HTTP"
bash scripts/smoke/run-http-suite.sh
