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

# Carimbo de versao por hash de conteudo. F5 cache-busting: o HTML referencia
# /assets/X.css?v=<hash8>, onde hash e dos primeiros 8 hex do SHA256 do proprio
# asset em public/. Quando o asset muda, a URL muda, e o navegador refaz o fetch
# em vez de servir a copia antiga do cache. Quando nao muda, a URL fica estavel e
# o cache e reaproveitado. Elimina o ?v= manual e a inconsistencia de versoes
# esquecidas. Se o HTML referencia um asset que nao existe em public/, o build
# falha, o mesmo tratamento de arquivo sumido do source.
function Add-VersionStamps([string]$SiteDir, [string]$AssetsDir) {
    $htmls = @(Get-ChildItem -Path $SiteDir -File | Where-Object {
        $_.Extension -eq '.html' -or $_.Extension -eq ''
    })
    foreach ($h in $htmls) {
        $content = [IO.File]::ReadAllText($h.FullName)
        $pattern = '/assets/([A-Za-z0-9_.-]+\.(?:css|js))(\?[^"'']*)?'
        if ([regex]::IsMatch($content, $pattern)) {
            $hashCache = @{}
            $new = [regex]::Replace($content, $pattern, {
                param($m)
                $name = $m.Groups[1].Value
                if (-not $hashCache.ContainsKey($name)) {
                    $asset = Join-Path $AssetsDir $name
                    if (-not (Test-Path $asset)) {
                        throw "Asset referenciado em HTML nao existe em public/: $name ($($h.FullName))"
                    }
                    $hashCache[$name] = (Get-FileHash $asset -Algorithm SHA256).Hash.Substring(0, 8)
                }
                "/assets/$name`?v=$($hashCache[$name])"
            })
            if ($new -ne $content) {
                [IO.File]::WriteAllText($h.FullName, $new)
                Write-Host "  STAMP  $($h.Name)" -ForegroundColor DarkGray
            }
        }
    }
}

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

# Guarda do data-ev. A Fase B do CSP trocou os handlers inline do
# multiasset-app.html por delegacao via data-ev, mas um descasamento de chave
# (HTML `eN` x mapa `N`) deixou os 109 handlers mortos sem erro visivel.
# Este check confere, antes do deploy, que todo data-ev="eN" do HTML tem um
# handler 'N' no mapa EVENTS do multi-app-2.js e vice-versa. Descasar reprova
# o build e o deploy nao roda, igual ao tratamento de arquivo sumido.
function Test-MultiDataEv([string]$HtmlPath, [string]$JsPath) {
    $html = [IO.File]::ReadAllText($HtmlPath)
    $js   = [IO.File]::ReadAllText($JsPath)
    $htmlKeys = @{}
    foreach ($m in [regex]::Matches($html, 'data-ev="(e\d+)"')) {
        $htmlKeys[$m.Groups[1].Value] = $true
    }
    $jsKeys = @{}
    foreach ($m in [regex]::Matches($js, "(?m)^\s*'(\d+)':\s*\{\s*t:")) {
        $jsKeys[$m.Groups[1].Value] = $true
    }
    $problemas = @()
    foreach ($hk in $htmlKeys.Keys) {
        $n = $hk.Substring(1)
        if (-not $jsKeys.ContainsKey($n)) { $problemas += "HTML data-ev '$hk' sem handler '$n' no EVENTS" }
    }
    foreach ($jk in $jsKeys.Keys) {
        $e = "e$jk"
        if (-not $htmlKeys.ContainsKey($e)) { $problemas += "EVENTS '$jk' sem data-ev '$e' no HTML" }
    }
    return $problemas
}

# Guarda do class fundido. O transform da Fase B (estilo inline -> classes
# utilitarias) colou `class=` na tag ou no atributo anterior em dezenas de
# pontos do multiasset-app.html: `<pclass=`, `<divclass=`, `href="..."class=`.
# Isso vira tag desconhecida para o parser e a classe cai, quebrando layout
# sem 404 nem erro de console. Este check reprova o build se achar a cola,
# no mesmo padrao de arquivo sumido e do descasamento data-ev.
function Test-FusedAttrs([string]$HtmlPath) {
    $html = [IO.File]::ReadAllText($HtmlPath)
    $problemas = @()
    foreach ($m in [regex]::Matches($html, '<([a-z][a-z0-9]*)class=')) {
        $problemas += "tag '<$($m.Groups[1].Value)>' fundida com class"
    }
    foreach ($m in [regex]::Matches($html, '"class=')) {
        $problemas += 'atributo fundido com class (valor"class=)'
    }
    return $problemas
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
    'favicon.ico', 'favicon.svg', 'apple-touch-icon.png',
    # Trajetoria profissional. Fora do menu e com noindex: acesso so por link
    # direto enviado a headhunter ou contraparte. Os dois PDF sao o anexo que a
    # pagina oferece para download, servidos do mesmo diretorio.
    'cv.html', 'Yan_Szuchmacher_CV_PT.pdf', 'Yan_Szuchmacher_CV_EN.pdf'
)
foreach ($f in $szFiles) { Copy-IfExists (Join-Path $ROOT $f) (Join-Path $SZ $f) | Out-Null }

