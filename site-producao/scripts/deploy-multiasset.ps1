# deploy-multiasset.ps1 — publica a plataforma em multi-assets.com
# PRODUÇÃO (2026-06-17): use deploy-cloudflare.ps1 ou deploy-all.ps1 -Cloudflare
# Uso legado FTP: .\scripts\deploy-multiasset.ps1 [-DryRun]
# Requer no .env: FTP_MULTIasset_HOST, FTP_MULTIasset_USER, FTP_MULTIasset_PASS
# Opcional: FTP_MULTIasset_REMOTE_DIR (padrao / — docroot do addon domain)

param([switch]$DryRun)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$ENV  = Join-Path $ROOT '.env'

if (-not (Test-Path $ENV)) { Write-Error ".env nao encontrado em $ENV"; exit 1 }

$cfg = @{}
Get-Content $ENV | Where-Object { $_ -match '^[A-Z0-9_]+=.+' } | ForEach-Object {
    $k, $v = $_ -split '=', 2
    $cfg[$k] = $v
}

$HOST_FTP = $cfg['FTP_MULTIasset_HOST']
if (-not $HOST_FTP) { $HOST_FTP = $cfg['FTP_HOST'] }
$USER_FTP = $cfg['FTP_MULTIasset_USER']
if (-not $USER_FTP) { $USER_FTP = $cfg['FTP_USER'] }
$PASS_FTP = $cfg['FTP_MULTIasset_PASS']
if (-not $PASS_FTP) { $PASS_FTP = $cfg['FTP_PASS'] }
$BASE = $cfg['FTP_MULTIasset_REMOTE_DIR']
if (-not $BASE -or $BASE -eq '/') {
    Write-Error @"
FTP_MULTIasset_REMOTE_DIR obrigatorio no .env (nao use /).
Exemplo apos criar addon domain no cPanel:
  FTP_MULTIasset_REMOTE_DIR=/multi-assets.com/
Ou o caminho exibido em Dominios -> multi-assets.com -> Diretorio raiz.
"@
    exit 1
}
if (-not $BASE.EndsWith('/')) { $BASE += '/' }

if (-not $HOST_FTP -or -not $USER_FTP -or -not $PASS_FTP) {
    Write-Error "Credenciais FTP_MULTIasset_* (ou FTP_*) incompletas em .env"
    exit 1
}

$appHtml = Join-Path $ROOT 'multiasset-app.html'
if (-not (Test-Path $appHtml)) { Write-Error "multiasset-app.html nao encontrado"; exit 1 }

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

$files = @(
    @{ local = 'multiasset-app.html';           remote = "${BASE}index.html" },
    @{ local = 'consultoria.html';              remote = "${BASE}consultoria.html" },
    @{ local = 'consultoria.html';              remote = "${BASE}consultoria" },
    @{ local = 'multiasset-platform/.htaccess'; remote = "${BASE}.htaccess" },
    @{ local = 'prices.php';                   remote = "${BASE}prices.php" },
    @{ local = 'market-data.php';               remote = "${BASE}market-data.php" },
    @{ local = 'macro_api.php';                 remote = "${BASE}macro_api.php" },
    @{ local = 'macro_data.json';               remote = "${BASE}macro_data.json" },
    @{ local = 'config.php';                    remote = "${BASE}config.php" },
    @{ local = 'assets/sz-config.js';           remote = "${BASE}assets/sz-config.js" }
)

Write-Host "`n=== DEPLOY MULTIASSET -> multi-assets.com ===" -ForegroundColor Cyan
Write-Host "FTP: $HOST_FTP$BASE`n" -ForegroundColor DarkGray

$ok = 0; $fail = 0; $skip = 0

foreach ($f in $files) {
    $localPath = Join-Path $ROOT $f.local
    if (-not (Test-Path $localPath)) {
        Write-Host "  SKIP   $($f.local)" -ForegroundColor Yellow
        $skip++
        continue
    }
    if ($DryRun) {
        Write-Host "  DRY    $($f.local) -> $($f.remote)" -ForegroundColor DarkGray
        continue
    }
    Write-Host "  UP     $($f.local) -> $($f.remote)" -NoNewline
    $code = Invoke-FTP $f.remote $localPath
    if ($code -eq 0) { Write-Host " OK" -ForegroundColor Green; $ok++ }
    else { Write-Host " ERRO" -ForegroundColor Red; $fail++ }
}

Remove-Item $netrcFile -Force

Write-Host "`n=== RESULTADO ===" -ForegroundColor Cyan
Write-Host "  OK: $ok  FAIL: $fail  SKIP: $skip"

if ($fail -gt 0) { exit 1 }

Write-Host "`nProximo passo: configurar DNS de multi-assets.com (A/CNAME) + addon domain no HostGator." -ForegroundColor Green
exit 0