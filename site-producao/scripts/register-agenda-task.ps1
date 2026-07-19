# register-agenda-task.ps1 — Agenda Agent no Task Scheduler (seg + qui 08:00)
# Uso: .\scripts\register-agenda-task.ps1 [-Remove] [-RunNow]

param(
    [switch]$Remove,
    [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Szuchmacher-AgendaAgent'
$Runner   = 'E:\Diretorio\Claude\Site\site-producao\scripts\run-agenda-agent.ps1'
$Action   = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`""

if ($Remove) {
    schtasks /Delete /TN $TaskName /F 2>$null
    Write-Host "Tarefa removida: $TaskName" -ForegroundColor Yellow
    exit 0
}

schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
schtasks /Create /TN $TaskName /TR $Action /SC WEEKLY /D MON,THU /ST 08:00 /F | Out-Null
Write-Host "Tarefa criada: $TaskName (seg + qui 08:00)" -ForegroundColor Green
Write-Host "Runner: $Runner"

schtasks /Query /TN $TaskName /FO LIST | Select-String 'Status|Hora da|Tarefa a ser'

if ($RunNow) {
    Write-Host "`nExecutando agora..." -ForegroundColor Cyan
    schtasks /Run /TN $TaskName
    Start-Sleep -Seconds 3
    schtasks /Query /TN $TaskName /FO LIST | Select-String 'ltimo resultado|ltima execu'
}