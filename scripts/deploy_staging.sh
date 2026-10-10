#!/usr/bin/env bash
# Deploy de staging: trae la última versión de la rama y reconstruye el contenedor.
# Pensado para correr EN EL SERVIDOR, en un clon dedicado a esto (no tu working copy de
# desarrollo) — hace `reset --hard`, así que no debe tener cambios locales sin commitear.
#
# Primer uso en el servidor (una sola vez):
#   git clone git@github.com:JepriApp/jepri-dashboard.git
#   cd jepri-dashboard
#   git checkout feature/telegram-order-bot
#   cp .env.staging.example .env   # y completar los valores reales
#
# De ahí en adelante, cada deploy:
#   ./scripts/deploy_staging.sh
#
# Para que sea 100% automático (sin correrlo a mano), agregar a crontab:
#   */10 * * * * cd /ruta/al/repo && ./scripts/deploy_staging.sh >> /var/log/jepri-staging-deploy.log 2>&1

set -euo pipefail

BRANCH="${1:-feature/telegram-order-bot}"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

docker compose up -d --build
docker image prune -f
