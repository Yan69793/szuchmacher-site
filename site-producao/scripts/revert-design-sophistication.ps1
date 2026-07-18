# revert-design-sophistication.ps1
# Restaura o design anterior à rodada de sofisticação (2026-07-18).
# Não toca em outros arquivos do working tree.
#
# Uso:
#   .\scripts\revert-design-sophistication.ps1
#   .\scripts\revert-design-sophistication.ps1 -WhatIf
#   .\scripts\revert-design-sophistication.ps1 -AlsoFromGit   # tenta git restore do commit pai se existir tag/ref

param(
    [switch]$WhatIf,
    [switch]$AlsoFromGit
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$BASE = Join-Path $ROOT '_arquivo\design-baseline-20260718'

$files = @(
    'assets\sz-design.css',
    'index.html',
    'ebook.html',
    'multiasset-app.html',
    'multiasset.html',
    'CLAUDE.md'
)

if (-not (Test-Path $BASE)) {
    throw "Baseline nao encontrado: $BASE"
}

Write-Host "`n=== REVERT design sophistication -> baseline 2026-07-18 ===" -ForegroundColor Cyan

foreach ($rel in $files) {
    $src = Join-Path $BASE (Split-Path $rel -Leaf)
    $dst = Join-Path $ROOT $rel
    if (-not (Test-Path $src)) {
        Write-Host "  SKIP  missing baseline: $rel" -ForegroundColor Yellow
        continue
    }
    if ($WhatIf) {
        Write-Host "  WHATIF  $src -> $dst" -ForegroundColor DarkGray
        continue
    }
    $parent = Split-Path $dst -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item $src $dst -Force
    Write-Host "  RESTORED  $rel" -ForegroundColor Green
}

if ($AlsoFromGit) {
    Push-Location (Split-Path -Parent $ROOT)
    try {
        $paths = $files | ForEach-Object { "site-producao/$_" -replace '\\','/' }
        # Prefer tagged parent if present
        $ref = 'design-pre-sophistication-20260718'
        $has = git rev-parse --verify $ref 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`nGit restore from tag $ref" -ForegroundColor Cyan
            git restore --source=$ref -- $paths
        } else {
            Write-Host "`nTag $ref ausente — baseline em _arquivo e suficiente." -ForegroundColor DarkGray
        }
    } finally {
        Pop-Location
    }
}

Write-Host "`nLocal restaurado. Producao so muda apos deploy:" -ForegroundColor Yellow
Write-Host "  .\scripts\deploy-cloudflare.ps1"
Write-Host "`nPara reaplicar a sofisticação:" -ForegroundColor DarkGray
Write-Host "  .\scripts\apply-design-sophistication.ps1"
