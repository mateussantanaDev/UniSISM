#!/usr/bin/env bash

smoke_load_env() {
  set -a
  if [ -f .env ]; then
    # shellcheck disable=SC1091
    . ./.env
  fi
  if [ -f .env.smoke ]; then
    # shellcheck disable=SC1091
    . ./.env.smoke
  fi
  set +a

  if [ -n "${SMOKE_DATABASE_URL:-}" ]; then
    export DATABASE_URL="$SMOKE_DATABASE_URL"
  else
    export DATABASE_URL="$(
      node - "$DATABASE_URL" <<'NODE'
const raw = process.argv[2];
if (!raw) process.exit(1);
const url = new URL(raw);
const db = decodeURIComponent(url.pathname.replace(/^\//, ''));
const next = /(^|[_-])(smoke|test|testing|ci)([_-]|$)/i.test(db) ? db : `${db}_smoke`;
url.pathname = `/${encodeURIComponent(next)}`;
process.stdout.write(url.toString());
NODE
    )"
  fi

  export PORT="${SMOKE_PORT:-3334}"
  export BACKEND_PORT="$PORT"
  export BASE="${BASE:-http://localhost:${PORT}/v1}"
  export DEMO_SEED_ON_BOOT="${DEMO_SEED_ON_BOOT:-false}"
  export OUTBOX_ENABLED="${OUTBOX_ENABLED:-false}"
  export PUSH_DISPATCHER_ENABLED="${PUSH_DISPATCHER_ENABLED:-false}"
  export NTFY_BASE_URL="${NTFY_BASE_URL:-https://ntfy.example.com}"
  export STORAGE_PROVIDER="${STORAGE_PROVIDER:-disk}"
  export UPLOAD_DIR="${UPLOAD_DIR:-./uploads-smoke}"
}

smoke_database_name_for_url() {
  node - "$1" <<'NODE'
const url = new URL(process.argv[2]);
process.stdout.write(decodeURIComponent(url.pathname.replace(/^\//, '')));
NODE
}

smoke_maintenance_url_for_url() {
  node - "$1" <<'NODE'
const url = new URL(process.argv[2]);
url.pathname = '/postgres';
process.stdout.write(url.toString());
NODE
}

smoke_quote_identifier() {
  node - "$1" <<'NODE'
const raw = process.argv[2];
process.stdout.write(`"${raw.replace(/"/g, '""')}"`);
NODE
}

smoke_assert_safe_database_name() {
  local db_name="$1"
  case "$db_name" in
    ''|*[!A-Za-z0-9_-]*)
      echo "Nome de banco inseguro para automacao: $db_name"
      exit 1
      ;;
  esac
}

smoke_create_database() {
  local database_url="$1"
  local db_name
  db_name="$(smoke_database_name_for_url "$database_url")"
  smoke_assert_safe_database_name "$db_name"

  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^unisism-postgres$'; then
    docker exec unisism-postgres createdb -U "${POSTGRES_USER:-unisism}" "$db_name" >/dev/null 2>&1 || true
    return
  fi

  if command -v psql >/dev/null 2>&1; then
    local maintenance_url
    maintenance_url="$(smoke_maintenance_url_for_url "$database_url")"
    if ! psql "$maintenance_url" -v db_name="$db_name" -tAc "SELECT 1 FROM pg_database WHERE datname = :'db_name'" | grep -q 1; then
      local quoted_db_name
      quoted_db_name="$(smoke_quote_identifier "$db_name")"
      psql "$maintenance_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $quoted_db_name" >/dev/null
    fi
    return
  fi

  echo "Aviso: nem container unisism-postgres nem psql encontrados; assumindo banco $db_name ja existente."
}

smoke_recreate_database() {
  local database_url="$1"
  local db_name
  db_name="$(smoke_database_name_for_url "$database_url")"
  smoke_assert_safe_database_name "$db_name"

  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^unisism-postgres$'; then
    docker exec unisism-postgres dropdb -U "${POSTGRES_USER:-unisism}" --if-exists "$db_name" >/dev/null 2>&1 || true
    docker exec unisism-postgres createdb -U "${POSTGRES_USER:-unisism}" "$db_name" >/dev/null
    return
  fi

  if command -v psql >/dev/null 2>&1; then
    local maintenance_url
    local quoted_db_name
    maintenance_url="$(smoke_maintenance_url_for_url "$database_url")"
    quoted_db_name="$(smoke_quote_identifier "$db_name")"
    psql "$maintenance_url" -v db_name="$db_name" -v ON_ERROR_STOP=1 \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'db_name' AND pid <> pg_backend_pid();" >/dev/null
    psql "$maintenance_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $quoted_db_name" >/dev/null
    psql "$maintenance_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $quoted_db_name" >/dev/null
    return
  fi

  echo "Nem container unisism-postgres nem psql encontrados; nao consigo recriar $db_name automaticamente."
  exit 1
}

smoke_try_create_default_db() {
  smoke_create_database "$DATABASE_URL"
}

smoke_prepare_db() {
  node scripts/smoke/guard-smoke-db.js
  smoke_try_create_default_db
  npx prisma db push --accept-data-loss
  npm run db:setup-triggers --silent
}
