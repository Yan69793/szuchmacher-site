# run-macro-cron.ps1 - Dispara macro_api.php?cron=1 no servidor (regenera macro cache)
# Usado pelo Task Scheduler (Szuchmacher-MacroCron)
#
# Historico P1 (2026-07-27): exit 1 por HTTP 429 (rate limit 1h no Worker).
# Hardening 2026-08-02:
# - User-Agent estavel
# - Retry em 429 (Retry-After) e 503 (backoff)
# - Soft-OK se refresh falhar mas cache publico estiver fresco (<24h) e ok=true
# - Alerta e-mail so em falha dura

param(
    [switch]$DryRun,
    [int]$MaxAttempts = 4
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT   = Split-Path -Parent $PSScriptRoot
$YAN    = Join-Path (Split-Path -Parent $ROOT) 'automacao-yan-os'
$LOGDIR = Join-Path $YAN 'logs'
$LOG    = Join-Path $LOGDIR ("macro_cron_{0:yyyyMMdd}.log" -f (Get-Date))
$URL_REFRESH = 'https://szuchmacher.com.br/macro_api.php?cron=1'
$URL_CACHE   = 'https://szuchmacher.com.br/macro_api.php'
$ALERT  = Join-Path $PSScriptRoot 'send-alert-email.ps1'
$UA     = 'Szuchmacher-MacroCron/1.1 (+https://szuchmacher.com.br; TaskScheduler)'
$CRON_SECRET = $null
$envFile = Join-Path $YAN '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^(?:MACRO_CRON_SECRET|CRON_SECRET)=(.+)$') {
            $CRON_SECRET = $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
}

function Write-Log([string]$Msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg
    Write-Host $line
    New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null
    Add-Content -Path $LOG -Value $line -Encoding UTF8
}

function Get-HttpDetail {
    param([System.Management.Automation.ErrorRecord]$Err)
    $code = $null
    $body = $null
    $retryAfter = $null
    try {
        $resp = $Err.Exception.Response
        if ($resp) {
            $code = [int]$resp.StatusCode
            try {
                $ra = $resp.Headers['Retry-After']
                if ($ra) { $retryAfter = [int]$ra }
            } catch {}
            try {
                $stream = $resp.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $body = $reader.ReadToEnd()
                    $reader.Close()
                }
            } catch {}
        }
    } catch {}
    if (-not $code -and $Err.Exception.Message -match '\((\d{3})\)') {
        $code = [int]$Matches[1]
    }
    [pscustomobject]@{
        StatusCode = $code
        Body       = $body
        RetryAfter = $retryAfter
        Message    = $Err.Exception.Message
    }
}

function Invoke-MacroGet {
    param([string]$Uri, [int]$TimeoutSec = 120)
    $headers = @{
        'User-Agent' = $UA
        'Accept'     = 'application/json'
    }
    if ($CRON_SECRET) { $headers['X-Cron-Secret'] = $CRON_SECRET }
    Invoke-WebRequest -Uri $Uri -TimeoutSec $TimeoutSec -UseBasicParsing -Headers $headers
}

function Test-CacheFresh {
    param($Json, [int]$MaxAgeHours = 24)
    if (-not $Json -or -not $Json.ok) { return $false }
    $gen = [string]$Json.generated_at
    if ([string]::IsNullOrWhiteSpace($gen)) { return $false }

    $m = [regex]::Match($gen, '(\d{2})/(\d{2})/(\d{4})(?:,?\s*(\d{2}):(\d{2}))?')
    if (-not $m.Success) {
        Write-Log "WARN: generated_at nao parseavel: $gen"
        return $false
    }
    $day = [int]$m.Groups[1].Value
    $mon = [int]$m.Groups[2].Value
    $yr  = [int]$m.Groups[3].Value
    $hh  = if ($m.Groups[4].Success) { [int]$m.Groups[4].Value } else { 12 }
    $mm  = if ($m.Groups[5].Success) { [int]$m.Groups[5].Value } else { 0 }
    try {
        $dt = Get-Date -Year $yr -Month $mon -Day $day -Hour $hh -Minute $mm -Second 0
    } catch {
        return $false
    }
    $ageH = ((Get-Date) - $dt).TotalHours
    Write-Log ("cache age_h={0:N1} generated_at={1}" -f $ageH, $gen)
    return ($ageH -ge 0 -and $ageH -le $MaxAgeHours)
}

