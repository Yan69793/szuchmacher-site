#!/usr/bin/env bash
# deploy.sh — Publica arquivos no HostGator via FTP+TLS
#
# CAMINHO LEGADO, SÓ PARA ROLLBACK. A produção é o Cloudflare Worker sz-sites
# desde 17/06/2026 (deploy-cloudflare.ps1). Publicar por aqui NÃO muda o que
# szuchmacher.com.br serve enquanto o Worker estiver ativo.
#
# Uso: bash scripts/deploy.sh [agenda-data|index|relatorios|multiasset|multiasset-app|logo|all]
set -euo pipefail

ROOT="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)"
CREDS="$ROOT/.env"

if [ ! -f "$CREDS" ]; then
  echo "ERRO: $CREDS não encontrado. Copie .env.example e preencha FTP_HOST/FTP_USER/FTP_PASS." >&2
  exit 1
fi

# Carrega FTP_HOST, FTP_USER, FTP_PASS do .env (ignora comentários e linhas vazias).
# O ${val%$'\r'} remove o carriage return de um .env salvo em CRLF, que antes
# entrava na senha e fazia o login falhar sem explicação.
FTP_HOST=""; FTP_USER=""; FTP_PASS=""
while IFS='=' read -r key val; do
  val="${val%$'\r'}"
  case "$key" in
    FTP_HOST) FTP_HOST="$val" ;;
    FTP_USER) FTP_USER="$val" ;;
    FTP_PASS) FTP_PASS="$val" ;;
  esac
done < "$CREDS"

if [ -z "$FTP_HOST" ] || [ -z "$FTP_USER" ] || [ -z "$FTP_PASS" ]; then
  echo "ERRO: FTP_HOST, FTP_USER e FTP_PASS precisam estar preenchidos em $CREDS." >&2
  exit 1
fi

# Verificação pós-upload: o remote público só reflete o FTP se o legado estiver
# de fato servindo. Com o Worker ativo, checar szuchmacher.com.br daria um verde
# falso — o 200 viria do Cloudflare, não do arquivo que acabou de subir. Por isso
# a verificação é opt-in e aponta para o host legado.
#   LEGACY_VERIFY_BASE=https://sh00110.hostgator.com.br/~usuario bash scripts/deploy.sh index
LEGACY_VERIFY_BASE="${LEGACY_VERIFY_BASE:-}"

upload() {
  local file="$1"   # caminho local relativo ao root
  local remote="$2" # ex: /index.html

  if [ ! -f "$ROOT/$file" ]; then
    echo "ERRO: $file não existe em $ROOT — abortando." >&2
    exit 1
  fi

  echo "→ $file"
  # Credenciais por stdin (-K -) em vez de --user: argumento de processo é
  # visível em `ps` para qualquer usuário da máquina.
  curl --ssl-reqd -s -T "$ROOT/$file" "ftp://$FTP_HOST$remote" -K - <<CURLCFG
user = "$FTP_USER:$FTP_PASS"
CURLCFG

  if [ -z "$LEGACY_VERIFY_BASE" ]; then
    echo "  ↑ enviado (verificação desligada — defina LEGACY_VERIFY_BASE para conferir)"
    return
  fi

  STATUS=$(curl -s "$LEGACY_VERIFY_BASE$remote" -o /dev/null -w "%{http_code}")
  if [ "$STATUS" = "200" ]; then
    echo "  ✓ HTTP 200 — $remote"
  else
    echo "  ✗ HTTP $STATUS — $remote (verifique manualmente)" >&2
    exit 1
  fi
}

TARGET="${1:-all}"

case "$TARGET" in
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
  agenda-data)
    upload "agenda-data.json" "/agenda-data.json"
    ;;
  logo)
    upload "logo.png" "/logo.png"
    ;;
  all)
    upload "index.html"          "/index.html"
    upload "relatorios.html"     "/relatorios.html"
    upload "multiasset.html"     "/multiasset.html"
    upload "multiasset-app.html" "/multiasset-app.html"
    upload "agenda-data.json"    "/agenda-data.json"
    upload "logo.png"            "/logo.png"
    ;;
  *)
    echo "Uso: bash scripts/deploy.sh [agenda-data|index|relatorios|multiasset|multiasset-app|logo|all]"
    exit 1
    ;;
esac

echo "Deploy concluído."
