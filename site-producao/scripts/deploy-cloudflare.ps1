# deploy-cloudflare.ps1 — publica szuchmacher + multi-assets no Cloudflare Workers
# Uso: .\scripts\deploy-cloudflare.ps1 [-DryRun]

param([switch]$DryRun)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$WORKER = Join-Path $ROOT 'cloudflare-workers\sz-sites'
$BUILD = Join-Path $PSScriptRoot 'build-cloudflare-public.ps1'
$CONFIG = Join-Path $ROOT 'config.php'

Write-Host "`n=== DEPLOY CLOUDFLARE (sz-sites) ===" -ForegroundColor Cyan

& $BUILD

Push-Location $WORKER
try {
    if (-not (Test-Path 'node_modules')) {
        Write-Host "Instalando dependencias..." -ForegroundColor DarkGray
        npm install 2>&1 | Out-Host
    }

    if ($DryRun) {
        npx wrangler deploy --dry-run 2>&1 | Out-Host
        exit $LASTEXITCODE
    }

    npx wrangler deploy 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $secretScript = Join-Path $PSScriptRoot 'set-openrouter-secret.ps1'
    if (Test-Path $secretScript) {
        & $secretScript
    }

    Write-Host "`n=== INVALIDAR CACHE KV ===" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'invalidate-worker-cache.ps1') -RefreshMacro

    Write-Host "`nDeploy Cloudflare concluido." -ForegroundColor Green
    Write-Host "Validar:" -ForegroundColor DarkGray
    Write-Host "  https://szuchmacher.com.br/"
    Write-Host "  https://multi-assets.com/"
    Write-Host "  https://multi-assets.com/consultoria"
    Write-Host "  https://szuchmacher.com.br/assets/macro.php"
    Write-Host "  https://multi-assets.com/prices.php"
}
finally {
    Pop-Location
}