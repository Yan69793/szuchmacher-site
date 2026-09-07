# Registra os dois gatilhos do Radar Geopolitico no Task Scheduler.
# Domingo gera a semana seguinte. Segunda cedo e o fallback da mesma janela.

param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$nome = 'Szuchmacher-GeopoliticaAgent'
$script = Join-Path $PSScriptRoot 'run-geopolitica-agent.ps1'
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$gatilhos = @(
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 18:00),
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 08:00)
)

if ($Remove) {
    Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removida: $nome"
    return
}

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilhos -Principal $principal -Settings $settings -Description 'Radar Geopolitico semanal, domingo e fallback de segunda-feira.' -Force | Out-Null
Write-Host "Registrada: $nome, domingo 18:00 e segunda 08:00"
