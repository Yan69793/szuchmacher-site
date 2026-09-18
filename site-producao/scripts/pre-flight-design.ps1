# pre-flight-design.ps1, um comando, um veredito de design do frontend.
#
# Existe porque a verificação de design estava espalhada e cega: o
# validar-design.ps1 quebrava na primeira pagina e nao checava CSS nenhum, e o
# audit-domain-palette.ps1 so olhava 5 paginas. Aqui as duas checagens rodam
# junto com as medidas que o plano de design prometeu (familias de fonte, links
# duplicados, colisao de namespace e nomes de classe longos).
#
# Hard: quebra o veredito e devolve exit 1.
# Info: so inventaria, nao reprova (usado para acompanhar progresso).
#
# Uso:
#   .\scripts\pre-flight-design.ps1
#   .\scripts\pre-flight-design.ps1 -Detalhado
#
# Nao publica nada e nao escreve arquivo. Somente leitura.

param([switch]$Detalhado)

$ErrorActionPreference = 'Continue'
$ROOT = Split-Path -Parent $PSScriptRoot
$ASSETS = Join-Path $ROOT 'assets'

$hard = 0
$avisos = 0

function Titulo([string]$t) { Write-Host "`n$t" -ForegroundColor Cyan }
function Ok([string]$t) { Write-Host "  OK    $t" -ForegroundColor Green }
function Falha([string]$t) { Write-Host "  FALHA $t" -ForegroundColor Red; $script:hard++ }
function Info([string]$t) { Write-Host "  INFO  $t" -ForegroundColor DarkGray }
function Aviso([string]$t) { Write-Host "  AVISO $t" -ForegroundColor Yellow; $script:avisos++ }

Write-Host "`n=== PRE-FLIGHT DESIGN ===" -ForegroundColor Cyan

# ── 1. Linters do projeto ─────────────────────────────────────────────────────
Titulo '-- 1. linters do projeto'

$lintDesign = Join-Path $PSScriptRoot 'validar-design.ps1'
$lintPaleta = Join-Path $PSScriptRoot 'audit-domain-palette.ps1'

foreach ($par in @(@{ p = $lintDesign; nome = 'validar-design.ps1' },
                   @{ p = $lintPaleta; nome = 'audit-domain-palette.ps1' })) {
    if (-not (Test-Path $par.p)) { Falha "$($par.nome) nao existe"; continue }
    $saida = (& $par.p 2>&1 | Out-String)
    if ($LASTEXITCODE -eq 0) { Ok "$($par.nome) exit 0" }
    else {
        Falha "$($par.nome) exit $LASTEXITCODE"
        if ($Detalhado) { Write-Host $saida }
        else { ($saida -split "`n" | Where-Object { $_ -match 'FAIL|ERRO' } | Select-Object -First 6) | ForEach-Object { Write-Host "        $($_.Trim())" -ForegroundColor DarkRed } }
    }
}

# ── 2. Paginas sz e suas fontes ───────────────────────────────────────────────
Titulo '-- 2. fontes por pagina (sz)'

# Mesma lista do audit-domain-palette.ps1 menos as paginas que nao carregam
# folha de estilo propria. cv.html e servida so no dominio sz.
$paginasSz = @('index.html', 'assinatura.html', 'honorarios.html', 'relatorios.html',
               'privacidade.html', 'geopolitica.html', 'cv.html')
# Par tipografico oficial: Prata (titulo), Public Sans (texto), JetBrains Mono (numero).
$familiasOficiais = @('Prata', 'Public Sans', 'JetBrains Mono')

foreach ($f in $paginasSz) {
    $p = Join-Path $ROOT $f
    if (-not (Test-Path $p)) { Info "$f ausente"; continue }
    $c = Get-Content $p -Raw -Encoding UTF8

    $links = [regex]::Matches($c, 'href="([^"]*fonts\.googleapis\.com/css2[^"]*)"') |
             ForEach-Object { $_.Groups[1].Value }
    $familias = @()
    foreach ($l in $links) {
        $familias += [regex]::Matches($l, 'family=([A-Za-z\+]+)') | ForEach-Object { $_.Groups[1].Value -replace '\+', ' ' }
    }
    $distintas = @($familias | Sort-Object -Unique)

    if ($links.Count -eq 0) { Falha "$f sem link de fonte do Google" }
    elseif ($links.Count -gt 1) { Falha "$f com $($links.Count) links de fonte duplicados" }

    $fora = @($distintas | Where-Object { $familiasOficiais -notcontains $_ })
    if ($fora.Count -gt 0) { Falha "$f fora do par oficial: $($fora -join ', ')" }
    elseif ($links.Count -le 1) { Ok "$f com $($distintas.Count) familias, todas oficiais" }
}

