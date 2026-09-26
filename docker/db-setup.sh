#!/bin/sh
# Cria/atualiza o usuário "dblapoge_app" (sem superusuário) usado pela API e
# pelo backup. Roda a cada "docker compose up" (idempotente), inclusive sobre
# um volume antigo da v1, cujas tabelas pertenciam ao superusuário.
set -eu
: "${APP_DB_USER:=dblapoge_app}"
: "${APP_DB_PASSWORD:?Defina APP_DB_PASSWORD no .env}"
: "${POSTGRES_DB:=dblapoge}"
export PGPASSWORD="$POSTGRES_PASSWORD"
psql -v ON_ERROR_STOP=1 -q -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U postgres -d "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_pass="$APP_DB_PASSWORD" -v db="$POSTGRES_DB" \
  -f "${SETUP_SQL:-/db-setup.sql}"
echo "[db-setup] usuário '$APP_DB_USER' pronto (sem superusuário)"
