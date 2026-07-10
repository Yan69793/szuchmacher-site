# run-macro-cron.ps1 — Dispara macro_api.php?cron=1 no servidor (regenera macro_data.json)
# Usado pelo Task Scheduler (Szuchmacher-MacroCron)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT   = Split-Path -Parent $PSScriptRoot
$YAN    = Join-Path (Split-Path -Parent $ROOT) 'automacao-yan-os'
$LOGDIR = Join-Path $YAN 'logs'
$LOG    = Join-Path $LOGDIR ("macro_cron_{0:yyyyMMdd}.log" -f (Get-Date))
$URL    = 'https://szuchmacher.com.br/macro_api.php?cron=1'
$ALERT  = Join-Path $PSScriptRoot 'send-alert-email.ps1'

function Write-Log([string]$Msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg
    Write-Host $line
    New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null
    Add-Content -Path $LOG -Value $line -Encoding UTF8
}

try {
    Write-Log '=== INICIO macro cron (HTTP) ==='

    $resp = Invoke-WebRequest -Uri $URL -TimeoutSec 120 -UseBasicParsing
    if ($resp.StatusCode -ne 200) {
        throw "HTTP $($resp.StatusCode)"
    }

    $json = $resp.Content | ConvertFrom-Json
    if (-not $json.ok) {
        throw "macro_api retornou ok=false: $($json.error)"
    }

    Write-Log "OK gerado=$($json.generated_at) cache=$($json.cache)"
    Write-Log '=== FIM OK ==='
    exit 0
} catch {
    Write-Log "ERRO: $($_.Exception.Message)"
    & $ALERT -Subject "[Szuchmacher] Falha na automação de macro cron" -Body "run-macro-cron.ps1 falhou em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`n`nErro: $($_.Exception.Message)`n`nLog: $LOG"
    exit 1
}