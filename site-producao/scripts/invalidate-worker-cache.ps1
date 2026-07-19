# invalidate-worker-cache.ps1 - limpa caches KV do Worker sz-sites (sem API Purge)
# Uso: .\scripts\invalidate-worker-cache.ps1 [-RefreshMacro]

param([switch]$RefreshMacro)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WORKER = Join-Path (Split-Path -Parent $PSScriptRoot) 'cloudflare-workers\sz-sites'
$KV_ID  = 'fd40efe1057c4c54b3d33277d4665434'
$KEYS   = @('macro-api', 'macro-panel', 'market-data')

Push-Location $WORKER
try {
    foreach ($key in $KEYS) {
        Write-Host "  DEL KV  $key" -NoNewline
        npx wrangler kv key delete $key --namespace-id $KV_ID --remote 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green }
        else { Write-Host " SKIP" -ForegroundColor Yellow }
    }
}
finally {
    Pop-Location
}

if ($RefreshMacro) {
    Write-Host "  REFRESH macro_api.php?cron=1 ..." -ForegroundColor DarkCyan
    try {
        $r = Invoke-RestMethod -Uri 'https://szuchmacher.com.br/macro_api.php?cron=1' -TimeoutSec 180
        if ($r.ok) {
            Write-Host "  macro_api OK - $($r.generated_at) cache=$($r.cache)" -ForegroundColor Green
        } else {
            Write-Host "  macro_api falhou: $($r.error)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  macro_api timeout/erro: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "Cache KV invalidado." -ForegroundColor Green