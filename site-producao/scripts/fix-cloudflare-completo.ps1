# fix-cloudflare-completo.ps1 — NS via HostGator (NEWFOLD) + token purge Cloudflare
# Uso: .\scripts\fix-cloudflare-completo.ps1

param([switch]$SkipBrowser)

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
$DOMAIN = 'szuchmacher.com.br'
$ZONE_ID = 'cfe602627bd2ef210d225ee9deeb45d9'
$NS1 = 'denver.ns.cloudflare.com'
$NS2 = 'lola.ns.cloudflare.com'

$envFile = Join-Path $ROOT '.env'
if (Test-Path $envFile) {
    $zline = Get-Content $envFile | Where-Object { $_ -match '^CLOUDFLARE_ZONE_ID=' } | Select-Object -First 1
    if ($zline) { $ZONE_ID = (($zline -split '=', 2)[1]).Trim() }
}

Write-Host "`n=== FIX CLOUDFLARE (HostGator + token) ===" -ForegroundColor Cyan
Write-Host "Domínio: $DOMAIN (provedor NEWFOLD/HostGator no Registro.br)"
Write-Host "NS alvo Cloudflare: $NS1 / $NS2"
Write-Host "NS atual: evelyn.ns.cloudflare.com / randy.ns.cloudflare.com`n"

Set-Clipboard -Value "$NS1`n$NS2"
Write-Host "NS copiados para a área de transferência." -ForegroundColor Green

if (-not $SkipBrowser) {
    Start-Process 'https://cliente.hostgator.com.br/sites'
    Start-Sleep -Milliseconds 600
    Start-Process 'https://dash.cloudflare.com/profile/api-tokens'
    Start-Sleep -Milliseconds 600
    Start-Process "https://dash.cloudflare.com/$ZONE_ID/$DOMAIN"
}

Write-Host @"

HOSTGATOR (~3 min) — DNS NÃO altera no Registro.br quando provedor = NEWFOLD (43):
  1. https://cliente.hostgator.com.br → login
  2. Menu lateral: Domínios
  3. $DOMAIN → Configurar domínio
  4. Alterar plataforma
  5. Outra plataforma de hospedagem
  6. Servidor 1: $NS1
     Servidor 2: $NS2
  7. Configurar

CLOUDFLARE TOKEN (~1 min):
  1. Create Token → Custom
  2. Zone → Cache Purge → Purge
  3. Include → $DOMAIN
  4. .\scripts\setup-cloudflare-token.ps1 -Token "SEU_TOKEN"

Validar:
  .\scripts\purge-cloudflare.ps1 -Diagnose
  .\scripts\purge-cloudflare.ps1

"@ -ForegroundColor Yellow