#!/usr/bin/env bash
# Gera o .env do modo Docker com segredos aleatórios. Não sobrescreve um .env existente.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo ".env já existe; nada foi alterado."; exit 1; fi
rnd() { openssl rand -hex "$1"; }
ADMIN_PASS="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)"
sed -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(rnd 24)/" \
    -e "s/^APP_DB_PASSWORD=.*/APP_DB_PASSWORD=$(rnd 24)/" \
    -e "s/^JWT_SECRET=.*/JWT_SECRET=$(rnd 32)/" \
    -e "s/^SETTINGS_ENCRYPTION_KEY=.*/SETTINGS_ENCRYPTION_KEY=$(rnd 32)/" \
    -e "s/^INITIAL_ADMIN_PASSWORD=.*/INITIAL_ADMIN_PASSWORD=$ADMIN_PASS/" \
    .env.docker.example > .env
chmod 600 .env
echo ".env criado. Senha inicial do admin: $ADMIN_PASS (troque após o primeiro login)."
echo "Revise DOMAIN, INITIAL_ADMIN_EMAIL, SMTP_* e BACKUP_PASSPHRASE antes de subir."
