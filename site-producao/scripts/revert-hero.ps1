# revert-hero.ps1 — volta ao hero clássico sem apagar arquivos editorial
# Uso: .\scripts\revert-hero.ps1
# Preview clássico sem deploy: https://szuchmacher.com.br/?hero=classic

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$CONFIG = Join-Path $ROOT 'assets\sz-config.js'

if (-not (Test-Path $CONFIG)) {
    Write-Error "Não encontrado: $CONFIG"
}

$content = Get-Content $CONFIG -Raw -Encoding UTF8
$newContent = $content -replace "window\.SZ_HERO_VARIANT\s*=\s*'editorial'", "window.SZ_HERO_VARIANT = 'classic'"

if ($content -eq $newContent) {
    if ($content -match "SZ_HERO_VARIANT\s*=\s*'classic'") {
        Write-Host "Hero já está em modo classic." -ForegroundColor Yellow
    } else {
        Write-Error "SZ_HERO_VARIANT não encontrado em sz-config.js"
    }
    return
}

Set-Content -Path $CONFIG -Value $newContent -Encoding UTF8 -NoNewline
Write-Host "SZ_HERO_VARIANT = 'classic' — hero editorial desativado." -ForegroundColor Green
Write-Host "Deploy: .\scripts\deploy-cloudflare.ps1" -ForegroundColor Cyan
Write-Host "Reativar editorial: altere para 'editorial' em assets\sz-config.js" -ForegroundColor DarkGray