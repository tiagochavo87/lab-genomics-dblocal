#!/bin/sh
# Agenda o backup diário com o cron do BusyBox e roda um backup logo na
# subida (assim a instalação já nasce com uma cópia).
set -eu
: "${BACKUP_TIME:=12:30}"
HOUR="${BACKUP_TIME%%:*}"
MIN="${BACKUP_TIME##*:}"
# export -p já gera as variáveis com aspas corretas (senha pode ter $ ou ").
export -p | grep -E "^export (PG[A-Z]*|BACKUP_[A-Z_]*|TZ)=" > /etc/backup.env || true
chmod 600 /etc/backup.env
echo "$MIN $HOUR * * * . /etc/backup.env; /usr/local/bin/pg-backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "[backup] agendado diariamente às ${BACKUP_TIME} (${TZ:-UTC}); retenção ${BACKUP_RETENTION_DAYS:-30} dias"
# Espera o Postgres aceitar conexões antes do primeiro backup.
i=0
until pg_isready -q || [ $i -ge 60 ]; do i=$((i+1)); sleep 2; done
/usr/local/bin/pg-backup.sh || echo "[backup] primeiro backup falhou; nova tentativa no horário agendado"
exec crond -f -l 8
