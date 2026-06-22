# register-all-automation.ps1 — Registra todas as tarefas agendadas do site
# Uso: .\scripts\register-all-automation.ps1 [-RunNow]

param([switch]$RunNow)

$ErrorActionPreference = 'Stop'
$HERE = $PSScriptRoot

Write-Host "`n=== AUTOMAÇÃO SZUCHMACHER ===" -ForegroundColor Cyan

& (Join-Path $HERE 'register-agenda-task.ps1') @PSBoundParameters
Write-Host ''
& (Join-Path $HERE 'register-macro-task.ps1') @PSBoundParameters

Write-Host "`nTarefas ativas:" -ForegroundColor Green
schtasks /Query /FO TABLE | Select-String 'Szuchmacher'

Write-Host "`nResumo:" -ForegroundColor Cyan
Write-Host "  Szuchmacher-AgendaAgent  seg+qui 08:00  agenda-data.json + deploy FTP"
Write-Host "  Szuchmacher-MacroCron    segunda 09:00  macro_api.php?cron=1 no servidor"
Write-Host "  YanOS_Briefing           sexta 18:30     briefing YanOS (separado)"