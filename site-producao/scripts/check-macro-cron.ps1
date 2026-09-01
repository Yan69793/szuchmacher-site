# check-macro-cron.ps1
# Watchdog semanal do cron nativo do Worker sz-sites (0 3 * * MON UTC = segunda 00:00 BRT).
#
# ATENCAO ao dia da semana. A Cloudflare usa numeracao Quartz, 1 = domingo e
# 7 = sabado, nao a do Unix cron. O schedule antigo "0 3 * * 1" disparava
# domingo 03:00 UTC e este watchdog acusava "nativo mudo" toda segunda, com o
# Worker rodando normalmente um dia antes. Corrigido para MON em 24/08/2026.
# Task: Szuchmacher-MacroCronWatchdog, segunda 09:00 BRT.
#
# Campo de disparo: checks.macro_cron_last.ts em GET /health. Nunca generated_at.
# So o scheduled() do Worker grava esse carimbo. Refresh HTTP (cron=1) nao toca.
#
# Por que existe: Cron Triggers da Cloudflare ja falharam em silencio em 2026
# (forum CF, dispatcher some, dashboard ainda mostra "Next"). Heartbeat SaaS
# (healthchecks.io, Sentry Cron) e o mesmo padrao com conta extra. O carimbo
# no KV ja e o ping. Este script e o dead man's switch local, fora do
# scheduler da Cloudflare.
#
# Uso:
#   .\scripts\check-macro-cron.ps1              # checa; se nativo mudo, reserva HTTP
#   .\scripts\check-macro-cron.ps1 -SoChecar    # so le /health, nao chama run-macro-cron
#
# Exit 0: nativo disparou nesta segunda, OU reserva HTTP regenerou o painel.
# Exit 1: /health ilegivel, OU nativo mudo e a reserva tambem falhou.
# Task Scheduler: exit, nunca return.

param(
    [switch]$SoChecar
)

$ErrorActionPreference = 'Continue'

$janelaHoras = 2
$url = 'https://szuchmacher.com.br/health'
$ua = 'Mozilla/5.0 (compatible; Szuchmacher-MacroWatchdog/1.0)'
$ALERT = Join-Path $PSScriptRoot 'send-alert-email.ps1'
$RESERVA = Join-Path $PSScriptRoot 'run-macro-cron.ps1'

$yanLogs = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'automacao-yan-os\logs'
$siteLogs = Join-Path $PSScriptRoot '..\logs'
foreach ($d in @($yanLogs, $siteLogs)) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}
$logDiario = Join-Path $yanLogs ("check-macro-cron_{0:yyyyMMdd}.log" -f (Get-Date))
$logCanonico = Join-Path $siteLogs 'check-macro-cron.log'

function Get-JanelaSegundaUtc {
    $now = [DateTimeOffset]::UtcNow
    $dow = [int]$now.DayOfWeek
    $daysFromMonday = ($dow + 6) % 7
    $mondayDate = $now.UtcDateTime.Date.AddDays(-$daysFromMonday)
    $esperado = [DateTimeOffset]::new(
        $mondayDate.Year, $mondayDate.Month, $mondayDate.Day,
        3, 0, 0, [TimeSpan]::Zero
    )
    if ($now -lt $esperado) {
        $esperado = $esperado.AddDays(-7)
    }
    [pscustomobject]@{
        Esperado   = $esperado
        EsperadoTs = $esperado.ToUnixTimeSeconds()
        Teto       = $esperado.AddHours($janelaHoras)
        TetoTs     = $esperado.AddHours($janelaHoras).ToUnixTimeSeconds()
    }
}

function Log-Linha([string]$linha) {
    $selo = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
    $txt = "$selo $linha"
    Write-Host $txt
    try { Add-Content -Path $logDiario -Value $txt -Encoding utf8 } catch { }
    try { Add-Content -Path $logCanonico -Value $txt -Encoding utf8 } catch { }
}

function Send-Alerta([string]$assunto, [string]$corpo) {
    if (-not (Test-Path $ALERT)) {
        Log-Linha "AVISO: send-alert-email.ps1 ausente, alerta nao enviado."
        return
    }
    try {
        # send-alert-email.ps1 devolve $true/$false desde 2026-08-27. Registrar o
        # resultado aqui: sem isso, alerta que nao sai nao aparece em log nenhum.
        $enviado = & $ALERT -Subject $assunto -Body $corpo
        if ($enviado) { Log-Linha 'Alerta por e-mail: enviado.' }
        else { Log-Linha 'Alerta por e-mail: NAO ENVIADO, ver saida de send-alert-email.ps1.' }
    } catch {
        Log-Linha "AVISO: falha ao disparar alerta: $($_.Exception.Message)"
    }
}

