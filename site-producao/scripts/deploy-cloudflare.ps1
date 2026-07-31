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

    # 'Continue' so em volta das chamadas ao wrangler. Com 'Stop', qualquer linha que
    # o wrangler escreve em stderr vira NativeCommandError terminante e derruba o
    # script depois do upload, pulando a invalidacao de cache KV. E o wrangler usa
    # stderr para aviso, nao so para erro: em 30/07/2026 os avisos de 'workers_dev' e
    # de 'preview_urls' fizeram exatamente isso, com o deploy ja concluido. Quem decide
    # sucesso ou falha aqui e $LASTEXITCODE, que ja era conferido logo abaixo.
    $eapAnterior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    if ($DryRun) {
        npx wrangler deploy --dry-run 2>&1 | Out-Host
        $ErrorActionPreference = $eapAnterior
        exit $LASTEXITCODE
    }

    npx wrangler deploy 2>&1 | Out-Host
    $codigoDeploy = $LASTEXITCODE
    $ErrorActionPreference = $eapAnterior
    if ($codigoDeploy -ne 0) { exit $codigoDeploy }

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