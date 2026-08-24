# register-agents.ps1 — GUARDA (desativado em 2026-08-15)
#
# Este script registrava tres tasks (Szuchmacher-MacroAgent, Szuchmacher-AgendaAgent,
# Szuchmacher-LeadNurture) com configuracao legada: agenda sem domingo (MON,THU),
# LeadNurture diario e MacroAgent via cadeia cmd/c. Reexecuta-lo apagava e recriava
# as tasks canonicas com configuracao pior, reabilitando inclusive o LeadNurture
# que foi desabilitado de proposito em 08/08/2026.
#
# Registro canonico:
#   AgendaAgent: .\scripts\register-agenda-task.ps1   (dom+seg+qui 08:00, com rollback)
#   Macro:       cron do Worker (0 3 * * MON UTC). register-macro-task.ps1 so desabilita.
#   MacroAgent e LeadNurture pertencem ao projeto relatorio-diario-szuchmacher.
#
# Uso: .\scripts\register-agents.ps1 [-Remove]

param([switch]$Remove)

$ErrorActionPreference = 'Continue'

# ATENCAO: Szuchmacher-AgendaAgent NAO esta na lista de remocao de proposito.
# O nome colide com a task canonica deste projeto (register-agenda-task.ps1
# registra com esse mesmo nome, dom+seg+qui). Remover aqui derrubaria a task
# viva. Szuchmacher-MacroAgent TAMBEM NAO entra: e task viva (Ready no
# scheduler em 15/08/2026) do projeto relatorio-diario-szuchmacher, nao e
# legado deste repo. Só LeadNurture e legado deste projeto (desabilitada de
# proposito em 08/08/2026).
$legacy = @('Szuchmacher-LeadNurture')

if ($Remove) {
    foreach ($t in $legacy) {
        schtasks /Delete /TN $t /F 2>$null
        Write-Host "Removido: $t" -ForegroundColor Yellow
    }
    Write-Host "AgendaAgent (task canonica) preservada. Para registrar de novo, use register-agenda-task.ps1. Macro e cron do Worker, nao task local." -ForegroundColor DarkGray
    return
}

Write-Host "REGISTRO BLOQUEADO" -ForegroundColor Red
Write-Host "Este script foi desativado em 2026-08-15: ele recriava tasks com configuracao legada."
Write-Host "  AgendaAgent: .\scripts\register-agenda-task.ps1"
Write-Host "  Macro:        cron do Worker (register-macro-task.ps1 so desabilita a task local)"
Write-Host "  MacroAgent / LeadNurture: projeto relatorio-diario-szuchmacher (nao registrar aqui)"
Write-Host "Para apenas remover as tasks antigas: .\scripts\register-agents.ps1 -Remove"
