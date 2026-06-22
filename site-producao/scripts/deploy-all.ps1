# deploy-all.ps1 — szuchmacher.com.br
# Lê credenciais do .env (nunca expõe no output)
# Uso: .\scripts\deploy-all.ps1 [-ListOnly] [-DryRun]

param(
    [switch]$ListOnly,     # apenas lista raiz do FTP e sai
    [switch]$DryRun,       # mostra o que seria feito, sem enviar
    [switch]$Purge,        # purge Cloudflare após deploy bem-sucedido
    [switch]$Cloudflare    # publica no Worker sz-sites (produção atual)
)

if ($Cloudflare) {
    $cf = Join-Path $PSScriptRoot 'deploy-cloudflare.ps1'
    if (-not (Test-Path $cf)) { Write-Error "deploy-cloudflare.ps1 não encontrado"; exit 1 }
    & $cf @PSBoundParameters
    exit $LASTEXITCODE
}

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT  = Split-Path -Parent $PSScriptRoot
$ENV   = Join-Path $ROOT '.env'

# ─── Ler .env ───────────────────────────────────────────────────────────────
if (-not (Test-Path $ENV)) { Write-Error ".env não encontrado em $ENV"; exit 1 }

$cfg = @{}
Get-Content $ENV | Where-Object { $_ -match '^[A-Z_]+=.+' } | ForEach-Object {
    $k, $v = $_ -split '=', 2
    $cfg[$k] = $v
}

$HOST_FTP = $cfg['FTP_HOST']
$USER_FTP = $cfg['FTP_USER']
$PASS_FTP = $cfg['FTP_PASS']

if (-not $HOST_FTP -or -not $USER_FTP -or -not $PASS_FTP) {
    Write-Error "Credenciais FTP incompletas em .env"
    exit 1
}

# ─── Bump cache-bust em assets referenciados nos HTMLs ───────────────────────
$assetVer = Get-Date -Format 'yyyyMMdd'
$htmlFiles = Get-ChildItem -Path $ROOT -Filter '*.html' -File
foreach ($hf in $htmlFiles) {
    $raw = Get-Content $hf.FullName -Raw -Encoding UTF8
    $updated = $raw -replace '(/assets/(?:sz-config|macro-panel|sz-site)\.js)\?v=\d+', "`$1?v=$assetVer"
    $updated = $raw -replace '(/assets/(?:sz-config|macro-panel|sz-site)\.js)("|>)', "`$1?v=$assetVer`$2"
    $updated = $updated -replace '(/assets/sz-design\.css)\?v=\d+', "`$1?v=$assetVer"
    $updated = $updated -replace '(/assets/sz-design\.css)("|>)', "`$1?v=$assetVer`$2"
    if ($updated -ne $raw) {
        try {
            Set-Content -Path $hf.FullName -Value $updated -Encoding UTF8 -NoNewline
            Write-Host "  BUMP   $($hf.Name) asset ?v=$assetVer" -ForegroundColor DarkCyan
        } catch {
            Write-Host "  BUMP SKIP $($hf.Name) — arquivo em uso" -ForegroundColor Yellow
        }
    }
}

# ─── Criar arquivo .netrc temporário ────────────────────────────────────────
$netrcFile = [System.IO.Path]::GetTempFileName()
"machine $HOST_FTP login $USER_FTP password $PASS_FTP" | Set-Content $netrcFile -Encoding ASCII

function Invoke-FTP {
    param([string]$RemotePath, [string]$LocalFile = '')

    $baseUrl = "ftp://$HOST_FTP$RemotePath"

    if ($LocalFile) {
        curl.exe --ssl-reqd -s -S --netrc-file $netrcFile --ftp-create-dirs -T $LocalFile $baseUrl
    } else {
        curl.exe --ssl-reqd -s --netrc-file $netrcFile --list-only $baseUrl
    }
    return $LASTEXITCODE
}

# ─── Listar raiz do FTP ─────────────────────────────────────────────────────
Write-Host "`n=== ESTRUTURA DA RAIZ DO FTP ===" -ForegroundColor Cyan
$listing = Invoke-FTP '/'
$listing
Write-Host ""

if ($ListOnly) {
    Remove-Item $netrcFile -Force
    exit 0
}

