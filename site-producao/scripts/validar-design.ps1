# validar-design.ps1 - lint de regras duras sz-design
# Escaneia HTML/CSS em site-producao e reporta violacoes.
# Erro = P0 (quebra identidade), Aviso = P1 (suspeito, revisar)
#
# ASCII puro de proposito: roda via powershell.exe (Windows PowerShell 5.1) no
# Task Scheduler (Szuchmacher-AgendaAgent, chamado por run-agenda-agent.ps1),
# que quebra no parse com travessao ou acento em arquivo sem BOM. Foi o que
# aconteceu em 30/07/2026: o travessao nas linhas de log abaixo virou aspa
# curva de fechamento (cp1252) e a task falhou com "cadeia de caracteres nao
# tem o terminador" na linha 126. Mesma causa raiz do incidente de 21/07/2026
# documentado no CLAUDE.md de relatorio-diario-szuchmacher.

$ErrorActionPreference = 'Continue'
$script:erros = 0
$script:avisos = 0

$root = Split-Path -Parent $PSScriptRoot

function Report-Error($file, $line, $msg) {
    Write-Host "  [ERRO] $file`:$line - $msg" -ForegroundColor Red
    $script:erros++
}

function Report-Warn($file, $line, $msg) {
    Write-Host "  [AVISO] $file`:$line - $msg" -ForegroundColor Yellow
    $script:avisos++
}

Write-Host "`nvalidar-design.ps1 - lint sz-design" -ForegroundColor Cyan
Write-Host "================================`n"

# --- HTML files ---
$htmlFiles = Get-ChildItem -Path $root -Filter "*.html" -Recurse | Where-Object {
    $_.FullName -notmatch '\\_arquivo\\' -and
    $_.FullName -notmatch '\\node_modules\\' -and
    $_.FullName -notmatch '\\deploy_zip\\' -and
    $_.FullName -notmatch '\\snapshots\\' -and
    $_.FullName -notmatch '\\.claude\\'
}

foreach ($f in $htmlFiles) {
    $content = Get-Content $f.FullName -Raw
    $lines = $content -split "`n"
    $relPath = $f.FullName.Replace($root + "\", "")

    # 1. border-radius nao-zero (fora inline style e classes)
    $lineNum = 0
    foreach ($line in $lines) {
        $lineNum++
        if ($line -match 'border-radius\s*:\s*([1-9]\d*\.?\d*px|[1-9]\d*\.?\d*rem|[1-9]\d*\.?\d*em)') {
            Report-Warn $relPath $lineNum "border-radius nao-zero: $($line.Trim())"
        }
        if ($line -match 'rounded(?!-none)\w*' -and $line -notmatch 'rounded-none') {
            Report-Warn $relPath $lineNum "Tailwind rounded: $($line.Trim())"
        }
    }

    # 2. box-shadow decorativa
    $lineNum = 0
    foreach ($line in $lines) {
        $lineNum++
        if ($line -match 'box-shadow\s*:') {
            Report-Warn $relPath $lineNum "box-shadow detectada: $($line.Trim())"
        }
    }

    # 3. Mono em numeros grandes (font-family: JetBrains Mono combinado com font-size grande)
    $inMonoBlock = $false
    $lineNum = 0
    foreach ($line in $lines) {
        $lineNum++
        if ($line -match 'JetBrains Mono') { $inMonoBlock = $true }
        if ($line -match '}' -and $inMonoBlock) { $inMonoBlock = $false }
        if ($inMonoBlock -and $line -match 'font-size\s*:\s*([2-9]\d+px|[3-9]\.?\d*rem|[3-9]\.?\d*em)') {
            Report-Error $relPath $lineNum "Mono em numero grande (font-size >= 2rem): $($line.Trim())"
        }
    }

    # 4. Shorthand de numeral em HTML ("2 bi", "800 mi", "3 tri", "5 mm")
    $lineNum = 0
    foreach ($line in $lines) {
        $lineNum++
        if ($line -match '>\s*R?\$\s*\d+[,.]?\d*\s*(bi|mi|tri|mm)\b') {
            Report-Error $relPath $lineNum "Numeral abreviado: $($line.Trim())"
        }
    }

    # 5. Display font em bold (Prata, Playfair, Libre Baskerville com font-weight >= 500)
    $lineNum = 0
    foreach ($line in $lines) {
        $lineNum++
        if ($line -match '(Prata|Playfair\s*Display|Libre\s*Baskerville).*font-weight\s*:\s*([5-9]00|bold|7[0-9]0|8[0-9]0|9[0-9]0)') {
            Report-Error $relPath $lineNum "Display serifada em bold: $($line.Trim())"
        }
    }

    # 6. Mono em paragrafo (JetBrains Mono em elemento p, span de texto longo)
    $lineNum = 0
    foreach ($line in $lines) {
        $lineNum++
        if ($line -match '<p[ >].*JetBrains Mono' -or $line -match 'p\s*\{[^}]*font-family\s*:\s*[^;]*JetBrains Mono') {
            Report-Error $relPath $lineNum "JetBrains Mono em paragrafo: $($line.Trim())"
        }
    }
}

# --- CSS files (token/base assets) ---
$cssFiles = @(
    (Join-Path $root "assets\sz-tokens.css"),
    (Join-Path $root "assets\sz-base.css")
)

foreach ($cssPath in $cssFiles) {
    if (-not (Test-Path $cssPath)) { continue }
    $content = Get-Content $cssPath -Raw
    $lines = $content -split "`n"
    $relPath = $cssPath.Replace($root + "\", "")

    # 1. Confirma que --radius e 0
    $lineNum = 0
    foreach ($line in $lines) {
        $lineNum++
        if ($line -match '--radius\s*:\s*([1-9]\d*\.?\d*px|[1-9]\d*\.?\d*rem)') {
            Report-Error $relPath $lineNum "--radius nao-zero nos tokens: $($line.Trim())"
        }
    }
}

# --- Summary ---
Write-Host "`n================================`n"
if ($erros -eq 0 -and $avisos -eq 0) {
    Write-Host "Limpo. Nenhuma violacao encontrada." -ForegroundColor Green
} else {
    Write-Host "$erros erro(s), $avisos aviso(s)" -ForegroundColor $(if ($erros -gt 0) { "Red" } else { "Yellow" })
}

exit $erros
