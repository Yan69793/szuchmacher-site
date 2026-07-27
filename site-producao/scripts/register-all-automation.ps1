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
Write-Host "  Szuchmacher-AgendaAgent  dom+seg+qui 08:00  agenda-data.json + publicar-com-rollback"
Write-Host "  Szuchmacher-MacroCron    segunda 09:00      macro_api.php?cron=1 no Worker"
Write-Host ""
Write-Host "Domingo publica a semana seguinte; segunda e quinta so refrescam a mesma janela." -ForegroundColor DarkGray
Write-Host "Deploy e Cloudflare Workers desde 17/06/2026. O FTP sobrou para rollback." -ForegroundColor DarkGray