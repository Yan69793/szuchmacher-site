# setup-cloudflare-dns-token.ps1 — grava CLOUDFLARE_DNS_TOKEN no .env
# Uso: .\scripts\setup-cloudflare-dns-token.ps1 [-Token "cfut_..."]

param([string]$Token, [switch]$SkipBrowser)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT '.env'

Write-Host "`n=== CLOUDFLARE DNS TOKEN ===" -ForegroundColor Cyan
Write-Host "Permissoes: Zone > DNS > Edit"
Write-Host "Zonas: szuchmacher.com.br + multi-assets.com"
Write-Host ""

if (-not $Token) {
    if (-not $SkipBrowser) {
        Start-Process 'https://dash.cloudflare.com/profile/api-tokens'
        Start-Sleep -Milliseconds 400
        Start-Process 'https://dash.cloudflare.com/profile/api-tokens?template=editZoneDNS'
    }
    Write-Host @"
Crie o token (template Edit zone DNS):
  1. Zone Resources > Include > Specific zone > szuchmacher.com.br
  2. Add more > multi-assets.com
  3. Continue > Create Token

Depois rode:
  .\scripts\setup-cloudflare-dns-token.ps1 -Token "SEU_TOKEN"
  .\scripts\cleanup-dns-cloudflare.ps1
  .\scripts\attach-worker-domains.ps1
"@ -ForegroundColor Yellow
    exit 0
}

$Token = $Token.Trim().Trim('"')
if ($Token.Length -lt 20) { Write-Error 'Token invalido (muito curto).' }
if (-not (Test-Path $ENV_FILE)) { Write-Error ".env nao encontrado: $ENV_FILE" }

$lines = Get-Content $ENV_FILE -Encoding UTF8
$found = $false
$newLines = foreach ($line in $lines) {
    if ($line -match '^CLOUDFLARE_DNS_TOKEN=') {
        $found = $true
        "CLOUDFLARE_DNS_TOKEN=$Token"
    } else { $line }
}
if (-not $found) { $newLines += "CLOUDFLARE_DNS_TOKEN=$Token" }

Set-Content -Path $ENV_FILE -Value $newLines -Encoding UTF8
Write-Host "CLOUDFLARE_DNS_TOKEN gravado em .env" -ForegroundColor Green

# teste rapido
$headers = @{ Authorization = "Bearer $Token"; 'Content-Type' = 'application/json' }
try {
    $r = Invoke-RestMethod -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' -Headers $headers -Method GET
    if ($r.success) { Write-Host "Token valido. Proximo: .\scripts\cleanup-dns-cloudflare.ps1" -ForegroundColor Green }
    else { Write-Host "Token rejeitado pela API." -ForegroundColor Red; exit 1 }
} catch {
    Write-Host "Falha ao verificar token: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}