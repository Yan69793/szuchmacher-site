# register-macro-task.ps1, Macro cron no Task Scheduler (segunda 09:00 BRT)
# Uso: .\scripts\register-macro-task.ps1 [-Remove] [-RunNow]
#
# Register-ScheduledTask no lugar de schtasks porque schtasks nao expoe
# StartWhenAvailable, e sem isso uma maquina desligada segunda 09:00 perde
# a semana inteira.

param(
    [switch]$Remove,
    [switch]$RunNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$TaskName = 'Szuchmacher-MacroCron'
$Runner   = 'E:\Diretorio\Claude\FREQUENTE\Site\site-producao\scripts\run-macro-cron.ps1'

if ($Remove) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Tarefa removida: $TaskName" -ForegroundColor Yellow
    } else {
        Write-Host "Tarefa nao existia: $TaskName" -ForegroundColor DarkGray
    }
    return
}

if (-not (Test-Path $Runner)) { throw "Runner nao encontrado: $Runner" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $Runner)

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '09:00'

# StartWhenAvailable: PC desligado na segunda 09:00 dispara no proximo boot.
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -DontStopOnIdleEnd

$principal = New-ScheduledTaskPrincipal `
    -UserId ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME) `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force `
    -Description 'Dispara macro_api.php?cron=1 para regenerar macro_data.json.' | Out-Null

Write-Host "Tarefa criada: $TaskName (segunda 09:00)" -ForegroundColor Green
Write-Host "Runner: $Runner"

$t = Get-ScheduledTask -TaskName $TaskName
Write-Host ("Estado: {0}  StartWhenAvailable: {1}" -f $t.State, $t.Settings.StartWhenAvailable)

if ($RunNow) {
    Write-Host "`nExecutando agora..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 5
    $i = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host ("LastRunTime: {0}  LastTaskResult: {1}" -f $i.LastRunTime, $i.LastTaskResult)
}
