#!/usr/bin/env bash
# Restaura um backup gerado pelo serviço "backup" do Docker.
# Uso: ./scripts/restore-docker.sh backups/dblapoge_AAAA-MM-DD_HHMMSS.dump[.enc]
# ATENÇÃO: substitui o conteúdo atual do banco. Pare a API antes:
#   docker compose -f docker-compose.local.yml stop api
set -euo pipefail
FILE="${1:?Informe o arquivo de backup}"
COMPOSE="docker compose -f docker-compose.local.yml"
[ -f "$FILE" ] || { echo "Arquivo não encontrado: $FILE"; exit 1; }
if [ -f "$FILE.sha256" ]; then (cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256"); fi

DUMP="$FILE"
if [[ "$FILE" == *.enc ]]; then
  read -rsp "Senha do backup (BACKUP_PASSPHRASE): " PASS; echo
  DUMP="$(mktemp)"
  trap 'rm -f "$DUMP"' EXIT
  PASS="$PASS" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -pass env:PASS -in "$FILE" -out "$DUMP"
fi

read -rp "Isto vai SUBSTITUIR o banco atual. Digite RESTAURAR para continuar: " OK
[ "$OK" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
$COMPOSE exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --role="$APP_DB_USER" -U postgres -d "$POSTGRES_DB"' < "$DUMP"
echo "Restauração concluída. Suba a API: $COMPOSE up -d api"
