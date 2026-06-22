# build-cloudflare-public.ps1 — monta public/ do Worker sz-sites
# Uso: .\scripts\build-cloudflare-public.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$OUT  = Join-Path $ROOT 'cloudflare-workers\sz-sites\public'
$SZ   = Join-Path $OUT 'sz'
$MULTI = Join-Path $OUT 'multi'

function Reset-Dir([string]$Path) {
    if (Test-Path $Path) { Remove-Item $Path -Recurse -Force }
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Copy-IfExists([string]$Src, [string]$Dst) {
    if (-not (Test-Path $Src)) {
        Write-Host "  SKIP   $Src" -ForegroundColor Yellow
        return $false
    }
    $parent = Split-Path $Dst -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item $Src $Dst -Force
    Write-Host "  COPY   $(Split-Path $Src -Leaf) -> $Dst" -ForegroundColor DarkGray
    return $true
}

Write-Host "`n=== BUILD CLOUDFLARE PUBLIC ===" -ForegroundColor Cyan
Reset-Dir $OUT
New-Item -ItemType Directory -Path $SZ -Force | Out-Null
New-Item -ItemType Directory -Path $MULTI -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $SZ 'assets') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $MULTI 'assets') -Force | Out-Null

Write-Host "`n-- szuchmacher.com.br --" -ForegroundColor Green
$szFiles = @(
    'index.html', 'relatorios.html', 'honorarios.html', 'assinatura.html',
    'privacidade.html', 'radar-roic.html', 'agenda-data.json', 'macro_data.json',
    'relatorio_cache.json', 'og-cover.jpg', 'logo.png'
)
foreach ($f in $szFiles) { Copy-IfExists (Join-Path $ROOT $f) (Join-Path $SZ $f) | Out-Null }

$szAssets = @('sz-config.js', 'sz-design.css', 'sz-site.js', 'macro-panel.js', 'hero-editorial.css', 'hero-editorial.js', 'hero-switch.js')
foreach ($f in $szAssets) {
    Copy-IfExists (Join-Path $ROOT "assets\$f") (Join-Path $SZ "assets\$f") | Out-Null
}

Write-Host "`n-- multi-assets.com --" -ForegroundColor Green
Copy-IfExists (Join-Path $ROOT 'multiasset-app.html') (Join-Path $MULTI 'index.html') | Out-Null
Copy-IfExists (Join-Path $ROOT 'consultoria.html') (Join-Path $MULTI 'consultoria.html') | Out-Null
Copy-IfExists (Join-Path $ROOT 'consultoria.html') (Join-Path $MULTI 'consultoria') | Out-Null
Copy-IfExists (Join-Path $ROOT 'macro_data.json') (Join-Path $MULTI 'macro_data.json') | Out-Null
Copy-IfExists (Join-Path $ROOT 'og-cover.jpg') (Join-Path $MULTI 'og-cover.jpg') | Out-Null
Copy-IfExists (Join-Path $ROOT 'assets\sz-config.js') (Join-Path $MULTI 'assets\sz-config.js') | Out-Null

Write-Host "`nBuild concluido: $OUT" -ForegroundColor Green