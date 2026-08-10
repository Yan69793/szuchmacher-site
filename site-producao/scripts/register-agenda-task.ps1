# register-agenda-task.ps1, Agenda Agent no Task Scheduler (dom + seg + qui 08:00)
# Uso: .\scripts\register-agenda-task.ps1 [-Remove] [-RunNow]
#
# Domingo e o gatilho que importa: agenda_agent.py (janela_seg_sex) devolve a
# segunda SEGUINTE quando roda no fim de semana, entao a execucao de domingo
# publica a semana que vai comecar. Sem ela, de sexta a noite ate segunda 08:00
# o site servia a semana ja encerrada e o painel caia no rotulo
# "Semana de referencia", que e como o frontend sinaliza dado vencido.
#
# Segunda e quinta continuam: regeram a MESMA janela com o calendario do IBGE
# atualizado, e cobrem o domingo em que a maquina estiver desligada.
#
# Register-ScheduledTask no lugar de schtasks porque schtasks nao expoe
# StartWhenAvailable nem limite de execucao, e os dois importam aqui.

param(
    [switch]$Remove,
    [switch]$RunNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$TaskName = 'Szuchmacher-AgendaAgent'
$Runner   = 'E:\Diretorio\Claude\Site\site-producao\scripts\run-agenda-agent.ps1'

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

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday, Monday, Thursday -At '08:00'

# StartWhenAvailable: PC desligado no domingo dispara no proximo boot em vez de
# perder a semana inteira.
# ExecutionTimeLimit 30 min: publicar-com-rollback.ps1 faz deploy, espera
# propagar, roda 27 checagens (uma com timeout de 90 s) e pode ainda reverter e
# revalidar. O padrao de 3 dias do Windows nao protege de nada; 30 min protege.
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -DontStopOnIdleEnd `
    -DisallowStartIfOnBatteries $false

# LogonType Interactive de proposito: o wrangler le as credenciais Cloudflare do
# perfil do usuario. Rodar como SYSTEM registraria a tarefa e quebraria o deploy.
$principal = New-ScheduledTaskPrincipal `
    -UserId ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME) `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force `
    -Description 'Gera agenda-data.json (semana seguinte no domingo) e publica com validacao e rollback.' | Out-Null

Write-Host "Tarefa criada: $TaskName (dom + seg + qui 08:00)" -ForegroundColor Green
Write-Host "Runner: $Runner"

$t = Get-ScheduledTask -TaskName $TaskName
Write-Host ("Estado: {0}  Dias: {1}  Hora: {2}  StartWhenAvailable: {3}" -f `
    $t.State,
    ($t.Triggers[0].DaysOfWeek),
    ([datetime]$t.Triggers[0].StartBoundary).ToString('HH:mm'),
    $t.Settings.StartWhenAvailable)

if ($RunNow) {
    Write-Host "`nExecutando agora..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 5
    $i = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host ("LastRunTime: {0}  LastTaskResult: {1}" -f $i.LastRunTime, $i.LastTaskResult)
    Write-Host "A tarefa continua rodando em segundo plano. Log:" -ForegroundColor DarkGray
    Write-Host ("  E:\Diretorio\Claude\Site\automacao-yan-os\logs\agenda_scheduled_{0:yyyyMMdd}.log" -f (Get-Date))
}