$janela = Get-JanelaSegundaUtc
Log-Linha ("=== INICIO watchdog macro cron soChecar={0} esperado={1:o} teto={2:o} ===" -f `
    [bool]$SoChecar, $janela.Esperado, $janela.Teto)

try {
    $r = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30 -Headers @{ 'User-Agent' = $ua }
} catch {
    Log-Linha "FAIL erro na leitura do /health: $($_.Exception.Message)"
    if (-not $SoChecar) {
        Send-Alerta '[Szuchmacher] Watchdog macro: /health ilegivel' `
            "check-macro-cron.ps1 nao leu /health em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`n$($_.Exception.Message)`nLog: $logDiario"
    }
    exit 1
}

$ult = $r.checks.macro_cron_last

if ($null -eq $ult -or $ult -is [string]) {
    Log-Linha "FAIL macro_cron_last sem registro de disparo: $ult"
    if ($SoChecar) { exit 1 }
} else {
    $ts = [int64]$ult.ts
    $cron = [string]$ult.cron
    $okNativo = ($ult.ok -eq $true)
    $resumo = "ts=$ts esperado=$($janela.EsperadoTs)..$($janela.TetoTs) cron='$cron' ok=$okNativo generated_at=$($ult.generated_at)"

    # Aceita as duas grafias do mesmo horario. "MON" e o que esta no wrangler.jsonc
    # hoje, "2" e o equivalente numerico na numeracao Quartz da Cloudflare, caso
    # alguem troque a forma no futuro sem mexer no horario.
    $cronEsperado = ($cron -match '^\s*0\s+3\s+\*\s+\*\s+(MON|2)\s*$')

    if ($ts -ge $janela.EsperadoTs -and $ts -lt $janela.TetoTs -and $cronEsperado -and $okNativo) {
        Log-Linha "OK disparo nativo desta segunda confirmado: $resumo"
        Log-Linha "=== FIM OK (nativo) ==="
        exit 0
    }

    Log-Linha "FAIL disparo nativo nao confirmado: $resumo"
    if ($SoChecar) {
        Log-Linha "=== FIM FAIL (-SoChecar, reserva nao disparada) ==="
        exit 1
    }
}

Send-Alerta '[Szuchmacher] Cron nativo do macro nao disparou, tentando reserva' `
    @"
O carimbo macro_cron_last em /health nao caiu na janela desta segunda ($($janela.Esperado.UtcDateTime.ToString('yyyy-MM-dd HH:mm')) UTC + $($janelaHoras)h).

Causas possiveis, em ordem de frequencia: o schedule deployado aponta para outro dia (a Cloudflare numera dia da semana como Quartz, 1 = domingo), o scheduler nao invocou o Worker, ou invocou e falhou antes de gravar.

Conferir com: npx wrangler triggers deploy --dry-run, ou GET /accounts/<acct>/workers/scripts/sz-sites/schedules.

Este computador vai tentar a reserva HTTP (run-macro-cron.ps1, header X-Cron-Secret).

Log: $logDiario
"@

if (-not (Test-Path $RESERVA)) {
    Log-Linha "FAIL reserva ausente: $RESERVA"
    exit 1
}

Log-Linha "reserva HTTP: chamando run-macro-cron.ps1"
& $RESERVA
$reservaExit = $LASTEXITCODE
if ($null -eq $reservaExit) { $reservaExit = 1 }

if ($reservaExit -eq 0) {
    # run-macro-cron.ps1 sai 0 em dois casos diferentes: regeneracao de verdade e
    # SOFT-OK, quando o macro_api devolve 429 por rate limit mas o cache publico
    # ainda esta fresco. Em 24/08/2026 este bloco registrou "reserva HTTP regenerou"
    # depois de quatro tentativas 429/503, o que e falso. Exit code nao distingue os
    # dois, entao o log passa a carregar o carimbo real do painel em vez da alegacao.
    $macroCache = '(nao lido)'
    try {
        $h = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30 -Headers @{ 'User-Agent' = $ua }
        if ($h.checks.macro_cache) { $macroCache = [string]$h.checks.macro_cache }
    } catch {
        $macroCache = "(falha ao reler /health: $($_.Exception.Message))"
    }
    Log-Linha "OK reserva HTTP saiu 0. Painel fresco, regeneracao nesta chamada nao garantida. macro_cache=$macroCache"
    Log-Linha "Nativo nao confirmado nesta janela. Proxima prova: segunda que vem."
    Log-Linha "=== FIM OK (reserva HTTP) ==="
    exit 0
}

Log-Linha "FAIL reserva HTTP tambem falhou exit=$reservaExit"
Log-Linha "=== FIM FAIL (nativo mudo + reserva falhou) ==="
Send-Alerta '[Szuchmacher] Watchdog macro: nativo mudo e reserva falhou' `
    "check-macro-cron.ps1: cron nativo sem rastro e run-macro-cron.ps1 saiu $reservaExit em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`nPainel da home pode envelhecer. Log: $logDiario"
exit 1
