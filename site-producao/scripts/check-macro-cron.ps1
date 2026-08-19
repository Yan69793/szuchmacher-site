# check-macro-cron.ps1
# Verifica o disparo do cron nativo do macro no Worker sz-sites.
# Chamado pela task one-shot Szuchmacher-CheckMacroCron-2026-08-24 (24/08 09:00 BRT).
# O campo de disparo e macro_cron_last.ts, nunca generated_at.
$ErrorActionPreference = 'Continue'

$esperado = '2026-08-24T03:00:00Z'          # segunda 03:00 UTC, cron "0 3 * * 1"
$janelaHoras = 2                             # janela prende o OK ao disparo de 24/08: so o dispatcher escreve o registro
$url = 'https://szuchmacher.com.br/health'

$logDir = Join-Path $PSScriptRoot '..\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'check-macro-cron.log'

$esperadoTs = [DateTimeOffset]::Parse($esperado).ToUnixTimeSeconds()
$tetoTs = $esperadoTs + [int64]($janelaHoras * 3600)

function Log-Linha([string]$linha) {
    $selo = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
    Add-Content -Path $logFile -Value "$selo $linha" -Encoding utf8
}

try {
    $r = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
} catch {
    Log-Linha "FAIL erro na leitura do /health: $($_.Exception.Message)"
    exit 1
}

$ult = $r.checks.macro_cron_last

if ($null -eq $ult -or $ult -is [string]) {
    Log-Linha "FAIL macro_cron_last sem registro de disparo: $ult"
    exit 1
}

$ts = [int64]$ult.ts
$cron = [string]$ult.cron
$ok = ($ult.ok -eq $true)
$resumo = "ts=$ts esperado>=${esperadoTs} cron='$cron' ok=$ok"

if ($ts -ge $esperadoTs -and $ts -lt $tetoTs -and $cron -eq '0 3 * * 1' -and $ok) {
    Log-Linha "OK disparo do cron de 24/08 confirmado: $resumo"
    exit 0
}

Log-Linha "FAIL disparo nao confirmado: $resumo (esperado ts entre $esperadoTs e $tetoTs) generated_at=$($ult.generated_at) status=$($ult.status) error=$($ult.error)"
exit 1
