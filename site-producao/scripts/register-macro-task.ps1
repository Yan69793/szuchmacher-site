# register-macro-task.ps1, GUARDA (desativado 2026-08-15)
#
# O gatilho canonico do macro e o cron do Worker (0 3 * * MON UTC, segunda
# 00:00 BRT, forceRefresh interno). Esta task local (segunda 09:00) competia
# com o RefreshMacro do AgendaAgent (segunda 08:00), tomava 429 e acendia
# LastResult 1 a semana inteira. Nao registrar de novo como habilitada.
#
# Uso:
#   .\scripts\register-macro-task.ps1          # desabilita se existir
#   .\scripts\register-macro-task.ps1 -Remove  # apaga a task
# Refresh manual de emergencia: .\scripts\run-macro-cron.ps1
# Watchdog semanal (nao e esta task): .\scripts\register-macro-watchdog.ps1

param(
    [switch]$Remove,
    [switch]$RunNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$TaskName = 'Szuchmacher-MacroCron'

if ($Remove) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Tarefa removida: $TaskName" -ForegroundColor Yellow
    } else {
        Write-Host "Tarefa nao existia: $TaskName" -ForegroundColor DarkGray
    }
    return
}

if ($RunNow) {
    Write-Host "REGISTRO BLOQUEADO: -RunNow ignorado. Gatilho canonico e o cron do Worker." -ForegroundColor Yellow
}

$t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($t) {
    if ($t.State -ne 'Disabled') {
        Disable-ScheduledTask -TaskName $TaskName | Out-Null
        Write-Host "Tarefa desabilitada: $TaskName" -ForegroundColor Yellow
    } else {
        Write-Host "Tarefa ja desabilitada: $TaskName" -ForegroundColor DarkGray
    }
} else {
    Write-Host "Tarefa nao existe, nao recriar. Gatilho canonico: cron do Worker 0 3 * * MON UTC." -ForegroundColor DarkGray
}

