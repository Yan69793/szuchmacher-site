# revert-design-sophistication.ps1
# Restaura o design anterior à sofisticação (2026-07-18).
# Não toca em outros arquivos do working tree.
#
# Uso:
#   .\scripts\revert-design-sophistication.ps1
#   .\scripts\revert-design-sophistication.ps1 -WhatIf
#   .\scripts\revert-design-sophistication.ps1 -PreferGit

param(
    [switch]$WhatIf,
    [switch]$PreferGit
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$SITE_GIT = Split-Path -Parent $ROOT
$BASE = Join-Path $ROOT '_arquivo\design-baseline-20260718'
$TAG = 'design-pre-sophistication-20260718'

$relPaths = @(
    'assets\sz-design.css',
    'index.html',
    # ebook.html saiu da lista em 2026-07-18: reverter o design nao deve desfazer
    # a remocao da pagina, que foi decisao de produto separada.
    'multiasset-app.html',
    'multiasset.html',
    'CLAUDE.md'
)

function Restore-FromBaseline {
    if (-not (Test-Path $BASE)) {
        throw "Baseline em disco ausente: $BASE"
    }
    foreach ($rel in $relPaths) {
        $src = Join-Path $BASE (Split-Path $rel -Leaf)
        $dst = Join-Path $ROOT $rel
        if (-not (Test-Path $src)) {
            Write-Host "  SKIP  baseline missing: $rel" -ForegroundColor Yellow
            continue
        }
        if ($WhatIf) {
            Write-Host "  WHATIF  baseline -> $rel" -ForegroundColor DarkGray
            continue
        }
        Copy-Item $src $dst -Force
        Write-Host "  RESTORED (arquivo)  $rel" -ForegroundColor Green
    }
}

function Restore-FromGit {
    Push-Location $SITE_GIT
    try {
        git rev-parse --verify $TAG 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Tag git $TAG nao existe"
        }
        $gitPaths = $relPaths | ForEach-Object { 'site-producao/' + ($_ -replace '\\', '/') }
        if ($WhatIf) {
            Write-Host "  WHATIF  git restore --source=$TAG -- $($gitPaths -join ' ')" -ForegroundColor DarkGray
            return
        }
        git restore --source=$TAG -- @gitPaths
        if ($LASTEXITCODE -ne 0) { throw "git restore falhou" }
        foreach ($rel in $relPaths) {
            Write-Host "  RESTORED (git:$TAG)  $rel" -ForegroundColor Green
        }
    } finally {
        Pop-Location
    }
}

Write-Host "`n=== REVERT design sophistication ===" -ForegroundColor Cyan

$usedGit = $false
if ($PreferGit) {
    try {
        Restore-FromGit
        $usedGit = $true
    } catch {
        Write-Host "  Git falhou ($($_.Exception.Message)); caindo para _arquivo" -ForegroundColor Yellow
    }
}

if (-not $usedGit) {
    # Tenta git primeiro (fonte canônica), depois disco
    try {
        Restore-FromGit
        $usedGit = $true
    } catch {
        Write-Host "  Git indisponivel ($($_.Exception.Message)); usando _arquivo" -ForegroundColor DarkGray
        Restore-FromBaseline
    }
}

Write-Host "`nLocal restaurado ao pre-sofisticacao." -ForegroundColor Yellow
Write-Host "Producao so muda apos: .\scripts\deploy-cloudflare.ps1"
Write-Host "Reaplicar sofisticação: .\scripts\apply-design-sophistication.ps1"
Write-Host "Ou git: git restore --source=$TAG -- site-producao/..."
