#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# shellcheck disable=SC1091
. scripts/smoke/env.sh

smoke_load_env

TEST_DATABASE_URL="$(
  node - "$DATABASE_URL" <<'NODE'
const url = new URL(process.argv[2]);
url.pathname = '/unisism_ubs_migrate_test';
process.stdout.write(url.toString());
NODE
)"

TEST_DB_NAME="$(
  node - "$TEST_DATABASE_URL" <<'NODE'
const url = new URL(process.argv[2]);
process.stdout.write(decodeURIComponent(url.pathname.replace(/^\//, '')));
NODE
)"

case "$TEST_DB_NAME" in
  *test*|*smoke*|*ci*) ;;
  *)
    echo "Banco descartavel inseguro: $TEST_DB_NAME"
    exit 1
    ;;
esac

echo "→ recriando banco descartavel $TEST_DB_NAME"
smoke_recreate_database "$TEST_DATABASE_URL"

echo "→ aplicando migrations do zero"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

echo "→ aplicando triggers"
DATABASE_URL="$TEST_DATABASE_URL" npm run db:setup-triggers --silent

echo "→ rodando seed"
DATABASE_URL="$TEST_DATABASE_URL" npm run db:seed --silent

echo "→ conferindo drift entre banco migrado e schema.prisma"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate diff \
  --from-url "$TEST_DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code

echo "✓ migrations, triggers, seed e schema sem drift"
