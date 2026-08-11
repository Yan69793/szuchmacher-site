# run-macro-cron.ps1 — Dispara macro_api.php?cron=1 no servidor (regenera macro_data.json)
# Usado pelo Task Scheduler (Szuchmacher-MacroCron)
#
# RETRY1 (2026-08-11): versao com retry + backoff progressivo + SOFT-OK.
# A versao anterior fazia uma unica tentativa e morria em HTTP 429, que o
# OpenRouter no backend dispara sob carga. Agora tenta 4 vezes com backoff e,
# se todas falharem, consulta o cache publico: se estiver fresco (< 24h),
# considera SOFT-OK e sai limpo.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$ROOT   = Split-Path -Parent $PSScriptRoot
$YAN    = Join-Path (Split-Path -Parent $ROOT) 'automacao-yan-os'
$LOGDIR = Join-Path $YAN 'logs'
$LOG    = Join-Path $LOGDIR ("macro_cron_{0:yyyyMMdd}.log" -f (Get-Date))
$URL    = 'https://szuchmacher.com.br/macro_api.php?cron=1'
$CACHE  = 'https://szuchmacher.com.br/macro_data.json'
$ALERT  = Join-Path $PSScriptRoot 'send-alert-email.ps1'

function Write-Log([string]$Msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg
    Write-Host $line
    New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null
    Add-Content -Path $LOG -Value $line -Encoding UTF8
}

$maxAttempts = 4
$backoffSec  = @(20, 40, 60)  # incrementa a cada tentativa
$refreshOk   = $false
$lastCode    = $null
$lastMsg     = $null

Write-Log "=== INICIO macro cron (HTTP, retry) ==="
Write-Log "refresh=$URL maxAttempts=$maxAttempts"

for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Write-Log "tentativa $attempt/$maxAttempts refresh..."
    try {
        $resp = Invoke-WebRequest -Uri $URL -TimeoutSec 120 -UseBasicParsing
        if ($resp.StatusCode -ne 200) {
            $lastCode = $resp.StatusCode
            $lastMsg  = "HTTP $($resp.StatusCode)"
            Write-Log "ERRO tentativa $attempt : code=$lastCode msg=$lastMsg"
        } else {
            $json = $resp.Content | ConvertFrom-Json
            if (-not $json.ok) {
                $lastCode = 502
                $lastMsg  = "macro_api retornou ok=false: $($json.error)"
                Write-Log "ERRO tentativa $attempt : $lastMsg"
            } else {
                Write-Log "OK gerado=$($json.generated_at) cache=$($json.cache)"
                $refreshOk = $true
                break
            }
        }
    } catch {
        $lastCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $lastMsg  = $_.Exception.Message
        Write-Log "ERRO tentativa $attempt : code=$lastCode msg=$lastMsg"
    }

    if ($attempt -lt $maxAttempts) {
        $wait = if ($attempt -le $backoffSec.Count) { $backoffSec[$attempt - 1] } else { 60 }
        Write-Log "retry em ${wait}s..."
        Start-Sleep -Seconds $wait
    }
}

if (-not $refreshOk) {
    Write-Log "avaliando SOFT-OK via cache publico..."
    try {
        $cacheResp = Invoke-WebRequest -Uri $CACHE -TimeoutSec 30 -UseBasicParsing
        $cacheJson = $cacheResp.Content | ConvertFrom-Json
        if ($cacheJson.ok -and $cacheJson.generated_at) {
            # generated_at tipicamente "02/08/2026, 20:30 BRT" — parse aproximado
            $genStr = $cacheJson.generated_at -replace '\s*às?\s*', ' ' -replace '\s+BRT', ''
            try {
                $genDate = [DateTime]::ParseExact($genStr.Trim(), 'dd/MM/yyyy, HH:mm', [Globalization.CultureInfo]::InvariantCulture)
                $ageH = [Math]::Round(((Get-Date) - $genDate).TotalHours, 1)
                if ($ageH -lt 24) {
                    Write-Log "SOFT-OK: refresh falhou (code=$lastCode) mas cache fresco ok=true generated=$genStr age_h=$ageH"
                    Write-Log "=== FIM SOFT-OK ==="
                    exit 0
                } else {
                    Write-Log "SOFT-FAIL: cache stale age_h=$ageH generated=$genStr"
                }
            } catch {
                Write-Log "SOFT-FAIL: nao conseguiu parse de generated_at: $genStr"
            }
        } else {
            Write-Log "SOFT-FAIL: cache publico ok=false ou sem generated_at"
        }
    } catch {
        Write-Log "SOFT-FAIL: nao conseguiu buscar cache publico: $($_.Exception.Message)"
    }

    Write-Log "=== FIM COM FALHA (sem cache fresco) ==="
    if (Test-Path $ALERT) {
        & $ALERT -Subject "[Szuchmacher] Falha na automacao de macro cron" -Body "run-macro-cron.ps1 falhou em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`n`nUltimo erro: code=$lastCode $lastMsg`n`nLog: $LOG"
    }
    exit 1
}

Write-Log "=== FIM OK ==="
exit 0
