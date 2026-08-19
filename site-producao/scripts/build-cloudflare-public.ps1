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

# Arquivos que sumiram do source durante o build. O build antigo so imprimia
# SKIP em amarelo e seguia, entao um arquivo movido ou renomeado virava 404 em
# producao sem ninguem perceber. Foi assim que sitemap.xml, og-cover.jpg,
# logo.png, macro_data.json, relatorio_cache.json e a consultoria.html cairam
# em 19/07/2026. Agora o build falha e o deploy nao chega a rodar.
$script:Faltando = @()

function Copy-IfExists([string]$Src, [string]$Dst) {
    if (-not (Test-Path $Src)) {
        Write-Host "  SKIP   $Src" -ForegroundColor Yellow
        $script:Faltando += $Src
        return $false
    }
    $parent = Split-Path $Dst -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item $Src $Dst -Force
    Write-Host "  COPY   $(Split-Path $Src -Leaf) -> $Dst" -ForegroundColor DarkGray
    return $true
}

function Copy-Tree([string]$Src, [string]$Dst, [string]$Filter) {
    if (-not (Test-Path $Src)) {
        Write-Host "  SKIP   $Src" -ForegroundColor Yellow
        $script:Faltando += "$Src ($Filter)"
        return $false
    }
    if (-not (Test-Path $Dst)) { New-Item -ItemType Directory -Path $Dst -Force | Out-Null }
    # @() e obrigatorio: com um unico resultado o Get-ChildItem devolve escalar,
    # e sob Set-StrictMode o .Count abaixo lanca excecao
    $itens = @(Get-ChildItem -Path $Src -Filter $Filter -File)
    foreach ($i in $itens) {
        Copy-Item $i.FullName (Join-Path $Dst $i.Name) -Force
    }
    Write-Host "  COPY   $($itens.Count) x $Filter -> $Dst" -ForegroundColor DarkGray
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
    'privacidade.html', 'sitemap.xml', 'agenda-data.json', 'macro_data.json',
    'relatorio_cache.json',
    'og-cover.jpg', 'logo.png',
    'favicon.ico', 'favicon.svg', 'apple-touch-icon.png'
)
foreach ($f in $szFiles) { Copy-IfExists (Join-Path $ROOT $f) (Join-Path $SZ $f) | Out-Null }

$szAssets = @('sz-config.js', 'sz-design.css', 'sz-imagery.css', 'sz-site.js', 'macro-panel.js')
foreach ($f in $szAssets) {
    Copy-IfExists (Join-Path $ROOT "assets\$f") (Join-Path $SZ "assets\$f") | Out-Null
}

# Imagética institucional (assets/img/*.webp). Diretorio inteiro: a serie cresce
# sem exigir edicao desta allowlist. Os PNG originais ficam fora da arvore, em
# ../_fontes-img, e nao sao publicados.
Copy-Tree (Join-Path $ROOT 'assets\img') (Join-Path $SZ 'assets\img') '*.webp' | Out-Null

Write-Host "`n-- multi-assets.com --" -ForegroundColor Green
Copy-IfExists (Join-Path $ROOT 'multiasset-app.html') (Join-Path $MULTI 'index.html') | Out-Null
Copy-IfExists (Join-Path $ROOT 'consultoria.html') (Join-Path $MULTI 'consultoria.html') | Out-Null
Copy-IfExists (Join-Path $ROOT 'consultoria.html') (Join-Path $MULTI 'consultoria') | Out-Null
Copy-IfExists (Join-Path $ROOT 'macro_data.json') (Join-Path $MULTI 'macro_data.json') | Out-Null
Copy-IfExists (Join-Path $ROOT 'og-cover.jpg') (Join-Path $MULTI 'og-cover.jpg') | Out-Null
Copy-IfExists (Join-Path $ROOT 'assets\sz-config.js') (Join-Path $MULTI 'assets\sz-config.js') | Out-Null
# Politica de privacidade. multi-assets.com coleta e-mail no popup do simulador e
# ate 26/07/2026 respondia 404 em /privacidade.html e /privacidade: coleta sem
# aviso ao titular. Copiada nas duas formas, com e sem extensao, igual consultoria.
Copy-IfExists (Join-Path $ROOT 'privacidade.html') (Join-Path $MULTI 'privacidade.html') | Out-Null
Copy-IfExists (Join-Path $ROOT 'privacidade.html') (Join-Path $MULTI 'privacidade') | Out-Null

