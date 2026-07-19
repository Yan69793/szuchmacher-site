# apply-design-sophistication.ps1
# Reaplica o snapshot de sofisticação (2026-07-18) a partir de _arquivo.
#
# Uso:
#   .\scripts\apply-design-sophistication.ps1
#   .\scripts\apply-design-sophistication.ps1 -WhatIf

param([switch]$WhatIf)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$SOF  = Join-Path $ROOT '_arquivo\design-sophistication-20260718'

$files = @(
    'assets\sz-design.css',
    'index.html',
    # ebook.html saiu da lista em 2026-07-18: a pagina foi descontinuada e passou
    # a responder 301 no Worker. Reaplicar o snapshot a ressuscitaria no disco.
    'multiasset-app.html',
    'multiasset.html',
    'CLAUDE.md'
)

if (-not (Test-Path $SOF)) {
    throw "Snapshot de sofisticacao nao encontrado: $SOF"
}

Write-Host "`n=== APPLY design sophistication 2026-07-18 ===" -ForegroundColor Cyan

foreach ($rel in $files) {
    $src = Join-Path $SOF (Split-Path $rel -Leaf)
    $dst = Join-Path $ROOT $rel
    if (-not (Test-Path $src)) {
        Write-Host "  SKIP  missing snapshot: $rel" -ForegroundColor Yellow
        continue
    }
    if ($WhatIf) {
        Write-Host "  WHATIF  $src -> $dst" -ForegroundColor DarkGray
        continue
    }
    Copy-Item $src $dst -Force
    Write-Host "  APPLIED  $rel" -ForegroundColor Green
}

Write-Host "`nLocal com sofisticação. Deploy se quiser ir ao ar:" -ForegroundColor Yellow
Write-Host "  .\scripts\deploy-cloudflare.ps1"
Write-Host "`nPara reverter:" -ForegroundColor DarkGray
Write-Host "  .\scripts\revert-design-sophistication.ps1"
