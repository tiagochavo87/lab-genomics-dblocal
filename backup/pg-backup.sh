#!/bin/sh
# Gera um dump do banco (formato custom do pg_dump), opcionalmente cifrado,
# e apaga os mais antigos que BACKUP_RETENTION_DAYS.
#
# Arquivo cifrado é compatível com o openssl:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -in X.dump.enc -out X.dump
set -eu
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=30}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
BASE="$BACKUP_DIR/dblapoge_$STAMP.dump"
TMP="$BASE.partial"
mkdir -p "$BACKUP_DIR"
umask 077

if ! pg_dump --format=custom --compress=6 --no-owner --file="$TMP"; then
  rm -f "$TMP"
  echo "[backup] $(date -Iseconds) ERRO: pg_dump falhou"
  exit 1
fi

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -salt \
    -pass env:BACKUP_PASSPHRASE -in "$TMP" -out "$BASE.enc.partial"
  rm -f "$TMP"
  mv "$BASE.enc.partial" "$BASE.enc"
  FINAL="$BASE.enc"
else
  mv "$TMP" "$BASE"
  FINAL="$BASE"
fi

( cd "$BACKUP_DIR" && sha256sum "$(basename "$FINAL")" > "$(basename "$FINAL").sha256" )
SIZE="$(du -h "$FINAL" | cut -f1)"
find "$BACKUP_DIR" -maxdepth 1 -name 'dblapoge_*' -type f -mtime "+$BACKUP_RETENTION_DAYS" -delete
date -Iseconds > "$BACKUP_DIR/ULTIMO_BACKUP_OK.txt"
echo "[backup] $(date -Iseconds) OK: $(basename "$FINAL") ($SIZE)"
