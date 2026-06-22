# setup-cloudflare-purge-token.ps1 — grava CLOUDFLARE_PURGE_TOKEN no .env
# Uso: .\scripts\setup-cloudflare-purge-token.ps1 [-Token "cfut_..."] [-SkipBrowser]

param([string]$Token, [switch]$SkipBrowser)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT '.env'
$zoneSz = 'cfe602627bd2ef210d225ee9deeb45d9'
$zoneMulti = '8ca066c2dda0d90e475b5c9eb255cbfd'

Write-Host "`n=== CLOUDFLARE PURGE TOKEN ===" -ForegroundColor Cyan
Write-Host 'Permissao: Zone > Cache Purge > Purge'
Write-Host 'Zonas: szuchmacher.com.br + multi-assets.com'
Write-Host ''

if (-not $Token) {
    if (-not $SkipBrowser) {
        Start-Process 'https://dash.cloudflare.com/profile/api-tokens'
        Start-Sleep -Milliseconds 400
    }
    Write-Host @"
Crie um Custom Token:
  1. Permissions > Zone > Cache Purge > Purge
  2. Zone Resources > Include > Specific zone > szuchmacher.com.br
  3. Add more > multi-assets.com
  4. Continue > Create Token

Depois rode:
  .\scripts\setup-cloudflare-purge-token.ps1 -Token "SEU_TOKEN"
  .\scripts\purge-cloudflare.ps1
"@ -ForegroundColor Yellow
    exit 0
}

$Token = $Token.Trim().Trim('"')
if ($Token.Length -lt 20) { Write-Error 'Token invalido (muito curto).' }
if (-not (Test-Path $ENV_FILE)) { Write-Error ".env nao encontrado: $ENV_FILE" }

$headers = @{ Authorization = "Bearer $Token"; 'Content-Type' = 'application/json' }
$v = Invoke-RestMethod -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' -Headers $headers -Method GET
if (-not $v.success) { Write-Error 'Token rejeitado pela API Cloudflare.' }

$p1 = Invoke-RestMethod -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneSz/purge_cache" -Headers $headers -Body '{"purge_everything":true}'
if (-not $p1.success) { Write-Error 'Token valido mas sem permissao Cache Purge em szuchmacher.com.br' }

$p2 = Invoke-RestMethod -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneMulti/purge_cache" -Headers $headers -Body '{"purge_everything":true}'
if (-not $p2.success) { Write-Error 'Token sem permissao Cache Purge em multi-assets.com' }

$lines = Get-Content $ENV_FILE -Encoding UTF8
$found = $false
$newLines = foreach ($line in $lines) {
    if ($line -match '^CLOUDFLARE_PURGE_TOKEN=') {
        $found = $true
        "CLOUDFLARE_PURGE_TOKEN=$Token"
    } else { $line }
}
if (-not $found) { $newLines += "CLOUDFLARE_PURGE_TOKEN=$Token" }

Set-Content -Path $ENV_FILE -Value $newLines -Encoding UTF8
Write-Host 'CLOUDFLARE_PURGE_TOKEN gravado e purge testado OK (ambas zonas).' -ForegroundColor Green