# ── 3. Colisao de namespace entre os dois dominios ────────────────────────────
Titulo '-- 3. colisao de namespace sz x multi'

function Classes-Em([string]$arquivo, [string]$prefixo) {
    $p = Join-Path $ASSETS $arquivo
    if (-not (Test-Path $p)) { return @() }
    $c = Get-Content $p -Raw -Encoding UTF8
    # O prefixo chega literal (ex. '.geo-'). Escapar aqui e nao na chamada: um
    # backslash extra antes do $ fazia o regex virar "\\\\.geo-" e nunca casar,
    # reportando "sem colisao" para colisao que existe.
    $pad = [regex]::Escape($prefixo)
    return @([regex]::Matches($c, "$pad[a-z0-9-]*") | ForEach-Object { $_.Value } | Sort-Object -Unique)
}

$pares = @(
    @{ rotulo = '.geo-* (design x app)'; a = (Classes-Em 'sz-design.css' '.geo-'); b = (Classes-Em 'multi-app.css' '.geo-') },
    @{ rotulo = '.u-* (utilitarias x utilitarias)'; a = (Classes-Em 'sz-utilities.css' '.u-'); b = (Classes-Em 'multi-utilities.css' '.u-') }
)
foreach ($par in $pares) {
    $colisao = @($par.a | Where-Object { $par.b -contains $_ })
    if ($colisao.Count -gt 0) { Falha "$($par.rotulo) colidem em $($colisao.Count): $($colisao -join ', ')" }
    else { Ok "$($par.rotulo) sem colisao" }
}

# ── 4. Nomes de classe longos no HTML ────────────────────────────────────────
Titulo '-- 4. nomes de classe'

$longos = @()
foreach ($f in $paginasSz) {
    $p = Join-Path $ROOT $f
    if (-not (Test-Path $p)) { continue }
    $c = Get-Content $p -Raw -Encoding UTF8
    foreach ($m in [regex]::Matches($c, 'class="([^"]+)"')) {
        foreach ($tok in ($m.Groups[1].Value -split '\s+')) {
            if ($tok.Length -gt 40) { $longos += "$f : $tok ($($tok.Length) chars)" }
        }
    }
}
if ($longos.Count -gt 0) {
    $unicos = @($longos | Sort-Object -Unique)
    Falha "$($unicos.Count) nome(s) de classe acima de 40 chars"
    $unicos | Select-Object -First 8 | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkRed }
}
else { Ok 'nenhum nome de classe acima de 40 chars' }

# ── 5. Inventario (nao reprova) ──────────────────────────────────────────────
Titulo '-- 5. inventario (informativo)'

$design = Join-Path $ASSETS 'sz-design.css'
if (Test-Path $design) {
    $css = Get-Content $design -Raw -Encoding UTF8
    $bps = @([regex]::Matches($css, '@media[^{]*?(\d+)px') | ForEach-Object { [int]$_.Groups[1].Value } | Sort-Object -Unique)
    Info "breakpoints em sz-design.css: $($bps -join ', ')"

    # Piso acordado: 12px para o que e escrito em px e 0.75rem para o que e
    # escrito em rem. O baseline mediu 8.6px renderizado em pagina sz, e isso
    # vem de 0.54rem, que escapava de uma checagem so de px.
    $pxPequenos = @([regex]::Matches($css, 'font-size:\s*(\d+(?:\.\d+)?)px') |
                    ForEach-Object { [double]$_.Groups[1].Value } | Where-Object { $_ -lt 12 } | Sort-Object -Unique)
    $remPequenos = @([regex]::Matches($css, 'font-size:\s*(\d+(?:\.\d+)?)rem') |
                     ForEach-Object { [double]$_.Groups[1].Value } | Where-Object { $_ -lt 0.75 } | Sort-Object -Unique)
    if (($pxPequenos.Count + $remPequenos.Count) -gt 0) {
        Aviso "abaixo do piso: px<12 -> $($pxPequenos.Count) valor(es) [$($pxPequenos -join ', ')] | rem<0.75 -> $($remPequenos.Count) valor(es) [$($remPequenos -join ', ')]"
    }
    else { Info 'nenhum font-size abaixo do piso (12px / 0.75rem) no CSS' }

    Info "linhas em sz-design.css: $((Get-Content $design).Count)"
}

# ── Veredito ─────────────────────────────────────────────────────────────────
Write-Host "`n=========================" -ForegroundColor Cyan
if ($hard -gt 0) {
    Write-Host "$hard falha(s) dura(s), $avisos aviso(s)." -ForegroundColor Red
    exit 1
}
Write-Host "sem falha dura, $avisos aviso(s)." -ForegroundColor Green
exit 0
