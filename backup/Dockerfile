# Serviço de backup diário do PostgreSQL (docker-compose.local.yml).
FROM postgres:16-alpine
RUN apk add --no-cache openssl tzdata
COPY pg-backup.sh /usr/local/bin/pg-backup.sh
COPY entrypoint.sh /usr/local/bin/backup-entrypoint.sh
RUN chmod +x /usr/local/bin/pg-backup.sh /usr/local/bin/backup-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/backup-entrypoint.sh"]
