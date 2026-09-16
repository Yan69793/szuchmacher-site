# Registra os dois gatilhos do Radar Geopolitico no Task Scheduler.
# Domingo gera a semana seguinte. Segunda cedo e o fallback da mesma janela.
#
# Rollback: antes de registrar o script exporta o XML da tarefa viva para
# scripts/scheduled-task-backup/. Para voltar ao estado anterior:
#   Register-ScheduledTask -Xml (Get-Content <backup>.xml -Raw) -TaskName $nome

param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$nome = 'Szuchmacher-GeopoliticaAgent'
$script = Join-Path $PSScriptRoot 'run-geopolitica-agent.ps1'
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$gatilhos = @(
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 18:00),
    # 08:30, nao 08:00: Szuchmacher-AgendaAgent tambem dispara segunda 08:00 e
    # termina no mesmo publicador (publicar-com-rollback.ps1). O lock la dentro
    # serializa se ainda colidir, mas nao ha motivo pra mirar o mesmo minuto.
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 08:30)
)

if ($Remove) {
    Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removida: $nome"
    return
}

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew
# StartWhenAvailable tem de ser True: com False o Windows descarta a janela
# perdida (maquina desligada ou em suspensao as 18:00 de domingo) e o Radar
# fica sem edicao ate a segunda. Medido em 16/09/2026: a tarefa viva estava com
# StartWhenAvailable=False, por isso a atribuicao explicita e a verificacao no fim.
$settings.StartWhenAvailable = $true

if (-not $Remove) {
    $pastaBackup = Join-Path $PSScriptRoot 'scheduled-task-backup'
    $xmlAtual = Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
    if ($xmlAtual) {
        New-Item -ItemType Directory -Force -Path $pastaBackup | Out-Null
        $arquivo = Join-Path $pastaBackup ("{0}_{1:yyyyMMdd_HHmmss}.xml" -f $nome, (Get-Date))
        Export-ScheduledTask -TaskName $nome | Set-Content -LiteralPath $arquivo -Encoding Unicode
        Write-Host "Backup do XML anterior: $arquivo"
    }
}

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilhos -Principal $principal -Settings $settings -Description 'Radar Geopolitico semanal, domingo e fallback de segunda-feira.' -Force | Out-Null

$verif = Get-ScheduledTask -TaskName $nome
$info = Get-ScheduledTaskInfo -TaskName $nome
Write-Host "Registrada: $nome, domingo 18:00 e segunda 08:30"
Write-Host ("Estado: {0} | StartWhenAvailable: {1} | Proxima execucao: {2} | Ultimo resultado: {3}" -f `
    $verif.State, $verif.Settings.StartWhenAvailable, $info.NextRunTime, $info.LastTaskResult)
if (-not $verif.Settings.StartWhenAvailable) { throw 'StartWhenAvailable nao ficou True no registro' }
if ($verif.State -eq 'Disabled') { throw 'tarefa registrada desabilitada' }
if ($verif.Triggers.Count -ne 2) { throw "esperados 2 gatilhos, registrados $($verif.Triggers.Count)" }
