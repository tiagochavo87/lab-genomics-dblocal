#!/usr/bin/env bash
# Instala o DBLAPOGE v2 num servidor Linux (Debian/Ubuntu), por exemplo uma
# VM gratuita na nuvem ou um PC reaproveitado. Rode como root, na pasta do
# projeto:
#   sudo ./scripts/instalar-linux.sh meu-dominio.duckdns.org
# Sem domínio (só rede interna, HTTP na porta 8080):
#   sudo ./scripts/instalar-linux.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN="${1:-}"

if [ "$(id -u)" -ne 0 ]; then echo "Rode como root (sudo)."; exit 1; fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Instalando Docker"
  apt-get update -y
  apt-get install -y ca-certificates curl openssl
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

if [ ! -f .env ]; then
  ./scripts/gerar-env.sh
fi
if [ -n "$DOMAIN" ]; then
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" .env
  COMPOSE="docker compose -f docker-compose.local.yml -f docker-compose.remote.yml"
  URL="https://$DOMAIN"
else
  COMPOSE="docker compose -f docker-compose.local.yml -f docker-compose.lan.yml"
  IP="$(hostname -I | awk '{print $1}')"
  sed -i "s#^CORS_ORIGIN=.*#CORS_ORIGIN=http://$IP:8080#; s#^PUBLIC_APP_URL=.*#PUBLIC_APP_URL=http://$IP:8080/reset-password#" .env
  URL="http://$IP:8080"
fi
mkdir -p backups && chmod 700 backups

echo "==> Subindo os containers (a primeira vez demora alguns minutos)"
$COMPOSE up -d --build

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  if [ -n "$DOMAIN" ]; then ufw allow 80/tcp; ufw allow 443/tcp; else ufw allow from 192.168.0.0/16 to any port 8080 proto tcp; ufw allow from 10.0.0.0/8 to any port 8080 proto tcp; fi
fi

echo "==> Aguardando a API"
for _ in $(seq 1 60); do
  if $COMPOSE exec -T api node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then OK=1; break; fi
  sleep 3
done
[ "${OK:-}" = 1 ] || { echo "A API não respondeu. Veja: $COMPOSE logs api"; exit 1; }

echo
echo "Pronto: $URL"
echo "Login: e-mail em INITIAL_ADMIN_EMAIL e senha em INITIAL_ADMIN_PASSWORD (arquivo .env)."
echo "Backups diários em $(pwd)/backups — copie essa pasta para fora do servidor regularmente."
echo "Teste completo: node scripts/testar-servidor.mjs $URL <email-admin> <senha>"
