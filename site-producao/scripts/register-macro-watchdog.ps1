# register-macro-watchdog.ps1
# Watchdog semanal do cron nativo do macro. Segunda 09:00 BRT.
# Nao recria Szuchmacher-MacroCron (aposentada 15/08, competia, 429).
#
# Uso:
#   .\scripts\register-macro-watchdog.ps1
#   .\scripts\register-macro-watchdog.ps1 -Remove
#   .\scripts\register-macro-watchdog.ps1 -SoChecarAgora
#
# -SoChecarAgora roda o script com -SoChecar (nao chama run-macro-cron).
# -RunNow e recusado de proposito: dispararia reserva HTTP contra producao.

param(
    [switch]$Remove,
    [switch]$SoChecarAgora
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$TaskName = 'Szuchmacher-MacroCronWatchdog'
$OneShot  = 'Szuchmacher-CheckMacroCron-2026-08-24'
$Runner   = 'E:\Diretorio\Claude\FREQUENTE\Site\site-producao\scripts\check-macro-cron.ps1'

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

# StartWhenAvailable: PC desligado na segunda dispara no proximo boot
# (o script calcula a segunda mais recente ja ocorrida, nao um timestamp fixo).
# ExecutionTimeLimit 20 min: run-macro-cron pode gastar 4x120s + backoff.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
    -DontStopOnIdleEnd

$principal = New-ScheduledTaskPrincipal `
    -UserId ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME) `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force `
    -Description 'Watchdog do cron nativo do macro. Se /health.macro_cron_last nao cair na janela desta segunda, dispara reserva HTTP e alerta por e-mail.' | Out-Null

Write-Host "Tarefa criada: $TaskName (segunda 09:00)" -ForegroundColor Green
Write-Host "Runner: $Runner"

$t = Get-ScheduledTask -TaskName $TaskName
Write-Host ("Estado: {0}  Dia: {1}  Hora: {2}  StartWhenAvailable: {3}" -f `
    $t.State,
    $t.Triggers[0].DaysOfWeek,
    ([datetime]$t.Triggers[0].StartBoundary).ToString('HH:mm'),
    $t.Settings.StartWhenAvailable)

$shot = Get-ScheduledTask -TaskName $OneShot -ErrorAction SilentlyContinue
if ($shot) {
    Unregister-ScheduledTask -TaskName $OneShot -Confirm:$false
    Write-Host "One-shot $OneShot removida (esta task semanal cobre 24/08 e as seguintes)." -ForegroundColor Yellow
}

if ($SoChecarAgora) {
    Write-Host "`nSmoke -SoChecar (nao chama run-macro-cron)..." -ForegroundColor Cyan
    & $Runner -SoChecar
    Write-Host ("exit do smoke: {0}" -f $LASTEXITCODE)
}