function Get-PublicCache {
    $resp = Invoke-MacroGet -Uri $URL_CACHE -TimeoutSec 45
    if ($resp.StatusCode -ne 200) {
        throw "cache HTTP $($resp.StatusCode)"
    }
    return ($resp.Content | ConvertFrom-Json)
}

function Send-CronAlert {
    param([string]$ErrorText)
    if (-not (Test-Path $ALERT)) { return }
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $nl = [Environment]::NewLine
    $body = 'run-macro-cron.ps1 falhou em ' + $ts + '.' + $nl + $nl + 'Erro: ' + $ErrorText + $nl + $nl + 'Log: ' + $LOG
    & $ALERT -Subject '[Szuchmacher] Falha na automacao de macro cron' -Body $body
}

try {
    Write-Log '=== INICIO macro cron (HTTP hardened) ==='
    Write-Log "refresh=$URL_REFRESH maxAttempts=$MaxAttempts dryRun=$DryRun"

    if ($DryRun) {
        $cache = Get-PublicCache
        Write-Log "DRY-RUN cache ok=$($cache.ok) generated=$($cache.generated_at) cache_flag=$($cache.cache)"
        if (Test-CacheFresh $cache) {
            Write-Log '=== FIM DRY-RUN OK (cache fresco) ==='
            exit 0
        }
        Write-Log '=== FIM DRY-RUN WARN (cache nao fresco) ==='
        exit 0
    }

    $lastErr = $null
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            Write-Log "tentativa $attempt/$MaxAttempts refresh..."
            $resp = Invoke-MacroGet -Uri $URL_REFRESH -TimeoutSec 120
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
            $detail = Get-HttpDetail $_
            $lastErr = $detail
            $code = $detail.StatusCode
            Write-Log "ERRO tentativa $attempt : code=$code msg=$($detail.Message)"
            if ($detail.Body) {
                $snippet = $detail.Body.Substring(0, [Math]::Min(200, $detail.Body.Length))
                Write-Log "body: $snippet"
            }

            # 429 = alguem ja refreshou recentemente; se cache publico fresco, soft-OK sem esperar
            if ($code -eq 429) {
                try {
                    $cacheEarly = Get-PublicCache
                    if (Test-CacheFresh $cacheEarly -MaxAgeHours 24) {
                        Write-Log "SOFT-OK early: 429 com cache fresco generated=$($cacheEarly.generated_at)"
                        Write-Log '=== FIM SOFT-OK ==='
                        exit 0
                    }
                } catch {
                    Write-Log "early soft-OK falhou: $($_.Exception.Message)"
                }
            }

            $retriable = ($code -eq 429 -or $code -eq 503 -or $code -eq 502 -or $code -eq 504 -or -not $code)
            if (-not $retriable -or $attempt -ge $MaxAttempts) {
                break
            }

            $wait = 30
            if ($code -eq 429) {
                if ($detail.RetryAfter -and $detail.RetryAfter -gt 0) {
                    $wait = [Math]::Min($detail.RetryAfter, 60)
                } else {
                    $wait = 15 * $attempt
                }
            } elseif ($code -eq 503 -or $code -eq 502 -or $code -eq 504) {
                $wait = 20 * $attempt
            }
            Write-Log "retry em ${wait}s..."
            Start-Sleep -Seconds $wait
        }
    }

    try {
        Write-Log 'avaliando soft-OK via cache publico...'
        $cache = Get-PublicCache
        if (Test-CacheFresh $cache -MaxAgeHours 24) {
            $codeStr = if ($lastErr) { [string]$lastErr.StatusCode } else { 'n/a' }
            Write-Log "SOFT-OK: refresh falhou (code=$codeStr) mas cache fresco ok=true generated=$($cache.generated_at)"
            Write-Log '=== FIM SOFT-OK ==='
            exit 0
        }
        Write-Log "cache publico ok=$($cache.ok) generated=$($cache.generated_at) - nao qualifica soft-OK"
    } catch {
        Write-Log "falha ao ler cache publico: $($_.Exception.Message)"
    }

    if ($lastErr) {
        $errMsg = 'code=' + [string]$lastErr.StatusCode + ' ' + [string]$lastErr.Message
    } else {
        $errMsg = 'erro desconhecido'
    }
    Write-Log "ERRO FINAL: $errMsg"
    Send-CronAlert -ErrorText $errMsg
    Write-Log '=== FIM ERRO ==='
    exit 1
} catch {
    Write-Log "ERRO: $($_.Exception.Message)"
    Send-CronAlert -ErrorText $_.Exception.Message
    exit 1
}
