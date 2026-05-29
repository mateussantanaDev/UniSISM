#!/usr/bin/env bash
# ============================================================
# UNISISM Backend — script de setup automatizado.
#
# Sobe tudo do zero numa máquina que tenha:
#   - Node.js 22+
#   - Docker
#   - Git
#
# Uso:
#   bash scripts/setup.sh
#
# É idempotente — rodar várias vezes não quebra nada.
# ============================================================
set -e

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  UNISISM Backend · Setup automatizado"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Diretório: $ROOT"
echo ""

# ----- 1. Verifica pré-requisitos -----
echo "→ 1/7 Verificando pré-requisitos..."
command -v node >/dev/null || { echo "✗ Node.js não instalado. Instale Node 22+ e rode novamente."; exit 1; }
command -v docker >/dev/null || { echo "✗ Docker não instalado. Instale Docker e rode novamente."; exit 1; }
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗ Node $NODE_MAJOR muito antigo. Mínimo: 20."
  exit 1
fi
echo "  ✓ Node $(node -v) · Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ----- 2. .env -----
echo ""
echo "→ 2/7 Configurando .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  ✓ .env criado a partir de .env.example"
else
  echo "  ✓ .env já existe (não sobrescrevendo)"
fi

# ----- 3. Dependências npm -----
echo ""
echo "→ 3/7 Instalando dependências npm..."
if [ ! -d node_modules ]; then
  npm install --silent 2>&1 | tail -3
else
  echo "  ✓ node_modules já existe (use 'npm install' manualmente se precisar atualizar)"
fi

# ----- 4. Postgres via Docker -----
echo ""
echo "→ 4/7 Subindo Postgres no Docker..."
if docker ps --format '{{.Names}}' | grep -q "^unisism-postgres$"; then
  echo "  ✓ container 'unisism-postgres' já rodando"
elif docker ps -a --format '{{.Names}}' | grep -q "^unisism-postgres$"; then
  docker start unisism-postgres >/dev/null
  echo "  ✓ container 'unisism-postgres' reiniciado"
else
  docker run -d --name unisism-postgres --restart unless-stopped \
    -p 5432:5432 \
    -e POSTGRES_USER=unisism \
    -e POSTGRES_PASSWORD=unisism \
    -e POSTGRES_DB=unisism_ubs \
    -v unisism_pgdata:/var/lib/postgresql/data \
    postgres:16-alpine >/dev/null
  echo "  ✓ container 'unisism-postgres' criado"
fi

echo "  → Aguardando Postgres aceitar conexões..."
for i in $(seq 1 30); do
  if docker exec unisism-postgres pg_isready -U unisism -d unisism_ubs >/dev/null 2>&1; then
    echo "  ✓ Postgres pronto após ${i}s"
    break
  fi
  sleep 1
done

# ----- 5. Schema + triggers -----
echo ""
echo "→ 5/7 Aplicando schema Prisma..."
npx prisma db push --accept-data-loss 2>&1 | tail -2

echo ""
echo "→ 6/7 Aplicando triggers de imutabilidade de audit..."
npm run db:setup-triggers --silent 2>&1 | tail -3

# ----- 6. Seed -----
echo ""
echo "→ 7/7 Seed do usuário DEV..."
DEV_COUNT=$(node -e "
const { PrismaClient } = require('./generated/prisma');
const p = new PrismaClient();
p.atendente.count({ where: { matricula: 'DEV-MATEUS' } })
  .then(n => process.stdout.write(String(n)))
  .finally(() => p.\$disconnect());
")
if [ "$DEV_COUNT" = "0" ]; then
  npm run db:seed 2>&1 | tail -8
else
  echo "  ✓ usuário DEV-MATEUS já existe (skip seed)"
fi

# ----- Final -----
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup completo!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Inicie o backend:"
echo "    npm run dev"
echo ""
echo "  Health:        http://localhost:3333/v1/health"
echo "  Login DEV:     POST http://localhost:3333/v1/auth/login"
echo "                 { \"login\":\"DEV-MATEUS\", \"senha\":\"Aguasbelas#!\" }"
echo ""
echo "  Para parar:"
echo "    docker stop unisism-postgres"
echo ""
echo "  Para resetar completamente:"
echo "    docker rm -f unisism-postgres && docker volume rm unisism_pgdata"
echo ""
