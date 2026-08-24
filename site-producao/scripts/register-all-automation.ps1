# register-all-automation.ps1 — Registra todas as tarefas agendadas do site
# Uso: .\scripts\register-all-automation.ps1 [-RunNow]

param([switch]$RunNow)

$ErrorActionPreference = 'Stop'
$HERE = $PSScriptRoot

Write-Host "`n=== AUTOMAÇÃO SZUCHMACHER ===" -ForegroundColor Cyan

& (Join-Path $HERE 'register-agenda-task.ps1') @PSBoundParameters
Write-Host ''
# MacroCron local esta aposentado (2026-08-15). A chamada abaixo so desabilita
# se a task ainda existir. Nao passa -RunNow: o gatilho do macro e o cron do Worker.
& (Join-Path $HERE 'register-macro-task.ps1')
Write-Host ''
# Watchdog semanal: se o cron nativo nao deixar carimbo em /health, reserva HTTP.
# Sem -RunNow: RunNow do all-automation e da agenda, nao da reserva de macro.
& (Join-Path $HERE 'register-macro-watchdog.ps1')

Write-Host "`nTarefas ativas:" -ForegroundColor Green
schtasks /Query /FO TABLE | Select-String 'Szuchmacher'

Write-Host "`nResumo:" -ForegroundColor Cyan
Write-Host "  Szuchmacher-AgendaAgent         dom+seg+qui 08:00  agenda-data.json + publicar-com-rollback"
Write-Host "  Macro (Worker cron)             segunda 00:00 BRT  wrangler triggers 0 3 * * MON UTC"
Write-Host "  Szuchmacher-MacroCronWatchdog   segunda 09:00      checa carimbo; reserva HTTP se nativo mudo"
Write-Host "  Szuchmacher-MacroCron           DESABILITADA       competia e gerava 429/alarme falso"
Write-Host ""
Write-Host "Domingo publica a semana seguinte; segunda e quinta so refrescam a mesma janela." -ForegroundColor DarkGray
Write-Host "Deploy e Cloudflare Workers desde 17/06/2026. O FTP sobrou para rollback." -ForegroundColor DarkGray