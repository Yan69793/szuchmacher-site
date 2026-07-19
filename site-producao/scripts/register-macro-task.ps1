# register-macro-task.ps1 — Macro cron no Task Scheduler (segunda 09:00 BRT)
# Uso: .\scripts\register-macro-task.ps1 [-Remove] [-RunNow]

param(
    [switch]$Remove,
    [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Szuchmacher-MacroCron'
$Runner   = 'E:\Diretorio\Claude\Site\site-producao\scripts\run-macro-cron.ps1'
$Action   = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`""

if ($Remove) {
    schtasks /Delete /TN $TaskName /F 2>$null
    Write-Host "Tarefa removida: $TaskName" -ForegroundColor Yellow
    exit 0
}

schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
schtasks /Create /TN $TaskName /TR $Action /SC WEEKLY /D MON /ST 09:00 /F | Out-Null
Write-Host "Tarefa criada: $TaskName (segunda 09:00)" -ForegroundColor Green
Write-Host "Runner: $Runner"

schtasks /Query /TN $TaskName /FO LIST | Select-String 'Status|Hora da|Tarefa a ser'

if ($RunNow) {
    Write-Host "`nExecutando agora..." -ForegroundColor Cyan
    schtasks /Run /TN $TaskName
    Start-Sleep -Seconds 5
    schtasks /Query /TN $TaskName /FO LIST | Select-String 'ltimo resultado|ltima execu'
}