#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# shellcheck disable=SC1091
. scripts/smoke/env.sh

smoke_load_env
smoke_prepare_db

npx ts-node --transpile-only scripts/smoke-test-etapa10.ts
