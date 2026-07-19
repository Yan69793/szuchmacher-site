# register-agents.ps1 — Agenda Macro + Agenda + Lead Nurture no Task Scheduler
# Executar PowerShell como usuário normal (não precisa admin para tarefas próprias)
# Uso: .\scripts\register-agents.ps1 [-Remove]

param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$YAN = 'E:\Diretorio\Claude\Site\automacao-yan-os'
$PY = Join-Path $YAN 'venv\Scripts\python.exe'
$DEPLOY = 'E:\Diretorio\Claude\Site\site-producao\scripts\deploy-all.ps1'

$tasks = @(
    @{
        Name = 'Szuchmacher-MacroAgent'
        Day  = 'FRI'
        Time = '18:00'
        Cmd  = "cmd /c `"set YAN_OS_BATCH=1&& `"$PY`" `"$YAN\agents\macro_agent.py`" && powershell -File `"$DEPLOY`"`""
    },
    @{
        Name = 'Szuchmacher-AgendaAgent'
        Day  = 'MON,THU'
        Time = '08:00'
        Cmd  = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"E:\Diretorio\Claude\Site\site-producao\scripts\run-agenda-agent.ps1`""
    },
    @{
        Name = 'Szuchmacher-LeadNurture'
        Day  = 'Daily'
        Time = '10:00'
        Cmd  = "`"$PY`" `"$YAN\agents\lead_nurture_agent.py`""
    }
)

foreach ($t in $tasks) {
    if ($Remove) {
        schtasks /Delete /TN $t.Name /F 2>$null
        Write-Host "Removido: $($t.Name)" -ForegroundColor Yellow
        continue
    }
    schtasks /Delete /TN $t.Name /F 2>$null | Out-Null
    if ($t.Day -eq 'Daily') {
        schtasks /Create /TN $t.Name /TR $t.Cmd /SC DAILY /ST $t.Time /F | Out-Null
    } else {
        schtasks /Create /TN $t.Name /TR $t.Cmd /SC WEEKLY /D $t.Day /ST $t.Time /F | Out-Null
    }
    Write-Host "Agendado: $($t.Name) — $($t.Day) $($t.Time)" -ForegroundColor Green
}

if (-not $Remove) {
    Write-Host "`nVerificar: schtasks /Query /TN Szuchmacher-MacroAgent" -ForegroundColor Cyan
}