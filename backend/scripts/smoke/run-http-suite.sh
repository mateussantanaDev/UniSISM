#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# shellcheck disable=SC1091
. scripts/smoke/env.sh

smoke_load_env
smoke_prepare_db

npm run build

SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

npm start &
SERVER_PID="$!"

echo "→ aguardando backend em $BASE/health"
for i in $(seq 1 40); do
  if curl -s -f "$BASE/health" >/dev/null 2>&1; then
    echo "  ✓ backend pronto após ${i}s"
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "✗ backend encerrou antes do health"
    wait "$SERVER_PID" || true
    exit 1
  fi
  sleep 1
done

if ! curl -s -f "$BASE/health" >/dev/null 2>&1; then
  echo "✗ backend nao ficou pronto em tempo"
  exit 1
fi

npm run test:smoke:app
npx ts-node --transpile-only scripts/smoke/smoke-http-suite.ts
npx ts-node --transpile-only scripts/smoke/smoke-critical-flows.ts
