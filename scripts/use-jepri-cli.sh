#!/usr/bin/env bash
# Uso:  source ./scripts/use-jepri-cli.sh
#
# Carga las credenciales de .env.cli.local y deja `vercel` y `supabase`
# apuntando a las cuentas de Jepri SOLO en esta shell, sin tocar el login
# global (~/.vercel, ~/.supabase) ni los conectores de Claude.

_here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
_envf="$_here/.env.cli.local"

if [ ! -f "$_envf" ]; then
  echo "No encuentro $_envf" >&2
  return 1 2>/dev/null || exit 1
fi

set -a
# shellcheck disable=SC1090
. "$_envf"
set +a

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "⚠  SUPABASE_ACCESS_TOKEN vacío en .env.cli.local" >&2
fi
if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "⚠  VERCEL_TOKEN vacío en .env.cli.local" >&2
fi

# Wrapper para vercel: siempre con --token de este proyecto.
vercel() { command vercel ${VERCEL_TOKEN:+--token "$VERCEL_TOKEN"} "$@"; }
# supabase ya respeta SUPABASE_ACCESS_TOKEN del entorno; wrapper solo por simetría.
supabase() { command supabase "$@"; }

echo "✓ CLIs de Jepri activos en esta shell:"
echo "  supabase  -> token de cuenta ($( [ -n "${SUPABASE_ACCESS_TOKEN:-}" ] && echo set || echo FALTA )), project ${SUPABASE_PROJECT_ID:-?}"
echo "  vercel    -> token ($( [ -n "${VERCEL_TOKEN:-}" ] && echo set || echo FALTA ))"
