# setup-cloudflare-token.ps1 — Abre o painel CF e grava token no .env
# Uso: .\scripts\setup-cloudflare-token.ps1 -Token "seu_token_aqui"

param(
    [Parameter(Mandatory = $false)]
    [string]$Token
)

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT '.env'

Write-Host "`n=== CLOUDFLARE TOKEN ===" -ForegroundColor Cyan
Write-Host "Permissao necessaria: Zone > Cache Purge > Purge"
Write-Host "Recurso: Include > szuchmacher.com.br"
Write-Host ""

if (-not $Token) {
    Start-Process 'https://dash.cloudflare.com/profile/api-tokens'
    Write-Host "Painel aberto. Crie o token e rode:"
    Write-Host '  .\scripts\setup-cloudflare-token.ps1 -Token "SEU_TOKEN"' -ForegroundColor Yellow
    exit 0
}

$Token = $Token.Trim().Trim('"')
if ($Token.Length -lt 20) { Write-Error 'Token parece invalido (muito curto).' }

if (-not (Test-Path $ENV_FILE)) { Write-Error ".env nao encontrado: $ENV_FILE" }

$lines = Get-Content $ENV_FILE -Encoding UTF8
$found = $false
$newLines = foreach ($line in $lines) {
    if ($line -match '^CLOUDFLARE_API_TOKEN=') {
        $found = $true
        "CLOUDFLARE_API_TOKEN=$Token"
    } else { $line }
}
if (-not $found) {
    $newLines += "CLOUDFLARE_API_TOKEN=$Token"
}
if (-not ($newLines -match '^CLOUDFLARE_ZONE_NAME=')) {
    $newLines += 'CLOUDFLARE_ZONE_NAME=szuchmacher.com.br'
}
if (-not ($newLines -match '^CLOUDFLARE_ZONE_ID=')) {
    $newLines += 'CLOUDFLARE_ZONE_ID=cfe602627bd2ef210d225ee9deeb45d9'
}

Set-Content -Path $ENV_FILE -Value $newLines -Encoding UTF8

# Remove token obsoleto das variaveis de ambiente do usuario (causava 401/Invalid)
[Environment]::SetEnvironmentVariable('CLOUDFLARE_API_TOKEN', $null, 'User')
$env:CLOUDFLARE_API_TOKEN = $null

Write-Host "Token gravado em .env" -ForegroundColor Green
& (Join-Path $PSScriptRoot 'purge-cloudflare.ps1') -Diagnose
Write-Host "`nSe diagnostico OK, rode: .\scripts\purge-cloudflare.ps1" -ForegroundColor Cyan