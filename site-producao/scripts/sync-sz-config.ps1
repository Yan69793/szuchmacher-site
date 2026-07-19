# sync-sz-config.ps1 — Injeta IDs do .env em assets/sz-config.js
# Uso: preencha no .env e rode .\scripts\sync-sz-config.ps1

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT '.env'
$CONFIG = Join-Path $ROOT 'assets\sz-config.js'

if (-not (Test-Path $ENV_FILE)) { Write-Error ".env não encontrado em $ENV_FILE" }
if (-not (Test-Path $CONFIG)) { Write-Error "sz-config.js não encontrado em $CONFIG" }

$map = @{
    'SZ_CLARITY_ID'       = 'window.SZ_CLARITY_ID'
    'SZ_STRIPE_CARTA_URL' = 'window.SZ_STRIPE_CARTA_URL'
    'SZ_STRIPE_PRO_URL'   = 'window.SZ_STRIPE_PRO_URL'
}

$values = @{}
Get-Content $ENV_FILE | Where-Object { $_ -match '^[A-Z_]+=.+' } | ForEach-Object {
    $k, $v = $_ -split '=', 2
    if ($map.ContainsKey($k) -and $v) { $values[$k] = $v }
}

if ($values.Count -eq 0) {
    Write-Host 'Nenhuma chave SZ_* no .env — nada a sincronizar.' -ForegroundColor Yellow
    exit 0
}

$content = Get-Content $CONFIG -Raw -Encoding UTF8
foreach ($k in $values.Keys) {
    $jsVar = $map[$k]
    $val = $values[$k].Replace("'", "\'")
    $pattern = [regex]::Escape($jsVar) + "\s*=\s*'[^']*';"
    $replacement = "$jsVar = '$val';"
    if ($content -match $pattern) {
        $content = $content -replace $pattern, $replacement
        Write-Host "  OK $k" -ForegroundColor Green
    } else {
        Write-Host "  SKIP $k (variável não encontrada no JS)" -ForegroundColor Yellow
    }
}

Set-Content -Path $CONFIG -Value $content -Encoding UTF8 -NoNewline
Write-Host "sz-config.js atualizado. Rode deploy-all.ps1 para publicar." -ForegroundColor Cyan