# Estilos e scripts que sairam dos blocos inline de cada pagina na Fase A do CSP.
# Se um arquivo novo entrar, precisa entrar aqui: o HTML referencia em /assets/,
# o build falha se o asset nao existir em public/. Ordem e irrelevante.
$szAssets = @(
    'sz-config.js', 'sz-design.css', 'sz-imagery.css', 'sz-site.js', 'macro-panel.js',
    # Fase A: CSS extraido dos <style> inline por pagina
    'sz-index-1.js', 'sz-relatorios-1.js', 'sz-relatorios-2.js', 'sz-relatorios-3.js',
    'sz-relatorios.css', 'sz-honorarios.css', 'sz-assinatura-1.js', 'sz-assinatura.css',
    'sz-privacidade.css', 'sz-cv.css', 'sz-metodologia-1.js', 'sz-metodologia.css',
    'sz-consultoria.css', 'sz-utilities.css'
)
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
# Fase A do CSP: as paginas compartilhadas (consultoria, metodologia, privacidade)
# tiveram os estilos e scripts inline externados. O mesmo HTML serve os dois
# dominios, entao os assets precisam existir nos dois lados, senao o Add-VersionStamps
# do multi falha (referencia /assets/ sem arquivo correspondente em public/).
Copy-IfExists (Join-Path $ROOT 'assets\sz-consultoria.css') (Join-Path $MULTI 'assets\sz-consultoria.css') | Out-Null
Copy-IfExists (Join-Path $ROOT 'assets\sz-metodologia.css') (Join-Path $MULTI 'assets\sz-metodologia.css') | Out-Null
Copy-IfExists (Join-Path $ROOT 'assets\sz-metodologia-1.js') (Join-Path $MULTI 'assets\sz-metodologia-1.js') | Out-Null
Copy-IfExists (Join-Path $ROOT 'assets\sz-privacidade.css') (Join-Path $MULTI 'assets\sz-privacidade.css') | Out-Null
Copy-IfExists (Join-Path $ROOT 'assets\sz-utilities.css') (Join-Path $MULTI 'assets\sz-utilities.css') | Out-Null
# Fase B do CSP: o multiasset-app.html externalizou o bloco <style> e os 3
# scripts executaveis, e os atributos style viraram classes utilitarias.
# O index.html do multi referencia estes 5 assets, entao precisam existir em
# public/multi/assets/ senao o Add-VersionStamps falha na Fase A/B.
Copy-IfExists (Join-Path $ROOT 'assets\multi-app.css') (Join-Path $MULTI 'assets\multi-app.css') | Out-Null
Copy-IfExists (Join-Path $ROOT 'assets\multi-utilities.css') (Join-Path $MULTI 'assets\multi-utilities.css') | Out-Null
Copy-IfExists (Join-Path $ROOT 'assets\multi-app-1.js') (Join-Path $MULTI 'assets\multi-app-1.js') | Out-Null
Copy-IfExists (Join-Path $ROOT 'assets\multi-app-2.js') (Join-Path $MULTI 'assets\multi-app-2.js') | Out-Null
Copy-IfExists (Join-Path $ROOT 'assets\multi-app-3.js') (Join-Path $MULTI 'assets\multi-app-3.js') | Out-Null
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

# --- Cache-busting por hash ------------------------------------------------
Add-VersionStamps $SZ (Join-Path $SZ 'assets')
Add-VersionStamps $MULTI (Join-Path $MULTI 'assets')

# --- Verificacao de saida -----------------------------------------------------
# Confere o resultado em public/, nao a lista de copias. Pega tambem o caso em
# que a copia falhou sem erro, que a contagem de SKIP sozinha nao pegaria.
$obrigatorios = @(
    'sz\index.html', 'sz\relatorios.html', 'sz\honorarios.html', 'sz\assinatura.html',
    'sz\privacidade.html', 'sz\sitemap.xml', 'sz\og-cover.jpg',
    'sz\logo.png', 'sz\macro_data.json', 'sz\agenda-data.json',
    'sz\relatorio_cache.json',
    'sz\cv.html', 'sz\Yan_Szuchmacher_CV_PT.pdf', 'sz\Yan_Szuchmacher_CV_EN.pdf',
    'sz\assets\sz-config.js', 'sz\assets\sz-design.css',
    'multi\index.html', 'multi\consultoria.html', 'multi\consultoria',
    'multi\privacidade.html', 'multi\privacidade',
    'multi\metodologia.html', 'multi\metodologia',
    'multi\sitemap.xml',
    'multi\og-cover.jpg', 'multi\assets\sz-config.js',
    'multi\assets\multi-app.css', 'multi\assets\multi-utilities.css',
    'multi\assets\multi-app-1.js', 'multi\assets\multi-app-2.js', 'multi\assets\multi-app-3.js'
)
$ausentes = @($obrigatorios | Where-Object { -not (Test-Path (Join-Path $OUT $_)) })

# Guarda do data-ev e do class fundido: le do resultado em public/, mesmo
# criterio do $obrigatorios.
$multiDataEvProblemas = @(Test-MultiDataEv (Join-Path $MULTI 'index.html') (Join-Path $MULTI 'assets\multi-app-2.js'))
$multiFusedProblemas = @(Test-FusedAttrs (Join-Path $MULTI 'index.html'))

if ($script:Faltando.Count -gt 0 -or $ausentes.Count -gt 0 -or $multiDataEvProblemas.Count -gt 0 -or $multiFusedProblemas.Count -gt 0) {
    Write-Host "`n=== BUILD REPROVADO ===" -ForegroundColor Red
    foreach ($f in $script:Faltando)      { Write-Host "  fonte ausente:  $f" -ForegroundColor Red }
    foreach ($f in $ausentes)             { Write-Host "  saida ausente:  $f" -ForegroundColor Red }
    foreach ($p in $multiDataEvProblemas) { Write-Host "  data-ev:  $p" -ForegroundColor Red }
    foreach ($p in $multiFusedProblemas)  { Write-Host "  class:  $p" -ForegroundColor Red }
    throw "Build incompleto. Deploy abortado para nao publicar 404 em producao."
}

Write-Host "`n$($obrigatorios.Count) arquivos obrigatorios conferidos em public/." -ForegroundColor DarkGray
Write-Host "Build concluido: $OUT" -ForegroundColor Green