# Pagina de metodologia — fontes, calibracao, limitacoes. Copiada nas duas formas.
Copy-IfExists (Join-Path $ROOT 'metodologia.html') (Join-Path $MULTI 'metodologia.html') | Out-Null
Copy-IfExists (Join-Path $ROOT 'metodologia.html') (Join-Path $MULTI 'metodologia') | Out-Null

# Sitemap multi-assets.com. Criado em 2026-08-09, antes o dominio respondia 404.
Copy-IfExists (Join-Path $ROOT 'sitemap-multi.xml') (Join-Path $MULTI 'sitemap.xml') | Out-Null

# Imagética institucional (assets/img/*.webp), tambem usada em consultoria.html.
# Mesmo diretorio inteiro do bloco sz, sem allowlist propria.
Copy-Tree (Join-Path $ROOT 'assets\img') (Join-Path $MULTI 'assets\img') '*.webp' | Out-Null

# Demo em video do painel (mp4 + webm + poster). Gerada por scripts\encodar-demo.ps1
Copy-Tree (Join-Path $ROOT 'assets\video') (Join-Path $MULTI 'assets\video') '*.mp4'  | Out-Null
Copy-Tree (Join-Path $ROOT 'assets\video') (Join-Path $MULTI 'assets\video') '*.webm' | Out-Null
Copy-Tree (Join-Path $ROOT 'assets\video') (Join-Path $MULTI 'assets\video') '*.jpg'  | Out-Null

# Hero ambiente (assets/media): video de fundo + stills webp. Servido em multi-assets.com.
# *.jpg fica de fora: o unico jpg (hero-desk-night-poster.jpg) nao e referenciado.
Copy-Tree (Join-Path $ROOT 'assets\media') (Join-Path $MULTI 'assets\media') '*.mp4'  | Out-Null
Copy-Tree (Join-Path $ROOT 'assets\media') (Join-Path $MULTI 'assets\media') '*.webp' | Out-Null
foreach ($f in @('favicon.ico', 'favicon.svg', 'apple-touch-icon.png')) {
    Copy-IfExists (Join-Path $ROOT $f) (Join-Path $MULTI $f) | Out-Null
}

# --- Verificacao de saida -----------------------------------------------------
# Confere o resultado em public/, nao a lista de copias. Pega tambem o caso em
# que a copia falhou sem erro, que a contagem de SKIP sozinha nao pegaria.
$obrigatorios = @(
    'sz\index.html', 'sz\relatorios.html', 'sz\honorarios.html', 'sz\assinatura.html',
    'sz\privacidade.html', 'sz\sitemap.xml', 'sz\og-cover.jpg',
    'sz\logo.png', 'sz\macro_data.json', 'sz\agenda-data.json',
    'sz\relatorio_cache.json',
    'sz\assets\sz-config.js', 'sz\assets\sz-design.css',
    'multi\index.html', 'multi\consultoria.html', 'multi\consultoria',
    'multi\privacidade.html', 'multi\privacidade',
    'multi\metodologia.html', 'multi\metodologia',
    'multi\sitemap.xml',
    'multi\og-cover.jpg', 'multi\assets\sz-config.js'
)
$ausentes = @($obrigatorios | Where-Object { -not (Test-Path (Join-Path $OUT $_)) })

if ($script:Faltando.Count -gt 0 -or $ausentes.Count -gt 0) {
    Write-Host "`n=== BUILD REPROVADO ===" -ForegroundColor Red
    foreach ($f in $script:Faltando) { Write-Host "  fonte ausente:  $f" -ForegroundColor Red }
    foreach ($f in $ausentes)        { Write-Host "  saida ausente:  $f" -ForegroundColor Red }
    throw "Build incompleto. Deploy abortado para nao publicar 404 em producao."
}

Write-Host "`n$($obrigatorios.Count) arquivos obrigatorios conferidos em public/." -ForegroundColor DarkGray
Write-Host "Build concluido: $OUT" -ForegroundColor Green