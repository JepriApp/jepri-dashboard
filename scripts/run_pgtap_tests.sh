#!/usr/bin/env bash
# Corre los tests pgTAP (supabase/tests/database/*.sql) contra STAGING_DATABASE_URL.
#
# No usamos `supabase test db --db-url` porque esa ruta del CLI exige TLS, y el
# self-hosted de staging no lo soporta. En su lugar corremos cada archivo con psql
# y parseamos la salida TAP: cualquier línea "not ok" marca el archivo como fallido.
#
# Uso: npm run test:db

set -euo pipefail

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [ -z "${STAGING_DATABASE_URL:-}" ]; then
  echo "STAGING_DATABASE_URL no está seteado (revisa .env.local)." >&2
  exit 1
fi

TEST_DIR="supabase/tests/database"
if [ ! -d "$TEST_DIR" ]; then
  echo "No existe $TEST_DIR, nada que correr." >&2
  exit 0
fi

shopt -s nullglob
files=("$TEST_DIR"/*.sql)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  echo "No hay archivos .sql en $TEST_DIR."
  exit 0
fi

failures=0
for file in "${files[@]}"; do
  echo "--- $file ---"
  output=$(psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file" 2>&1) || {
    echo "$output"
    echo "FALLÓ (error de conexión/SQL) en $file"
    failures=$((failures + 1))
    continue
  }
  echo "$output"
  if echo "$output" | grep -q "^ *not ok"; then
    echo "FALLÓ (assertion pgTAP) en $file"
    failures=$((failures + 1))
  fi
done

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures archivo(s) con fallos."
  exit 1
fi

echo "Todos los tests pgTAP pasaron."
