# setup-analytics.ps1 — Injeta Microsoft Clarity ID no .env e sincroniza sz-config.js
# Uso:
#   .\scripts\setup-analytics.ps1 -ClarityId xxxxxxxxxx
#   .\scripts\setup-analytics.ps1 -OpenDashboard   # abre clarity.microsoft.com

param(
    [string]$ClarityId,
    [switch]$OpenDashboard
)

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT '.env'

if ($OpenDashboard -or -not $ClarityId) {
    Write-Host "`nMicrosoft Clarity:" -ForegroundColor Cyan
    Write-Host "  https://clarity.microsoft.com/projects"
    Start-Process "https://clarity.microsoft.com/"
}

if (-not $ClarityId) {
    Write-Host "`nDepois rode:" -ForegroundColor Yellow
    Write-Host '  .\scripts\setup-analytics.ps1 -ClarityId xxxxxxxxxx'
    exit 0
}

$updates = @{ 'SZ_CLARITY_ID' = $ClarityId }

$lines = if (Test-Path $ENV_FILE) { Get-Content $ENV_FILE } else { @() }
$done = @{}
$newLines = foreach ($line in $lines) {
    $hit = $false
    foreach ($k in $updates.Keys) {
        if ($line -match "^$k=") {
            $done[$k] = $true
            "$k=$($updates[$k])"
            $hit = $true
            break
        }
    }
    if (-not $hit) { $line }
}
foreach ($k in $updates.Keys) {
    if (-not $done[$k]) { $newLines += "$k=$($updates[$k])" }
}
Set-Content -Path $ENV_FILE -Value $newLines -Encoding UTF8

Write-Host "`.env atualizado." -ForegroundColor Green
& (Join-Path $PSScriptRoot 'sync-sz-config.ps1')
Write-Host "Próximo: .\scripts\deploy-all.ps1" -ForegroundColor Cyan