# FTP root = docroot (honorarios.html, index.html etc. estão na raiz)
# public_html/ é subpasta dentro do FTP, não o docroot
$BASE = '/'
Write-Host "FTP root = docroot. Deploy para /" -ForegroundColor Green

# ─── Mapa de arquivos a enviar ───────────────────────────────────────────────
$files = @(
    # Track A — HTMLs
    @{ local = 'index.html';          remote = "${BASE}index.html" },
    @{ local = 'relatorios.html';     remote = "${BASE}relatorios.html" },

    @{ local = 'honorarios.html';     remote = "${BASE}honorarios.html" },
    @{ local = 'assinatura.html';     remote = "${BASE}assinatura.html" },
    @{ local = 'privacidade.html';    remote = "${BASE}privacidade.html" },
    @{ local = 'radar-roic.html';     remote = "${BASE}radar-roic.html" },
    @{ local = 'og-cover.jpg';        remote = "${BASE}og-cover.jpg" },
    @{ local = 'logo.png';            remote = "${BASE}logo.png" },
    @{ local = 'agenda-data.json';    remote = "${BASE}agenda-data.json" },
    @{ local = 'macro_data.json';     remote = "${BASE}macro_data.json" },
    # Track B — assets e segurança
    @{ local = '.htaccess';                  remote = "${BASE}.htaccess" },
    @{ local = 'assets/sz-config.js';        remote = "${BASE}assets/sz-config.js" },
    @{ local = 'assets/sz-design.css';       remote = "${BASE}assets/sz-design.css" },
    @{ local = 'assets/sz-site.js';          remote = "${BASE}assets/sz-site.js" },
    @{ local = 'assets/macro-panel.js';      remote = "${BASE}assets/macro-panel.js" },
    @{ local = 'assets/macro.php';           remote = "${BASE}assets/macro.php" },
    @{ local = 'agenda-server.php';         remote = "${BASE}assets/agenda.php" },
    @{ local = 'scripts/agenda-cron.php';    remote = "${BASE}scripts/agenda-cron.php" },
    # Track C — macro API + endpoints ao vivo
    @{ local = 'macro_api.php';   remote = "${BASE}macro_api.php" },
    @{ local = 'market-data.php'; remote = "${BASE}market-data.php" },
    @{ local = 'prices.php';      remote = "${BASE}prices.php" },
    @{ local = 'config.php';      remote = "${BASE}config.php" }
)

$ok    = 0
$fail  = 0
$skip  = 0

foreach ($f in $files) {
    $localPath = Join-Path $ROOT $f.local

    if (-not (Test-Path $localPath)) {
        Write-Host "  SKIP   $($f.local) — arquivo local não encontrado" -ForegroundColor Yellow
        $skip++
        continue
    }

    if ($DryRun) {
        Write-Host "  DRY    $($f.local) → $($f.remote)" -ForegroundColor DarkGray
        continue
    }

    Write-Host "  UP     $($f.local) → $($f.remote)" -NoNewline

    $code = Invoke-FTP $f.remote $localPath

    if ($code -eq 0) {
        Write-Host " ✓" -ForegroundColor Green
        $ok++
    } else {
        Write-Host " ERRO (curl $code)" -ForegroundColor Red
        $fail++
    }
}

# ─── Limpar .netrc temporário ────────────────────────────────────────────────
Remove-Item $netrcFile -Force

# ─── Resumo ──────────────────────────────────────────────────────────────────
Write-Host "`n=== RESULTADO ===" -ForegroundColor Cyan
Write-Host "  OK:   $ok"
Write-Host "  FAIL: $fail"
Write-Host "  SKIP: $skip"

if ($fail -gt 0) {
    Write-Host "`nHá falhas — verificar acima." -ForegroundColor Red
    exit 1
}

if ($Purge -and -not $DryRun -and $fail -eq 0) {
    Write-Host "`n=== PURGE CLOUDFLARE ===" -ForegroundColor Cyan
    $purgeScript = Join-Path $PSScriptRoot 'purge-cloudflare.ps1'
    if (Test-Path $purgeScript) {
        & $purgeScript
    } else {
        Write-Host "  SKIP purge-cloudflare.ps1 não encontrado" -ForegroundColor Yellow
    }
}

Write-Host "`nDeploy concluído. Verifique HTTP + Purge Cloudflare se necessário." -ForegroundColor Green
exit 0
