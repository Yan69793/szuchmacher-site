#!/usr/bin/env bash
# deploy.sh — Publica arquivos no HostGator via FTP+TLS
# Uso: bash scripts/deploy.sh [agenda|agenda-data|index|relatorios|multiasset|multiasset-app|logo|all]
set -e

ROOT="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)"
CREDS="$ROOT/.env"

# Carrega FTP_HOST, FTP_USER, FTP_PASS do .env (ignora comentários e linhas vazias)
FTP_HOST=""; FTP_USER=""; FTP_PASS=""
while IFS='=' read -r key val; do
  case "$key" in
    FTP_HOST) FTP_HOST="$val" ;;
    FTP_USER) FTP_USER="$val" ;;
    FTP_PASS) FTP_PASS="$val" ;;
  esac
done < "$CREDS"

upload() {
  local file="$1"   # caminho local relativo ao root
  local remote="$2" # ex: /assets/agenda.php
  echo "→ $file"
  curl --ssl-reqd -s -T "$ROOT/$file" \
       --user "$FTP_USER:$FTP_PASS" \
       "ftp://$FTP_HOST$remote"
  STATUS=$(curl -s "https://szuchmacher.com.br$remote" -o /dev/null -w "%{http_code}")
  if [ "$STATUS" = "200" ]; then
    echo "  ✓ HTTP 200 — $remote"
  else
    echo "  ✗ HTTP $STATUS — $remote (verifique manualmente)"
    exit 1
  fi
}

TARGET="${1:-all}"

case "$TARGET" in
  agenda)
    upload "agenda-server.php" "/assets/agenda.php"
    ;;
  index)
    upload "index.html" "/index.html"
    ;;
  relatorios)
    upload "relatorios.html" "/relatorios.html"
    ;;
  multiasset)
    upload "multiasset.html" "/multiasset.html"
    ;;
  multiasset-app)
    upload "multiasset-app.html" "/multiasset-app.html"
    ;;
  relatorio-prices)
    upload "relatorio-prices.php" "/relatorio-prices.php"
    ;;
  agenda-data)
    upload "agenda-data.json" "/agenda-data.json"
    ;;
  logo)
    upload "logo.png" "/logo.png"
    ;;
  all)
    upload "agenda-server.php"   "/assets/agenda.php"
    upload "index.html"          "/index.html"
    upload "relatorios.html"     "/relatorios.html"
    upload "multiasset.html"     "/multiasset.html"
    upload "multiasset-app.html" "/multiasset-app.html"
    upload "agenda-data.json"    "/agenda-data.json"
    upload "logo.png"            "/logo.png"
    upload "relatorio-prices.php" "/relatorio-prices.php"
    ;;
  *)
    echo "Uso: bash scripts/deploy.sh [agenda|agenda-data|index|relatorios|multiasset|multiasset-app|logo|all]"
    exit 1
    ;;
esac

echo "Deploy concluído."
